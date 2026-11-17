import type { CartItem } from '@/contexts/CartContext';
import { fnv1a64, truncateLabel } from '@/services/comboId';
import type { DatabaseHookah, FeaturedHookah } from '@/types/database';

/**
 * Bound on the promo line. The menu snapshot is the hottest read path in the
 * app - every customer downloads it on every visit - and this project has
 * already had documents bloat to 91% of the 1MiB limit by carrying unbounded
 * data. Enforced when writing, in menuService.setFeaturedHookah.
 */
export const MAX_PROMO_TEXT_LENGTH = 140;

/**
 * Normalise a promo line for storage: trimmed, capped, and absent rather than
 * empty.
 *
 * Lives here rather than inline in menuService.setFeaturedHookah so the cap -
 * the one hard backstop stopping unbounded text reaching the public menu
 * snapshot - sits in the tested seam. The Input's maxLength is a courtesy to
 * the admin; this is the guarantee.
 */
export const clampPromoText = (promoText?: string): string | undefined => {
  const trimmed = promoText?.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= MAX_PROMO_TEXT_LENGTH
    ? trimmed
    : trimmed.slice(0, MAX_PROMO_TEXT_LENGTH);
};

export interface ResolvedHookahOfTheDay {
  hookah: DatabaseHookah;
  promoText?: string;
}

/**
 * Turn the stored pointer into something renderable, or nothing.
 *
 * Takes the hookah list rather than MenuData on purpose: MenuData lives in
 * menuService, which imports Firebase, and this module stays pure so it can be
 * unit tested without an emulator - the same reason comboId.ts and
 * reorderService.ts are shaped this way.
 *
 * Returns null rather than repairing the pointer when it dangles. A hookah
 * deactivated today may be switched back on tomorrow, so clearing the
 * promotion on the admin's behalf would be a surprise, not a kindness.
 */
export const resolveHookahOfTheDay = (
  hookahs: DatabaseHookah[],
  featured: FeaturedHookah | undefined,
): ResolvedHookahOfTheDay | null => {
  if (!featured?.hookahId) return null;

  const hookah = hookahs.find((candidate) => candidate.id === featured.hookahId);
  if (!hookah || !hookah.isActive) return null;

  const promoText = featured.promoText?.trim();
  return promoText ? { hookah, promoText } : { hookah };
};

/**
 * The cart line for ordering the hookah of the day straight from its card.
 *
 * Ordered the way a recommended mix like Turbo Mix is - one tap, one line, the
 * bar prepares it - not by dropping the customer into the custom builder. Bars
 * use the promo line for the day's recipe ("Red Tea | Blackberry | ..."), which
 * is free text with no flavour ids behind it, so the builder could never
 * reproduce it. The recipe rides in the name, where the cart, the customer's
 * order tracker and the staff dashboard all already show a mix's name.
 *
 * The combo id covers the promo line as well as the hookah: the same tier with
 * a new recipe tomorrow is a different combo, and must not inherit today's
 * ratings. `hotd:` is its own namespace, so it can never collide with a mix or
 * a custom build, and nowSmokingItemToFavorite treats it as not re-orderable.
 */
export const hookahOfTheDayCartItem = (
  { hookah, promoText }: ResolvedHookahOfTheDay,
  tobaccoType: CartItem['tobaccoType'] | null,
  table: string,
): Omit<CartItem, 'quantity'> => {
  const hash = fnv1a64(`${hookah.id}|${promoText ?? ''}`);
  const name = promoText
    ? `Hookah of the day: ${hookah.name} (${promoText})`
    : `Hookah of the day: ${hookah.name}`;

  return {
    id: `hotd-${hash}`,
    type: 'mix',
    name,
    price: hookah.price,
    image: hookah.image,
    comboId: `hotd:${hash}`,
    comboLabel: truncateLabel(name),
    hookahId: hookah.id,
    hookah: hookah.name,
    ...(tobaccoType ? { tobaccoType } : {}),
    table,
  };
};
