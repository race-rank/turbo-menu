import { describe, expect, test } from 'vitest';
import {
  NOW_SMOKING_MAX_ITEMS, NOW_SMOKING_TTL_MS, buildNowSmokingItems,
  isNowSmokingFresh, nowSmokingItemToFavorite,
} from '../src/services/nowSmoking';

const mixItem = {
  type: 'mix' as const, comboId: 'mix:sunset', comboLabel: 'Sunset Blend',
  name: 'Sunset Blend (Virginia)', mixId: 'sunset', tobaccoType: 'virginia' as const,
};
const customItem = {
  type: 'custom' as const, comboId: 'custom:abc', comboLabel: 'Khalil · Mint, Lemon',
  name: 'Custom Mix', hookahId: 'h1', tobaccoType: 'virginia' as const,
  flavorIds: ['mint:virginia', 'lemon:virginia'],
};

describe('buildNowSmokingItems', () => {
  test('a mix shares its id and label only', () => {
    expect(buildNowSmokingItems([mixItem])).toEqual([
      { comboId: 'mix:sunset', label: 'Sunset Blend' },
    ]);
  });

  test('a custom build also shares what is needed to order the same', () => {
    expect(buildNowSmokingItems([customItem])).toEqual([{
      comboId: 'custom:abc', label: 'Khalil · Mint, Lemon',
      hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
    }]);
  });

  test('personalisation is never shared', () => {
    const [item] = buildNowSmokingItems([{
      ...customItem, tobaccoStrength: 7, flavorPercentages: { a: 50 }, hasLED: true,
    } as typeof customItem]);
    expect(Object.keys(item).sort()).toEqual(['comboId', 'flavorIds', 'hookahId', 'label', 'tobaccoType']);
  });

  test('legacy items without a comboId are skipped', () => {
    expect(buildNowSmokingItems([{ ...mixItem, comboId: undefined as unknown as string }])).toEqual([]);
  });

  test('the same combo twice is shared once', () => {
    expect(buildNowSmokingItems([mixItem, mixItem])).toHaveLength(1);
  });

  test('falls back to the item name when there is no combo label', () => {
    expect(buildNowSmokingItems([{ ...mixItem, comboLabel: undefined }])[0].label)
      .toBe('Sunset Blend (Virginia)');
  });

  test('caps the list', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...mixItem, comboId: `mix:m${i}` }));
    expect(buildNowSmokingItems(many)).toHaveLength(NOW_SMOKING_MAX_ITEMS);
  });

  test('a custom item missing its build shares the label only', () => {
    expect(buildNowSmokingItems([{ ...customItem, hookahId: undefined }])).toEqual([
      { comboId: 'custom:abc', label: 'Khalil · Mint, Lemon' },
    ]);
  });
});

describe('isNowSmokingFresh', () => {
  const now = new Date('2026-10-13T20:00:00Z');

  test('fresh inside the window', () => {
    expect(isNowSmokingFresh(new Date(now.getTime() - 60_000), now)).toBe(true);
  });

  test('stale at the window', () => {
    expect(isNowSmokingFresh(new Date(now.getTime() - NOW_SMOKING_TTL_MS), now)).toBe(false);
  });

  test('a server time slightly ahead of the device clock still counts as fresh', () => {
    expect(isNowSmokingFresh(new Date(now.getTime() + 30_000), now)).toBe(true);
  });

  test('no timestamp is not fresh', () => {
    expect(isNowSmokingFresh(undefined, now)).toBe(false);
  });
});

describe('nowSmokingItemToFavorite', () => {
  test('a mix resolves from its combo id', () => {
    expect(nowSmokingItemToFavorite({ comboId: 'mix:sunset', label: 'Sunset Blend' })).toEqual({
      comboId: 'mix:sunset', label: 'Sunset Blend', kind: 'mix', mixId: 'sunset',
    });
  });

  test('a custom build resolves from its shared build', () => {
    expect(nowSmokingItemToFavorite({
      comboId: 'custom:abc', label: 'L', hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['a:virginia'],
    })).toEqual({
      comboId: 'custom:abc', label: 'L', kind: 'custom',
      hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['a:virginia'],
    });
  });

  test('a custom item without its build cannot be ordered', () => {
    expect(nowSmokingItemToFavorite({ comboId: 'custom:abc', label: 'L' })).toBeNull();
  });
});
