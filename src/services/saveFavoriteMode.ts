/**
 * The menu, mounted at its own path, where every "add to cart" saves a
 * favourite instead. Not `/?mode=...`: `/` is RedirectPage, which reads its own
 * query parameters. This path falls through to the `*` route, which is Index.
 * It contains neither "table-" nor "bar", so Index's table detection ignores it.
 */
export const SAVE_FAVORITE_PATH = '/save-favourite';

export const isSaveFavoriteMode = (pathname: string): boolean => pathname === SAVE_FAVORITE_PATH;
