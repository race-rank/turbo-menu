# Order and save a friend's favourites

Friends' favourites were already visible at `/friends/:uid`, but read-only.

## What changes

- **Order:** every row on a friend's Favourites list gets an "Order" button. It reuses the page's existing "Order the same" path: the menu loads on the first tap, then the usual table check, cart add, and "no longer available" toast (`useOrderFavorite`).
- **Save to mine:** every row also gets "Save to mine". It copies the friend's exact build (ids plus personalisation) into the viewer's own favourites through `addFavorite(viewerUid, favorite, { keepExisting: true })`.
  - A combo the viewer already has shows a disabled "Saved" button and is never overwritten, even when the viewer saved it on another device a moment earlier. The transaction returns `'kept'`.
  - At the cap, `FavoritesFullError` shows the usual "Favourites full" toast and nothing is written.
- `FavoritesList` gains the props `reorderLabel`, `onSave`, `savedIds` and `busy`. Remove and Share stay off friends' lists.

## Not changed

Firestore rules are unchanged. Ordering touches only the viewer's own cart, and saving writes only to the viewer's own `users/{uid}/favorites` and counter, under the PR #21 rules. Nothing needs deploying beyond those PR #21 rules.

## Tests

`tests/favoritesListActions.dom.test.tsx` covers the buttons, the Saved state, the busy state, and Account's unchanged "Order again".
