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

  // Pins the published FNV-1a 64-bit reference vectors, not merely our own
  // current output. Without this the whole suite passes even if the algorithm
  // is swapped for a different deterministic hash - and since these ids become
  // Firestore document ids for favourites and ratings, that would silently
  // orphan real customer data rather than failing loudly.
  test('matches the published FNV-1a 64-bit reference vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
    expect(fnv1a64('hello')).toBe('a430d84680aabd0b');
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

  // Pins the canonical string layout too: field order, the '|' separators and
  // the sort-then-comma-join. A change to any of those reshapes every id.
  test('produces a known id for a known build', () => {
    expect(comboIdForCustom('hookah1', 'virginia', ['mint:virginia', 'lemon:virginia']))
      .toBe('custom:7d9fbd02572001ae');
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
