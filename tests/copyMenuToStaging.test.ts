import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
// @ts-expect-error - a plain .mjs script with no type declarations.
import { fromRest } from '../scripts/copy-menu-to-staging.mjs';

describe('copy-menu-to-staging: REST value conversion', () => {
  it('converts scalars, keeping integers and doubles as numbers', () => {
    expect(fromRest({ stringValue: 'Mint' })).toBe('Mint');
    expect(fromRest({ integerValue: '100' })).toBe(100);
    expect(fromRest({ doubleValue: 12.5 })).toBe(12.5);
    expect(fromRest({ booleanValue: false })).toBe(false);
    expect(fromRest({ nullValue: null })).toBeNull();
  });

  it('converts timestamps to Firestore Timestamps', () => {
    const value = fromRest({ timestampValue: '2026-11-08T19:07:55.766Z' });
    expect(value).toBeInstanceOf(Timestamp);
    expect(value.toDate().toISOString()).toBe('2026-11-08T19:07:55.766Z');
  });

  it('converts nested maps and arrays, including empty ones', () => {
    expect(fromRest({
      mapValue: {
        fields: {
          compatibleTobaccoTypes: { arrayValue: { values: [{ stringValue: 'virginia' }] } },
          flavorImages: { arrayValue: {} },
          extra: { mapValue: {} },
        },
      },
    })).toEqual({ compatibleTobaccoTypes: ['virginia'], flavorImages: [], extra: {} });
  });

  it('refuses a value type it does not know rather than dropping it', () => {
    expect(() => fromRest({ referenceValue: 'projects/x/databases/y/documents/a/b' })).toThrow(/Unsupported/);
  });
});
