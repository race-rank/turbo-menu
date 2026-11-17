import { describe, expect, test } from 'vitest';
import {
  FAVORITES_FULL_MESSAGE, FavoritesFullError, MAX_FAVORITES, describeFavoritesThatDidNotFit,
  favoritesThatFit, formatFavoriteCount, hasRoomForFavorite,
} from '../src/services/favoriteLimit';
import { SAVE_FAVORITE_PATH, isSaveFavoriteMode } from '../src/services/saveFavoriteMode';

const at = (comboId: string, iso?: string) => ({
  comboId, createdAt: iso ? new Date(iso) : undefined,
});

describe('hasRoomForFavorite', () => {
  test('there is room below the limit and none at or above it', () => {
    expect(MAX_FAVORITES).toBe(20);
    expect(hasRoomForFavorite(0)).toBe(true);
    expect(hasRoomForFavorite(19)).toBe(true);
    expect(hasRoomForFavorite(20)).toBe(false);
    expect(hasRoomForFavorite(23)).toBe(false);
  });
});

describe('favoritesThatFit', () => {
  test('keeps the newest that fit and reports the rest', () => {
    const candidates = [
      at('old', '2026-01-01T00:00:00Z'),
      at('new', '2026-03-01T00:00:00Z'),
      at('mid', '2026-02-01T00:00:00Z'),
    ];

    const { fit, left } = favoritesThatFit(candidates, 18);

    expect(fit.map((f) => f.comboId)).toEqual(['new', 'mid']);
    expect(left.map((f) => f.comboId)).toEqual(['old']);
  });

  test('an undated favourite counts as oldest', () => {
    const { fit } = favoritesThatFit([at('undated'), at('dated', '2026-01-01T00:00:00Z')], 19);

    expect(fit.map((f) => f.comboId)).toEqual(['dated']);
  });

  test('everything fits when there is room', () => {
    const { fit, left } = favoritesThatFit([at('a'), at('b')], 0);

    expect(fit).toHaveLength(2);
    expect(left).toHaveLength(0);
  });

  test('nothing fits into a full or over-full account', () => {
    expect(favoritesThatFit([at('a')], 20).fit).toHaveLength(0);
    expect(favoritesThatFit([at('a')], 23).left).toHaveLength(1);
  });
});

describe('display strings', () => {
  test('formatFavoriteCount shows the limit, even when over it', () => {
    expect(formatFavoriteCount(7)).toBe('7/20');
    expect(formatFavoriteCount(23)).toBe('23/20');
  });

  test('the full message names the limit', () => {
    expect(FAVORITES_FULL_MESSAGE).toBe('You have 20 favourites - remove one to add another.');
    expect(new FavoritesFullError()).toBeInstanceOf(Error);
    expect(new FavoritesFullError().message).toBe(FAVORITES_FULL_MESSAGE);
  });

  test('describeFavoritesThatDidNotFit is null for none and pluralises', () => {
    expect(describeFavoritesThatDidNotFit(0)).toBeNull();
    expect(describeFavoritesThatDidNotFit(1))
      .toBe("1 favourite from this device didn't fit - your account is full (20).");
    expect(describeFavoritesThatDidNotFit(3))
      .toBe("3 favourites from this device didn't fit - your account is full (20).");
  });
});

describe('save mode', () => {
  test('is on only at its own path', () => {
    expect(SAVE_FAVORITE_PATH).toBe('/save-favourite');
    expect(isSaveFavoriteMode('/save-favourite')).toBe(true);
    expect(isSaveFavoriteMode('/table-7')).toBe(false);
    expect(isSaveFavoriteMode('/')).toBe(false);
  });
});
