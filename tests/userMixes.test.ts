import { describe, expect, test } from 'vitest';
import { comboIdForCustom } from '../src/services/comboId';
import {
  USER_MIX_DESCRIPTION_MAX, USER_MIX_NAME_MAX, describeUserMixBuild, describeUserMixRecipe, toCommunityMix,
  userMixFromFavorite, userMixToFavorite, validateUserMixInput, type UserMix,
} from '../src/services/userMixes';
import type { FavoriteCombo } from '../src/services/favoritesService';
import type { DatabaseFlavor, DatabaseHookah } from '../src/types/database';

const favorite: FavoriteCombo = {
  comboId: 'custom:x', label: 'Khalil · Mint, Lemon', kind: 'custom',
  hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
  tobaccoStrength: 4, flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 },
  withIce: true, hasLED: true,
};

const mix: UserMix = {
  id: 'm1', creatorUid: 'alice', creatorName: 'Alice', name: 'Lemon Storm',
  hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
  tobaccoStrength: 4, status: 'approved',
};

describe('validateUserMixInput', () => {
  test('a normal name passes', () => {
    expect(validateUserMixInput({ name: 'Lemon Storm' })).toBeNull();
  });
  test('a blank name fails', () => {
    expect(validateUserMixInput({ name: '   ' })).toMatch(/name/i);
  });
  test('an overlong name fails', () => {
    expect(validateUserMixInput({ name: 'x'.repeat(USER_MIX_NAME_MAX + 1) })).toMatch(/name/i);
  });
  test('an overlong description fails', () => {
    expect(validateUserMixInput({ name: 'ok', description: 'x'.repeat(USER_MIX_DESCRIPTION_MAX + 1) }))
      .toMatch(/description/i);
  });
});

describe('userMixFromFavorite', () => {
  test('carries the build, trims input, and drops add-ons', () => {
    expect(userMixFromFavorite(favorite, { name: ' Lemon Storm ', description: ' zesty ' },
      { uid: 'alice', displayName: 'Alice' })).toEqual({
      creatorUid: 'alice', creatorName: 'Alice', name: 'Lemon Storm', description: 'zesty',
      hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
      tobaccoStrength: 4, flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 }, withIce: true,
    });
  });
  test('an empty description is left out', () => {
    expect(userMixFromFavorite(favorite, { name: 'L', description: '  ' }, { uid: 'a', displayName: 'A' }))
      .not.toHaveProperty('description');
  });
  test('a curated mix favourite cannot be shared', () => {
    expect(userMixFromFavorite({ comboId: 'mix:s', label: 'S', kind: 'mix', mixId: 's' },
      { name: 'L' }, { uid: 'a', displayName: 'A' })).toBeNull();
  });
});

describe('userMixToFavorite', () => {
  test('orders as the same custom combo, so ratings and favourites line up', () => {
    const fav = userMixToFavorite(mix);
    expect(fav.kind).toBe('custom');
    expect(fav.comboId).toBe(comboIdForCustom('h1', 'virginia', ['mint:virginia', 'lemon:virginia']));
    expect(fav.label).toBe('Lemon Storm');
    expect(fav.tobaccoStrength).toBe(4);
  });
});

describe('toCommunityMix', () => {
  test('carries the build and the credit, never the creator\'s uid or the moderation state', () => {
    const projection = toCommunityMix({
      ...mix, description: 'Zesty', withIce: false,
      flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 },
      createdAt: new Date(0), reviewedAt: new Date(0),
    });
    expect(projection).toEqual({
      id: 'm1', name: 'Lemon Storm', creatorName: 'Alice', description: 'Zesty',
      hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
      tobaccoStrength: 4, flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 }, withIce: false,
    });
    expect(projection).not.toHaveProperty('creatorUid');
    expect(JSON.stringify(projection)).not.toContain('alice');
  });
  test('leaves absent optionals out rather than writing undefined', () => {
    const projection = toCommunityMix({ ...mix, tobaccoStrength: undefined });
    expect(Object.values(projection)).not.toContain(undefined);
    expect(projection).not.toHaveProperty('tobaccoStrength');
    expect(projection).not.toHaveProperty('description');
  });
  test('still orders as the same combo as the submission', () => {
    expect(userMixToFavorite(toCommunityMix(mix))).toEqual(userMixToFavorite(mix));
  });
});

describe('describeUserMixBuild', () => {
  const hookahs = [{ id: 'h1', name: 'Khalil Mamoon' }] as DatabaseHookah[];
  const flavors = [{ id: 'mint', name: 'Mint' }, { id: 'lemon', name: 'Lemon' }] as DatabaseFlavor[];
  test('names the hookah and flavours', () => {
    expect(describeUserMixBuild(mix, hookahs, flavors)).toBe('Khalil Mamoon · Mint, Lemon');
  });
  test('falls back to ids when something is gone', () => {
    expect(describeUserMixBuild(mix, [], [])).toBe('h1 · mint, lemon');
  });
  test('a malformed document renders instead of throwing', () => {
    const bad = { hookahId: 'h1', flavorIds: [1, null, 'mint:virginia'] } as unknown as UserMix;
    expect(describeUserMixBuild(bad, hookahs, flavors)).toBe('Khalil Mamoon · 1, null, Mint');
    const noList = { hookahId: 'h1', flavorIds: 'mint' } as unknown as UserMix;
    expect(describeUserMixBuild(noList, hookahs, flavors)).toBe('Khalil Mamoon · ');
  });
});

describe('describeUserMixRecipe', () => {
  const flavors = [{ id: 'mint', name: 'Mint' }, { id: 'lemon', name: 'Lemon' }] as DatabaseFlavor[];
  test('lists strength, ice and percentages', () => {
    expect(describeUserMixRecipe({
      tobaccoStrength: 4, withIce: true,
      flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 },
    }, flavors)).toEqual(['Strength 4', 'With ice', 'Mint 60%, Lemon 40%']);
  });
  test('says so when there is no ice', () => {
    expect(describeUserMixRecipe({ withIce: false }, flavors)).toEqual(['No ice']);
  });
  test('leaves out what the mix does not carry', () => {
    expect(describeUserMixRecipe({}, flavors)).toEqual([]);
  });
  test('falls back to ids and ignores malformed percentages', () => {
    const bad = { flavorPercentages: { 'gone:x': 50, 'mint:x': 'lots' } } as unknown as UserMix;
    expect(describeUserMixRecipe(bad, flavors)).toEqual(['gone 50%']);
  });
});
