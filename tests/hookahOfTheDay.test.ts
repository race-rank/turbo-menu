import { describe, expect, test } from 'vitest';
import { MAX_PROMO_TEXT_LENGTH, clampPromoText, resolveHookahOfTheDay } from '../src/services/hookahOfTheDay';
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

describe('clampPromoText', () => {
  test('a normal line survives unchanged', () => {
    expect(clampPromoText('Smooth and slow')).toBe('Smooth and slow');
  });

  test('surrounding whitespace is trimmed', () => {
    expect(clampPromoText('  Smooth and slow  ')).toBe('Smooth and slow');
  });

  test('an absent, empty or whitespace-only line becomes undefined', () => {
    // undefined rather than '' so stripUndefined drops the key entirely instead
    // of writing an empty string into the public snapshot.
    expect(clampPromoText(undefined)).toBeUndefined();
    expect(clampPromoText('')).toBeUndefined();
    expect(clampPromoText('   ')).toBeUndefined();
  });

  test('a line at the cap is kept whole', () => {
    const exact = 'x'.repeat(MAX_PROMO_TEXT_LENGTH);

    expect(clampPromoText(exact)).toBe(exact);
  });

  test('an oversized line is cut to the cap', () => {
    // The Input's maxLength is a courtesy to the admin; this is the guarantee
    // that unbounded text never reaches the snapshot every customer downloads.
    const result = clampPromoText('x'.repeat(5000));

    expect(result).toHaveLength(MAX_PROMO_TEXT_LENGTH);
  });

  test('a line that is only oversized after trimming is still cut', () => {
    const result = clampPromoText(`   ${'x'.repeat(5000)}   `);

    expect(result).toHaveLength(MAX_PROMO_TEXT_LENGTH);
  });
});
