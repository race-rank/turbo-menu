import { describe, expect, test } from 'vitest';
import { resolveHookahOfTheDay } from '../src/services/hookahOfTheDay';
import type { DatabaseHookah, FeaturedHookah } from '../src/types/database';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const hookah = (overrides: Partial<DatabaseHookah> = {}): DatabaseHookah => ({
  id: 'hookah-1',
  name: 'Khalil Mamoon',
  price: 120,
  image: '/img/khalil.webp',
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('resolveHookahOfTheDay', () => {
  test('a valid pointer resolves to the hookah and its promo text', () => {
    const hookahs = [hookah(), hookah({ id: 'hookah-2', name: 'Amotion' })];
    const featured: FeaturedHookah = { hookahId: 'hookah-2', promoText: 'Smooth and slow' };

    expect(resolveHookahOfTheDay(hookahs, featured)).toEqual({
      hookah: hookahs[1],
      promoText: 'Smooth and slow',
    });
  });

  test('a pointer with no promo text resolves with the hookah alone', () => {
    const hookahs = [hookah()];

    expect(resolveHookahOfTheDay(hookahs, { hookahId: 'hookah-1' })).toEqual({
      hookah: hookahs[0],
    });
  });

  test('no pointer at all resolves to null', () => {
    expect(resolveHookahOfTheDay([hookah()], undefined)).toBeNull();
  });

  test('a pointer to an unknown id resolves to null', () => {
    // The hookah was deleted after being featured.
    expect(resolveHookahOfTheDay([hookah()], { hookahId: 'hookah-gone' })).toBeNull();
  });

  test('a pointer to a deactivated hookah resolves to null', () => {
    // The bar switched it off without remembering it was the promotion. It must
    // not be advertised - the bar will not serve it.
    const hookahs = [hookah({ isActive: false })];

    expect(resolveHookahOfTheDay(hookahs, { hookahId: 'hookah-1' })).toBeNull();
  });

  test('whitespace-only promo text is treated as absent', () => {
    const hookahs = [hookah()];

    expect(resolveHookahOfTheDay(hookahs, { hookahId: 'hookah-1', promoText: '   ' }))
      .toEqual({ hookah: hookahs[0] });
  });

  test('an empty hookah list resolves to null rather than throwing', () => {
    expect(resolveHookahOfTheDay([], { hookahId: 'hookah-1' })).toBeNull();
  });
});
