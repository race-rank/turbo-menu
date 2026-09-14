/**
 * Builds the human-readable flavour list and combo label for a custom build.
 *
 * Both the order path (Index.tsx's finalizeAddToCart) and the re-order path
 * (reorderService.ts's resolveCustom) must produce the identical string for
 * the identical build - a favourite's `comboId` intentionally excludes
 * flavour percentages, ice and the mix variant tag (see comboId.ts), so
 * `comboLabel` is the only place a rating or a favourites list distinguishes
 * "Mint 60%, Lemon 40%" from "Mint, Lemon". Before this module existed, each
 * caller re-implemented the same formatting rules separately and drifted:
 * Index.tsx appended percentages and variant tags, reorderService.ts used
 * bare flavour names. Import this from both instead of re-deriving it.
 *
 * Deliberately free of Firebase/React imports, like comboId.ts, so it unit
 * tests directly and a service may import it (a page must never be imported
 * by a service).
 */

export interface FlavorDisplayEntry {
  name: string;
  // Present for a resolved flavour; only rendered as a "(Virginia)" /
  // "(Darkblend)" tag when the build's tobaccoType is 'mix' - a virginia- or
  // darkblend-only build never shows it, since there is only one type to
  // disambiguate from.
  variantType?: string;
  // Undefined when no split is known for this flavour (see reorderService's
  // caller for when that happens on re-order).
  percentage?: number;
}

/**
 * Same rule finalizeAddToCart uses: percentages are only worth showing once
 * there is more than one flavour to distinguish, or ice is sharing the bowl
 * with them - a single flavour with no ice is unambiguously the whole bowl.
 */
const shouldShowPercentages = (flavorCount: number, withIce: boolean): boolean => (
  flavorCount >= 2 || withIce
);

const capitalize = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

/**
 * `icePercentage` is only appended when `withIce` is true. When it is true
 * but the percentage is unknown (a re-ordered favourite that never stored
 * enough to reconstruct the split - see resolveCustom), the entry reads
 * "Ice" with no number rather than inventing one that might be wrong.
 */
export const buildFlavorDisplayNames = (
  flavors: FlavorDisplayEntry[],
  tobaccoType: string,
  withIce: boolean,
  icePercentage?: number,
): string[] => {
  const showPct = shouldShowPercentages(flavors.length, withIce);
  const names = flavors.map(({ name, variantType, percentage }) => {
    const showVariant = tobaccoType === 'mix' && !!variantType;
    const base = showVariant ? `${name} (${capitalize(variantType!)})` : name;
    return showPct && percentage != null ? `${base} ${percentage}%` : base;
  });
  if (withIce) {
    names.push(icePercentage != null ? `Ice (${icePercentage}%)` : 'Ice');
  }
  return names;
};

/**
 * `name` on a custom build's cart item is always the literal 'Custom Mix', so
 * this is the only human-readable identifier - filed under a rating and shown
 * on a favourites list, a friend's profile, and the re-order button.
 */
export const buildComboLabel = (hookahName: string, flavorNames: string[]): string => (
  `${hookahName} · ${flavorNames.join(', ')}`
);
