/**
 * Hookah addon catalogue: LED, coloured water, alcohol, fruits.
 *
 * Lives in its own module, not in Index.tsx where it was defined before, so
 * that src/services/reorderService.ts can price a re-ordered favourite's
 * addons without a service importing a page. Both Index.tsx (the builder)
 * and reorderService.ts (the re-order resolver) import ADDON_PRICES from
 * here, so the two price lists can never drift apart.
 */
export const ADDONS = [
  { key: 'hasLED' as const, label: 'LED Hookah', price: 30, image: '/img/led.webp' },
  { key: 'hasColoredWater' as const, label: 'Colored Water', price: 10, image: '/img/colorant.webp' },
  { key: 'hasAlcohol' as const, label: 'Alcohol in Vase', price: 40, image: '/img/alcool.webp' },
  { key: 'hasFruits' as const, label: 'Fruits in Vase', price: 20, image: '/img/fruits.webp' },
] as const;

export type AddonKey = typeof ADDONS[number]['key'];

export const ADDON_PRICES = Object.fromEntries(
  ADDONS.map((addon) => [addon.key, addon.price]),
) as Record<AddonKey, number>;
