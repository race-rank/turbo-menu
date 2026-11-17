import { describe, expect, test } from 'vitest';
import {
  MAX_PROMO_TEXT_LENGTH, clampPromoText, hookahOfTheDayCartItem, resolveHookahOfTheDay,
} from '../src/services/hookahOfTheDay';
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

describe('hookahOfTheDayCartItem', () => {
  const darkblend = hookah({ id: 'hk-dark', name: 'Darkblend', price: 80, image: '/img/dark.webp' });
  const recipe = 'Red Tea | Blackberry | Passion Fruit | Spices';

  test('orders the day\'s mix as one item, like a recommended mix', () => {
    const item = hookahOfTheDayCartItem({ hookah: darkblend, promoText: recipe }, 'darkblend', '7');

    // A mix line, not a custom build: the bar prepares the recipe, so there
    // are no flavour ids for the customer to pick.
    expect(item).toMatchObject({
      type: 'mix',
      name: `Hookah of the day: Darkblend (${recipe})`,
      comboLabel: `Hookah of the day: Darkblend (${recipe})`,
      price: 80,
      image: '/img/dark.webp',
      hookahId: 'hk-dark',
      hookah: 'Darkblend',
      tobaccoType: 'darkblend',
      table: '7',
    });
    expect(item.flavorIds).toBeUndefined();
    expect(item.mixId).toBeUndefined();
  });

  test('without a promo line it is still orderable, named after the hookah', () => {
    const item = hookahOfTheDayCartItem({ hookah: darkblend }, 'darkblend', '7');

    expect(item.name).toBe('Hookah of the day: Darkblend');
  });

  test('ordering it twice adds to the same cart line', () => {
    const first = hookahOfTheDayCartItem({ hookah: darkblend, promoText: recipe }, 'darkblend', '7');
    const second = hookahOfTheDayCartItem({ hookah: darkblend, promoText: recipe }, 'darkblend', '7');

    expect(second.id).toBe(first.id);
    expect(second.comboId).toBe(first.comboId);
  });

  test('a new recipe on the same hookah is a different combo', () => {
    // Ratings are filed by comboId; Tuesday's mix must not inherit Monday's.
    const monday = hookahOfTheDayCartItem({ hookah: darkblend, promoText: recipe }, 'darkblend', '7');
    const tuesday = hookahOfTheDayCartItem({ hookah: darkblend, promoText: 'Mint | Lemon' }, 'darkblend', '7');

    expect(tuesday.comboId).not.toBe(monday.comboId);
    expect(tuesday.id).not.toBe(monday.id);
  });

  test('a hookah whose tier is unknown is ordered without a tobacco type', () => {
    const item = hookahOfTheDayCartItem({ hookah: hookah() }, null, '7');

    expect(item.tobaccoType).toBeUndefined();
  });
});
