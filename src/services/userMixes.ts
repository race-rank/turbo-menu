import { comboIdForCustom } from '@/services/comboId';
import type { FavoriteCombo } from '@/services/favoritesService';
import type { DatabaseFlavor, DatabaseHookah } from '@/types/database';

/** Bounds mirrored in firestore.rules - change both or neither. */
export const USER_MIX_NAME_MAX = 40;
export const USER_MIX_DESCRIPTION_MAX = 140;

export type UserMixStatus = 'pending' | 'approved' | 'rejected';

export interface UserMix {
  id: string;
  creatorUid: string;
  creatorName: string;
  name: string;
  description?: string;
  hookahId: string;
  tobaccoType: string;
  flavorIds: string[];
  tobaccoStrength?: number;
  flavorPercentages?: Record<string, number>;
  withIce?: boolean;
  status: UserMixStatus;
  createdAt?: Date;
  reviewedAt?: Date;
}

export type UserMixSubmission = Omit<UserMix, 'id' | 'status' | 'createdAt' | 'reviewedAt'>;

export interface UserMixInput {
  name: string;
  description?: string;
}

/** A message for the customer, or null when the input is acceptable. */
export const validateUserMixInput = ({ name, description }: UserMixInput): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return 'Give your mix a name.';
  if (trimmed.length > USER_MIX_NAME_MAX) return `Keep the name under ${USER_MIX_NAME_MAX + 1} characters.`;
  if ((description ?? '').trim().length > USER_MIX_DESCRIPTION_MAX) {
    return `Keep the description under ${USER_MIX_DESCRIPTION_MAX + 1} characters.`;
  }
  return null;
};

/**
 * Turns a saved custom favourite into a submission. Add-ons (LED, coloured
 * water, alcohol, fruit) are left out: they are priced extras a customer
 * chooses at the table, not part of the recipe being shared.
 */
export const userMixFromFavorite = (
  favorite: FavoriteCombo,
  input: UserMixInput,
  creator: { uid: string; displayName: string },
): UserMixSubmission | null => {
  if (favorite.kind !== 'custom' || !favorite.hookahId || !favorite.tobaccoType || !favorite.flavorIds?.length) {
    return null;
  }
  const submission: UserMixSubmission = {
    creatorUid: creator.uid,
    creatorName: creator.displayName,
    name: input.name.trim(),
    hookahId: favorite.hookahId,
    tobaccoType: favorite.tobaccoType,
    flavorIds: favorite.flavorIds,
  };
  const description = input.description?.trim();
  if (description) submission.description = description;
  if (favorite.tobaccoStrength !== undefined) submission.tobaccoStrength = favorite.tobaccoStrength;
  if (favorite.flavorPercentages) submission.flavorPercentages = favorite.flavorPercentages;
  if (favorite.withIce !== undefined) submission.withIce = favorite.withIce;
  return submission;
};

/**
 * Shapes a community mix for resolveReorder. The comboId is the ordinary
 * custom-build id, so a customer who orders it, favourites it or rates it
 * lands on the same combo as if they had built it by hand.
 */
export const userMixToFavorite = (mix: UserMix): FavoriteCombo => {
  const favorite: FavoriteCombo = {
    comboId: comboIdForCustom(mix.hookahId, mix.tobaccoType, mix.flavorIds),
    label: mix.name,
    kind: 'custom',
    hookahId: mix.hookahId,
    tobaccoType: mix.tobaccoType,
    flavorIds: mix.flavorIds,
  };
  if (mix.tobaccoStrength !== undefined) favorite.tobaccoStrength = mix.tobaccoStrength;
  if (mix.flavorPercentages) favorite.flavorPercentages = mix.flavorPercentages;
  if (mix.withIce !== undefined) favorite.withIce = mix.withIce;
  return favorite;
};

/** "Khalil Mamoon · Mint, Lemon", for the admin queue and the menu card. */
export const describeUserMixBuild = (
  mix: Pick<UserMix, 'hookahId' | 'flavorIds'>,
  hookahs: Pick<DatabaseHookah, 'id' | 'name'>[],
  flavors: Pick<DatabaseFlavor, 'id' | 'name'>[],
): string => {
  const hookah = hookahs.find((h) => h.id === mix.hookahId)?.name ?? mix.hookahId;
  const names = mix.flavorIds.map((variantId) => {
    const docId = variantId.split(':')[0];
    return flavors.find((f) => f.id === docId)?.name ?? docId;
  });
  return `${hookah} · ${names.join(', ')}`;
};
