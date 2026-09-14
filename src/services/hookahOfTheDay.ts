import type { DatabaseHookah, FeaturedHookah } from '@/types/database';

/**
 * Bound on the promo line. The menu snapshot is the hottest read path in the
 * app - every customer downloads it on every visit - and this project has
 * already had documents bloat to 91% of the 1MiB limit by carrying unbounded
 * data. Enforced when writing, in menuService.setFeaturedHookah.
 */
export const MAX_PROMO_TEXT_LENGTH = 140;

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
