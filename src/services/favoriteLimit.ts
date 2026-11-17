/**
 * The favourites limit. Pure on purpose - no Firebase import - so it is unit
 * tested directly, like comboId.ts and hookahOfTheDay.ts.
 *
 * firestore.rules enforces the same number (maxFavorites()); change both.
 */
export const MAX_FAVORITES = 20;

export const FAVORITES_FULL_MESSAGE =
  `You have ${MAX_FAVORITES} favourites - remove one to add another.`;

/** Thrown by addFavorite, before writing, when the account is already full. */
export class FavoritesFullError extends Error {
  constructor() {
    super(FAVORITES_FULL_MESSAGE);
    this.name = 'FavoritesFullError';
  }
}

export const hasRoomForFavorite = (count: number): boolean => count < MAX_FAVORITES;

/** "7/20". Customers over the limit keep everything, so "23/20" is real. */
export const formatFavoriteCount = (count: number): string => `${count}/${MAX_FAVORITES}`;

/**
 * Splits a guest's favourites into those that fit into an account already
 * holding `count`, newest first, and those that do not. Undated entries sort
 * as oldest.
 */
export const favoritesThatFit = <T extends { createdAt?: Date }>(
  candidates: T[],
  count: number,
): { fit: T[]; left: T[] } => {
  const room = Math.max(0, MAX_FAVORITES - count);
  const newestFirst = [...candidates].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
  return { fit: newestFirst.slice(0, room), left: newestFirst.slice(room) };
};

export const describeFavoritesThatDidNotFit = (count: number): string | null => {
  if (count <= 0) return null;
  const noun = count === 1 ? 'favourite' : 'favourites';
  return `${count} ${noun} from this device didn't fit - your account is full (${MAX_FAVORITES}).`;
};
