import { describe, expect, test } from 'vitest';
import { comboIdForCustom } from '../src/services/comboId';
import {
  USER_MIX_DESCRIPTION_MAX, USER_MIX_NAME_MAX, describeUserMixBuild,
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

describe('describeUserMixBuild', () => {
  const hookahs = [{ id: 'h1', name: 'Khalil Mamoon' }] as DatabaseHookah[];
  const flavors = [{ id: 'mint', name: 'Mint' }, { id: 'lemon', name: 'Lemon' }] as DatabaseFlavor[];
  test('names the hookah and flavours', () => {
    expect(describeUserMixBuild(mix, hookahs, flavors)).toBe('Khalil Mamoon · Mint, Lemon');
  });
  test('falls back to ids when something is gone', () => {
    expect(describeUserMixBuild(mix, [], [])).toBe('h1 · mint, lemon');
  });
});
