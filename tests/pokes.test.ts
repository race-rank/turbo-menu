import { describe, expect, test } from 'vitest';
import { POKE_COOLDOWN_MS, isPokeUnseen, pokeCooldownRemainingMs } from '../src/services/pokes';

const t = (ms: number) => new Date(ms);

describe('isPokeUnseen', () => {
  test('never seen is unseen', () => {
    expect(isPokeUnseen({ at: t(1000) })).toBe(true);
  });
  test('seen after the poke is seen', () => {
    expect(isPokeUnseen({ at: t(1000), seenAt: t(2000) })).toBe(false);
  });
  test('poked again after being seen is unseen', () => {
    expect(isPokeUnseen({ at: t(3000), seenAt: t(2000) })).toBe(true);
  });
});

describe('pokeCooldownRemainingMs', () => {
  const now = t(100 * 60_000);
  test('never poked can poke now', () => {
    expect(pokeCooldownRemainingMs(null, now)).toBe(0);
  });
  test('three minutes ago leaves seven', () => {
    expect(pokeCooldownRemainingMs(t(now.getTime() - 3 * 60_000), now)).toBe(7 * 60_000);
  });
  test('past the cooldown can poke now', () => {
    expect(pokeCooldownRemainingMs(t(now.getTime() - POKE_COOLDOWN_MS - 1), now)).toBe(0);
  });
});
