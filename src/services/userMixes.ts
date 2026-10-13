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

/**
 * The public copy of an approved mix: communityMixes/{id}, same id as the
 * submission. Deliberately no creatorUid - a uid is all a friend request
 * needs, so publishing it would bypass a customer's choice to stay out of
 * email discovery. firestore.rules pins this shape.
 */
export interface CommunityMix {
  id: string;
  name: string;
  description?: string;
  creatorName: string;
  hookahId: string;
  tobaccoType: string;
  flavorIds: string[];
  tobaccoStrength?: number;
  flavorPercentages?: Record<string, number>;
  withIce?: boolean;
  approvedAt?: Date;
}

/** What both a submission and its public copy carry: enough to describe and order it. */
export type UserMixBuild = Pick<
  CommunityMix,
  'name' | 'hookahId' | 'tobaccoType' | 'flavorIds' | 'tobaccoStrength' | 'flavorPercentages' | 'withIce'
>;

/**
 * The public projection of a submission. Built field by field, never by
 * spread, so creatorUid - and anything else added to UserMix later - can
 * never ride along, and no undefined key reaches Firestore.
 */
export const toCommunityMix = (mix: UserMix): CommunityMix => {
  const community: CommunityMix = {
    id: mix.id,
    name: mix.name,
    creatorName: mix.creatorName,
    hookahId: mix.hookahId,
    tobaccoType: mix.tobaccoType,
    flavorIds: mix.flavorIds,
  };
  if (mix.description) community.description = mix.description;
  if (mix.tobaccoStrength !== undefined) community.tobaccoStrength = mix.tobaccoStrength;
  if (mix.flavorPercentages) community.flavorPercentages = mix.flavorPercentages;
  if (mix.withIce !== undefined) community.withIce = mix.withIce;
  return community;
};

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
export const userMixToFavorite = (mix: UserMixBuild): FavoriteCombo => {
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

/**
 * "Khalil Mamoon · Mint, Lemon", for the admin queue and the menu card.
 *
 * Defensive on purpose: it renders documents other people wrote. A bad
 * entry that slipped past older rules must not white-screen the moderation
 * tab, because that tab is the only place an admin can reject it.
 */
export const describeUserMixBuild = (
  mix: Pick<CommunityMix, 'hookahId' | 'flavorIds'>,
  hookahs: Pick<DatabaseHookah, 'id' | 'name'>[],
  flavors: Pick<DatabaseFlavor, 'id' | 'name'>[],
): string => {
  const hookah = hookahs.find((h) => h.id === mix.hookahId)?.name ?? String(mix.hookahId);
  const entries: unknown[] = Array.isArray(mix.flavorIds) ? mix.flavorIds : [];
  const names = entries.map((entry) => {
    const docId = String(entry).split(':')[0];
    return flavors.find((f) => f.id === docId)?.name ?? docId;
  });
  return `${hookah} · ${names.join(', ')}`;
};

/**
 * The rest of the recipe, for the admin to read before approving:
 * ["Strength 4", "With ice", "Mint 60%, Lemon 40%"]. A part the mix does not
 * carry is left out. Defensive for the same reason as describeUserMixBuild.
 */
export const describeUserMixRecipe = (
  mix: Pick<CommunityMix, 'tobaccoStrength' | 'withIce' | 'flavorPercentages'>,
  flavors: Pick<DatabaseFlavor, 'id' | 'name'>[],
): string[] => {
  const lines: string[] = [];
  if (typeof mix.tobaccoStrength === 'number') lines.push(`Strength ${mix.tobaccoStrength}`);
  if (typeof mix.withIce === 'boolean') lines.push(mix.withIce ? 'With ice' : 'No ice');
  const percentages = mix.flavorPercentages && typeof mix.flavorPercentages === 'object'
    ? Object.entries(mix.flavorPercentages).filter(([, value]) => typeof value === 'number')
    : [];
  if (percentages.length > 0) {
    lines.push(percentages.map(([key, value]) => {
      const docId = String(key).split(':')[0];
      return `${flavors.find((f) => f.id === docId)?.name ?? docId} ${value}%`;
    }).join(', '));
  }
  return lines;
};
