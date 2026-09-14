import type { CartItem } from '@/contexts/CartContext';
import type { DatabaseFlavor, DatabaseHookah, DatabaseRecommendedMix } from '@/types/database';
import type { FavoriteCombo } from '@/services/favoritesService';
import { comboIdForCustom, comboIdForMix } from '@/services/comboId';
import { ADDON_PRICES } from '@/services/addons';

/**
 * Turns a saved favourite back into an orderable cart item, resolved against
 * the CURRENT menu. Deliberately free of Firebase imports, like comboId.ts
 * and orderItem.ts, so it unit-tests directly - see tests/reorderService.test.ts.
 *
 * Re-pricing, never trusting a stored price, is the whole point: a favourite
 * stores no price (favoritesService.ts:35-39) because a stored one would let
 * a saved favourite quietly undercharge after a price rise. Every branch
 * below prices from the `menu` it is given, never from `favorite`.
 */

export interface MenuSnapshot {
  hookahs: DatabaseHookah[];
  flavors: DatabaseFlavor[];
  recommendedMixes: DatabaseRecommendedMix[];
}

export type ReorderResolution =
  | { status: 'ok'; item: Omit<CartItem, 'quantity'> }
  // Human names (never bare ids, except when a document is gone and there is
  // no name left to show) of everything that stopped the favourite from
  // resolving. Nothing is ever silently dropped - if anything is missing,
  // the whole build is 'unavailable'.
  | { status: 'unavailable'; missing: string[] };

const MIX_CATEGORY_LABELS = {
  virginia: 'Virginia',
  darkblend: 'Darkblend',
  mix: 'Mix',
} as const;

type MixCategory = keyof typeof MIX_CATEGORY_LABELS;

// toggleMixFavorite in Index.tsx never stores a category on a mix favourite
// today - it is chosen later, at order time via confirmMixToCart's dialog -
// so this falls back to 'mix' in the common case. A stored value is still
// honoured when present, and anything unrecognised falls back too.
const resolveMixCategory = (tobaccoType?: string): MixCategory => (
  tobaccoType === 'virginia' || tobaccoType === 'darkblend' || tobaccoType === 'mix'
    ? tobaccoType
    : 'mix'
);

const resolveMix = (
  favorite: FavoriteCombo,
  menu: MenuSnapshot,
  table: string,
): ReorderResolution => {
  const mix = menu.recommendedMixes.find((candidate) => candidate.id === favorite.mixId && candidate.isActive);
  if (!mix) {
    return { status: 'unavailable', missing: [favorite.label] };
  }

  const category = resolveMixCategory(favorite.tobaccoType);

  return {
    status: 'ok',
    item: {
      id: `mix-${mix.id}-${category}`,
      type: 'mix',
      name: `${mix.name} (${MIX_CATEGORY_LABELS[category]})`,
      price: mix.price,
      image: mix.mainImage,
      comboId: comboIdForMix(mix.id),
      // Same expression confirmMixToCart uses: the category lives in `name`,
      // not in the combo id, so filing this under `name` instead would
      // rewrite the label on every re-order.
      comboLabel: mix.name,
      mixId: mix.id,
      tobaccoType: category,
      table,
    },
  };
};

// `favorite.flavorIds` entries are `{flavorDocId}:{variantType}` - see
// comboId.ts:32-38. Split defensively: an entry with no ':' has no
// variantType, which then simply never matches any flavour's
// compatibleTobaccoTypes below, so it resolves as missing rather than
// throwing.
const parseFlavorId = (raw: string): { flavorDocId: string; variantType: string } => {
  const separator = raw.indexOf(':');
  return separator === -1
    ? { flavorDocId: raw, variantType: '' }
    : { flavorDocId: raw.slice(0, separator), variantType: raw.slice(separator + 1) };
};

interface ResolvedFlavor {
  flavorDocId: string;
  variantType: string;
  flavor: DatabaseFlavor;
}

type FlavorLookup =
  | { ok: true; resolved: ResolvedFlavor }
  | { ok: false; missingName: string };

const resolveFlavorEntry = (raw: string, menu: MenuSnapshot): FlavorLookup => {
  const { flavorDocId, variantType } = parseFlavorId(raw);
  const flavor = menu.flavors.find((candidate) => candidate.id === flavorDocId);

  // No document at all - there is no name left to show, so the raw id
  // stands in for it.
  if (!flavor) {
    return { ok: false, missingName: flavorDocId };
  }
  if (!flavor.isActive || !flavor.compatibleTobaccoTypes.some((type) => type === variantType)) {
    return { ok: false, missingName: flavor.name };
  }
  return { ok: true, resolved: { flavorDocId, variantType, flavor } };
};

/**
 * `favorite.flavorPercentages` may be keyed one of two ways:
 *  - `{flavorDocId}:{variantType}` - the current shape, matching `flavorIds`
 *    (Index.tsx now writes favourites this way; see the fix at its
 *    finalizeAddToCart / setLastBuild call site).
 *  - the UI's old `variantId` shape - a bare `flavorDocId` for a
 *    single-compatibility flavour, `{flavorDocId}-{variantType}` for a
 *    multi-compatibility one (comboId.ts:32-38). Favourites already saved to
 *    the live production database were written this way, before this fix,
 *    and there is no migration sweep for them - they must keep resolving.
 * Both shapes are tried, current first.
 */
const lookupPercentage = (
  source: Record<string, number>,
  flavorDocId: string,
  variantType: string,
): number | undefined => (
  source[`${flavorDocId}:${variantType}`]
  ?? source[`${flavorDocId}-${variantType}`]
  ?? source[flavorDocId]
);

const resolveCustom = (
  favorite: FavoriteCombo,
  menu: MenuSnapshot,
  table: string,
): ReorderResolution => {
  // Malformed/legacy data with neither field set can't be rebuilt at all.
  if (!favorite.hookahId || !favorite.tobaccoType) {
    return { status: 'unavailable', missing: [favorite.label] };
  }

  const missing: string[] = [];

  const hookah = menu.hookahs.find((candidate) => candidate.id === favorite.hookahId && candidate.isActive);
  if (!hookah) {
    // FavoriteCombo has no field carrying the bare hookah name (only
    // `label`, the combined "hookah · flavours" string) - the id stands in,
    // same as a gone flavour document below.
    missing.push(favorite.hookahId);
  }

  const flavorIds = favorite.flavorIds ?? [];
  const lookups = flavorIds.map((raw) => resolveFlavorEntry(raw, menu));
  // Explicit type predicates rather than `if (!lookup.ok)`: this project's
  // tsconfig runs with strictNullChecks off, and TS's control-flow narrowing
  // of a negated boolean discriminant is unreliable without it - it silently
  // leaves `lookup` typed as the full union, so `.missingName` doesn't
  // typecheck on the `ok: false` branch. An `is` predicate sidesteps that.
  const isMissingLookup = (lookup: FlavorLookup): lookup is Extract<FlavorLookup, { ok: false }> => !lookup.ok;
  const isResolvedLookup = (lookup: FlavorLookup): lookup is Extract<FlavorLookup, { ok: true }> => lookup.ok;

  lookups.filter(isMissingLookup).forEach((lookup) => missing.push(lookup.missingName));

  // Anything missing fails the whole build - never silently drop part of
  // someone's saved combo.
  if (missing.length > 0 || !hookah) {
    return { status: 'unavailable', missing };
  }

  const resolvedFlavors = lookups.filter(isResolvedLookup).map((lookup) => lookup.resolved);
  const flavorNames = resolvedFlavors.map((entry) => entry.flavor.name);

  let price = hookah.price || 0;
  if (favorite.hasLED) price += ADDON_PRICES.hasLED;
  if (favorite.hasColoredWater) price += ADDON_PRICES.hasColoredWater;
  if (favorite.hasFruits) price += ADDON_PRICES.hasFruits;
  if (favorite.hasAlcohol) price += ADDON_PRICES.hasAlcohol;

  let flavorPercentages: Record<string, number> | undefined;
  if (favorite.flavorPercentages) {
    const remapped: Record<string, number> = {};
    resolvedFlavors.forEach(({ flavorDocId, variantType }) => {
      const value = lookupPercentage(favorite.flavorPercentages!, flavorDocId, variantType);
      if (value !== undefined) remapped[`${flavorDocId}:${variantType}`] = value;
    });
    if (Object.keys(remapped).length > 0) flavorPercentages = remapped;
  }

  return {
    status: 'ok',
    item: {
      id: `custom-${Date.now()}`,
      type: 'custom',
      name: 'Custom Mix',
      price,
      image: hookah.image,
      comboId: comboIdForCustom(hookah.id, favorite.tobaccoType, flavorIds),
      // Same expression finalizeAddToCart uses for a fresh build of the same
      // hookah + flavours, so a re-ordered item's rating files under the
      // same label as the original build would have.
      comboLabel: `${hookah.name} · ${flavorNames.join(', ')}`,
      hookahId: hookah.id,
      flavorIds,
      hookah: hookah.name,
      tobaccoType: favorite.tobaccoType as CartItem['tobaccoType'],
      tobaccoStrength: favorite.tobaccoStrength,
      flavors: flavorNames,
      flavorPercentages,
      table,
      hasLED: favorite.hasLED,
      hasColoredWater: favorite.hasColoredWater,
      hasAlcohol: favorite.hasAlcohol,
      hasFruits: favorite.hasFruits,
    },
  };
};

export const resolveReorder = (
  favorite: FavoriteCombo,
  menu: MenuSnapshot,
  table: string,
): ReorderResolution => (
  favorite.kind === 'mix' ? resolveMix(favorite, menu, table) : resolveCustom(favorite, menu, table)
);
