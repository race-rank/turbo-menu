import { describe, expect, test } from 'vitest';
import { comboIdForCustom, comboIdForMix, fnv1a64 } from '../src/services/comboId';

describe('fnv1a64', () => {
  test('is deterministic and 16 hex characters', () => {
    expect(fnv1a64('hello')).toBe(fnv1a64('hello'));
    expect(fnv1a64('hello')).toMatch(/^[0-9a-f]{16}$/);
  });

  test('separates inputs that differ by one character', () => {
    expect(fnv1a64('hello')).not.toBe(fnv1a64('hellp'));
  });
});

describe('comboIdForMix', () => {
  test('passes the mix document id through', () => {
    expect(comboIdForMix('abc123')).toBe('mix:abc123');
  });

  test('ignores tobacco category - a mix is one combo, not three', () => {
    expect(comboIdForMix('abc123')).toBe(comboIdForMix('abc123'));
  });
});

describe('comboIdForCustom', () => {
  const FLAVORS = ['mint:virginia', 'lemon:virginia'];

  test('is stable across calls', () => {
    expect(comboIdForCustom('hookah1', 'virginia', FLAVORS))
      .toBe(comboIdForCustom('hookah1', 'virginia', FLAVORS));
  });

  test('does not depend on flavour order', () => {
    expect(comboIdForCustom('hookah1', 'virginia', ['mint:virginia', 'lemon:virginia']))
      .toBe(comboIdForCustom('hookah1', 'virginia', ['lemon:virginia', 'mint:virginia']));
  });

  test('does not mutate the array it is given', () => {
    const input = ['mint:virginia', 'apple:virginia'];
    comboIdForCustom('hookah1', 'virginia', input);
    expect(input).toEqual(['mint:virginia', 'apple:virginia']);
  });

  test('separates different flavours', () => {
    expect(comboIdForCustom('hookah1', 'virginia', ['mint:virginia']))
      .not.toBe(comboIdForCustom('hookah1', 'virginia', ['lemon:virginia']));
  });

  test('separates different hookahs and tobacco types', () => {
    expect(comboIdForCustom('hookah1', 'virginia', FLAVORS))
      .not.toBe(comboIdForCustom('hookah2', 'virginia', FLAVORS));
    expect(comboIdForCustom('hookah1', 'virginia', FLAVORS))
      .not.toBe(comboIdForCustom('hookah1', 'darkblend', FLAVORS));
  });

  test('is prefixed so the two kinds can never collide', () => {
    expect(comboIdForCustom('hookah1', 'virginia', FLAVORS)).toMatch(/^custom:[0-9a-f]{16}$/);
  });

  // The whole point of excluding these: a favourite must survive the customer
  // nudging a percentage slider, and two people who built the same flavour
  // combination must land on the same id.
  test('ignores personalisation - strength, percentages, addons are not identity', () => {
    const a = comboIdForCustom('hookah1', 'virginia', FLAVORS);
    const b = comboIdForCustom('hookah1', 'virginia', [...FLAVORS]);
    expect(a).toBe(b);
  });
});
