# Favourites: Manual Add and a Limit of 20 — Design

**Date:** 2026-11-13
**Status:** Approved

## Goal

Two requests from customers:

1. *"La account, de adaugat un buton in care sa poti adauga manual, chiar daca nu ai
   comandat din aplicatie."* Let a customer add a favourite from the Account page
   without ordering it through the app — something they smoked at the bar, ordered
   from a waiter.
2. *"Facem o limitare de 20 maxim la favorite."* No more than 20 favourites per
   customer.

## Where favourites come from today

Only the menu page (`src/pages/Index.tsx`) creates them:

- the heart on a recommended-mix card (`toggleMixFavorite`), and
- the "Save this combo to your favourites?" prompt shown after a custom build is
  added to the cart (`lastBuild`).

`Account.tsx` lists, re-orders, shares and removes them; `FriendProfile.tsx` lets a
friend order them. The guest-to-account transfer (`copyFavorites` in
`accountClaimService.ts`) copies them on sign-in.

A favourite stores menu ids, never free text or prices (`FavoriteCombo` in
`favoritesService.ts`). That is what makes "order again" work, and it stays true here.

## Scope

**In:** a save mode for the existing menu builder, reached from an "Add favourite"
button on Account; a limit of 20 enforced in the app *and* in `firestore.rules`; a
counter document per customer; a one-off script to set the counter for existing
customers; the guest transfer respecting the limit.

**Out:** free-text favourites, favouriting past orders, a heart on community mixes or
the hookah of the day outside save mode, deleting anyone's existing favourites,
configurable limits.

## Decisions

| Question | Decision |
|---|---|
| How to add by hand | Reuse the menu builder in a save mode. No second builder. |
| Where the limit is enforced | In the app, and in the database rules. |
| Customers already over 20 | Keep everything. They can remove, but cannot add until under 20. |
| Guest transfer that would exceed 20 | Move only what fits; tell the customer how many did not. Nothing is deleted. |

---

## Part 1 — The limit in the database

### Why a separate counter document

Rules see one document at a time and cannot count a collection, so the count has to
be stored. It cannot live on `users/{uid}`: that document's rule is
`allow read, write: if request.auth.uid == uid`, so a customer could set the count
back to 0. Tightening that rule would risk every other writer of the user document.

The counter gets its own document, whose rule only lets it change in step with a
favourite actually appearing or disappearing in the same write:

```
users/{uid}/counters/favorites  { count: int, changed: string }
```

`changed` names the favourite the write adds or removes. The rule needs it to know
which favourite to check with `exists()` / `existsAfter()`.

### Rules

A shared constant in the rules, mirrored as `MAX_FAVORITES = 20` in
`src/services/favoriteLimit.ts`.

**`users/{uid}/favorites/{comboId}`** — the current combined `create, update` is split.
The existing shape checks move into a `favoriteShapeOk(d)` function used by both.

- `create`: owner, `favoriteShapeOk`, and the counter document exists after the write
  with `count == before + 1` and `count <= 20`, where `before` is the stored count or 0
  when no counter exists yet.
- `update`: owner and `favoriteShapeOk` only. Overwriting a favourite that already
  exists (for example `addMixToCart` recording which tobacco type was ordered) never
  touches the count.
- `delete`: unchanged — the owner, or a claimer of the guest uid. Removing never
  depends on the counter, so a stale or missing count can never stop someone removing
  a favourite.

**`users/{uid}/counters/favorites`** — owner only for every operation; never readable
by friends.

- `create`: keys exactly `count` and `changed`; `count == 1`; `changed` is a string
  of at most 100 characters; `!exists(favorite changed)` and `existsAfter(favorite
  changed)`.
- `update`: same keys, and one of:
  - **add:** `count == old + 1`, `count <= 20`, the favourite `changed` did not exist
    before and exists after;
  - **remove:** `count == old - 1`, `count >= 0`, the favourite `changed` existed
    before and does not exist after.
- `delete`: denied.

What this guarantees: the count can only go up by one when a favourite is really
created, and only while it stays at or under 20. A client that skips the decrement on
a delete only costs itself a slot; it cannot gain any.

**Customers over 20.** A customer with 23 can still delete (23 → 22 is a valid
remove), and cannot create until the count is at most 19 beforehand.

### Service

`favoritesService.ts`:

- `addFavorite(uid, favorite)` becomes a transaction. It reads the favourite and the
  counter. If the favourite exists, it overwrites it and leaves the count alone. If
  not, and the count is 20 or more, it throws `FavoritesFullError` without writing.
  Otherwise it writes the favourite and the counter (`count + 1`, `changed`) together.
- `removeFavorite(uid, comboId)` becomes a transaction: delete the favourite and, if
  it existed and a counter exists with `count > 0`, write `count - 1` with `changed`.
- `getFavoriteCount(uid)` reads the counter, 0 when absent.
- The claim path deletes guest favourites with a plain delete that does not touch any
  counter (the claimer cannot write the guest's counter, and the guest uid is
  abandoned). That is a separate, non-exported-to-UI helper.

Transactions need a connection; a save made offline now fails with the usual "could
not save" instead of being queued. Acceptable: ordering already needs a connection.

`src/services/favoriteLimit.ts` (pure, unit tested, no Firebase import):

- `MAX_FAVORITES = 20`
- `hasRoomForFavorite(count)` — `count < MAX_FAVORITES`
- `favoritesThatFit(candidates, count)` — returns `{ fit, left }`, newest first, for
  the guest transfer.
- `formatFavoriteCount(count)` — `"7/20"`; `"23/20"` for a customer over the limit.

### Guest transfer

`copyFavorites` reads the account's counter, sorts the guest's favourites newest
first, and copies only as many as fit, each through `addFavorite` so each carries its
+1. Favourites the account already has are skipped and their guest copy removed, as
today.

Favourites that did not fit are **left on the guest uid, not deleted**, and are
counted in a new `ClaimSummary.didNotFit`. They are not counted as `failed`: a retry
cannot make room, so they must not keep the local claim record alive for further
attempts. `describeClaim` adds "N favourites from this device didn't fit — your
account is full (20)."

Honest limitation: once the claim completes, the guest uid is unreachable, so
favourites left on it are not recoverable later. They are not deleted, but in
practice they are gone. The customer is told how many.

### Existing customers: `scripts/backfill-favorite-counts.mjs`

Same pattern as `scripts/grant-admin.mjs` (reads `serviceAccountKey.json` from the
repo root; that file is gitignored and is never opened or pasted by Claude). For
every `users/{uid}/favorites` collection it counts the documents and writes
`users/{uid}/counters/favorites { count, changed: '' }`, overwriting any value. It is
idempotent and prints how many customers it updated and how many are over 20.

It covers anonymous guests too: their favourites live under the same path.

### Release order

1. Merge the PR (Vercel deploys the app).
2. Deploy the rules: `npx firebase deploy --only firestore:rules --project turbo-menu-30079`.
3. Run `node scripts/backfill-favorite-counts.mjs`.

Between 1 and 2 the new app's counter writes are denied by the old rules, and between
2 and a page reload the old app's favourite writes are denied by the new rules. Either
way the customer sees "could not update favourites" for a few minutes; nothing is
lost. Between 2 and 3, a customer with existing favourites but no counter could create
a counter of 1; step 3 overwrites it with the real count, so it must run straight
after step 2.

---

## Part 2 — Screens

### Account page

- The heading becomes **"Favourites (7/20)"** (`formatFavoriteCount`, from the length
  of the loaded list).
- A new **"+ Add favourite"** button navigates to `/?mode=save-favourite`.
- At 20 or more the button is disabled, with the line "Remove one to add another".
- Shown to anyone who can already see their favourites, guests included.

### Menu in save mode (`Index.tsx`, `?mode=save-favourite`)

- A banner pinned at the top: **"Building a favourite — nothing will be ordered"**
  with **Cancel**, which returns to `/account`.
- The cart button and the order status tracker are hidden. No table is asked for.
- **Custom build:** the final "Add to cart" becomes **"Save to favourites"**. It
  builds the same `FavoriteCombo` the `lastBuild` prompt builds today and calls
  `addFavorite` directly; the "Save this combo?" prompt is not shown.
- **Recommended mix:** the tobacco-type dialog ends in **"Save"** instead of adding to
  the cart. The favourite stores that `tobaccoType`, so "order again" restores exactly
  that version.
- **Community mix:** its button becomes **"Save"**, using the existing
  `userMixToFavorite`-style conversion to a custom favourite.
- **Hearts** on recommended mixes keep working as they do outside save mode.
- **After saving:** back to `/account` with "Saved to favourites". If the combo was
  already a favourite: "Already in your favourites", no second copy (the comboId is
  the document id, so a duplicate is impossible by construction).
- **Full:** "You have 20 favourites — remove one to add another"; the customer stays
  on the menu.

### The limit outside save mode

- **Heart on a mix at 20:** the same message; nothing saved. The heart stays tappable
  so the message can be seen.
- **"Save this combo?" prompt:** not shown when the list is full.
- **Database refusal** (the list filled up on another device): `addFavorite` throws
  `FavoritesFullError` from inside the transaction, shown as the same message. Any
  other failure keeps today's "Could not update favourites".

---

## Testing

- **`tests/favoriteLimit.test.ts`** — `hasRoomForFavorite`, `favoritesThatFit`
  (newest first, exact fit, none fit, already over), `formatFavoriteCount`.
- **`tests/favoritesLimitRules.test.ts`** (emulator) —
  - the 20th favourite is accepted, the 21st refused;
  - a create without a counter change is refused;
  - a counter +1 with no favourite created, or naming a favourite that already
    existed, is refused;
  - a counter −1 with no favourite deleted is refused; a counter set to an arbitrary
    value is refused; counter delete is refused;
  - an overwrite of an existing favourite with no counter change is accepted;
  - delete is always accepted, including with no counter and with a count over 20;
  - a customer at 23 can delete down but cannot create until under 20;
  - a friend cannot read the counter;
  - a claimer copying guest favourites stops at 20, and can still delete guest copies.

  Each restriction is checked by temporarily weakening the rule and watching its test
  fail, as for the previous rules PR.
- **Existing suites** (`socialRules`, `rules`, `orderService`) keep passing; any test
  that creates favourites with a plain `setDoc` is updated to write the counter too.
- **`tests/saveFavoriteMode.dom.test.tsx`** — in save mode the custom build's button
  saves and does not add to the cart; the cart button is hidden.

## Risks

- **A favourite and its counter drift.** Only possible through deletes that skip the
  decrement, which costs the customer a slot rather than granting one. The backfill
  script can be re-run to correct it.
- **`Index.tsx` is already 1,256 lines.** Save mode is a flag threaded through it, not
  a copy of it; the save-mode banner and the "save instead of add" decision live in
  small components and a helper so the page grows as little as possible.
