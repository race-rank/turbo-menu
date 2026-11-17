# Favourites: Manual Add and a Limit of 20 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers can add a favourite from the Account page through the menu builder in a save mode, and nobody can hold more than 20 favourites — enforced in the app and in `firestore.rules`.

**Architecture:** A counter document `users/{uid}/counters/favorites` moves in the same write as every favourite created or deleted; rules accept a new favourite only when the counter goes up by one to at most 20, and accept a counter change only when a matching favourite really appears or disappears. `favoritesService` writes both in a transaction. Save mode is the existing menu page mounted at `/save-favourite`, where "add to cart" actions save a favourite instead.

**Tech Stack:** React 18 + Vite + TypeScript, Firebase JS SDK v10 (Firestore), Firestore security rules, Vitest (node + jsdom), `@firebase/rules-unit-testing` against the Firestore emulator.

**Spec:** `docs/superpowers/specs/2026-11-13-favourites-manual-add-and-limit-design.md`

## Ground rules for this repo

- Never run `npm run dev` or `vite preview`: both talk to the production database.
- Full suite: `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm test` (wraps vitest in the Firestore emulator). Pure tests can run alone with `npx vitest run tests/<file>`.
- `npx tsc --noEmit -p tsconfig.app.json` has 4 pre-existing errors in `src/services/firebaseService.ts`. The count must stay 4.
- `npm run build` must stay clean.
- If the emulator reports "Hook timed out", re-run once before investigating.
- Rendered text: an element must not mix static text with `{expr}` children (Google Translate freezes them; `tests/translateSafeText.guard.test.ts` enforces it). Use one template literal: `` {`Favourites (${n})`} ``.

## One deviation from the spec

The spec names the save-mode URL `/?mode=save-favourite`. `/` is `RedirectPage`, which reads its own query parameters; the menu itself is the `*` route. Save mode therefore lives at **`/save-favourite`** (caught by `*`, renders `Index`). Recorded in the spec in Task 10.

Also: the hookah-of-the-day card is hidden in save mode, since its **Order** button adds to the cart. The spec did not mention the card (it predates #20).

## File structure

| File | Responsibility |
|---|---|
| `src/services/favoriteLimit.ts` (new) | Pure: `MAX_FAVORITES`, room checks, transfer split, display strings, `FavoritesFullError`. |
| `src/services/saveFavoriteMode.ts` (new) | Pure: `SAVE_FAVORITE_PATH`, `isSaveFavoriteMode(pathname)`. |
| `firestore.rules` | `favoriteShapeOk`, split create/update, counter document rules. |
| `src/services/favoritesService.ts` | Transactions for add/remove, `getFavoriteCount`, `deleteGuestFavorite`. |
| `src/services/accountClaimService.ts` | Guest transfer respects the limit; `ClaimSummary.favoritesDidNotFit`. |
| `src/components/SaveFavoriteBanner.tsx` (new) | The save-mode banner with Cancel. |
| `src/components/layout/OrderFooter.tsx` | `saveMode` prop: "Save to favourites", no cart summary. |
| `src/components/OrderStatusTracker.tsx` | Hidden in save mode. |
| `src/components/CommunityMixes.tsx` | `actionLabel` prop. |
| `src/components/ComboLists.tsx` | `countLabel` prop on `FavoritesList`. |
| `src/pages/Index.tsx` | Save mode wiring; limit on hearts and the "Save this combo?" prompt. |
| `src/pages/Account.tsx` | "x/20" heading and "+ Add favourite". |
| `scripts/backfill-favorite-counts.mjs` (new) | One-off counter backfill. |
| `tests/favoriteLimit.test.ts` (new) | Pure helpers. |
| `tests/favoritesLimitRules.test.ts` (new) | Emulator rules tests. |
| `tests/orderFooterSaveMode.dom.test.tsx` (new) | Footer in save mode. |
| `tests/socialRules.test.ts` | One existing create test now writes the counter too. |

---

### Task 1: Pure limit helpers

**Files:**
- Create: `src/services/favoriteLimit.ts`, `src/services/saveFavoriteMode.ts`
- Test: `tests/favoriteLimit.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/favoriteLimit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/favoriteLimit.test.ts`
Expected: FAIL, cannot resolve `../src/services/favoriteLimit`.

- [ ] **Step 3: Implement**

`src/services/favoriteLimit.ts`:

```ts
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
```

`src/services/saveFavoriteMode.ts`:

```ts
/**
 * The menu, mounted at its own path, where every "add to cart" saves a
 * favourite instead. Not `/?mode=...`: `/` is RedirectPage, which reads its own
 * query parameters. This path falls through to the `*` route, which is Index.
 * It contains neither "table-" nor "bar", so Index's table detection ignores it.
 */
export const SAVE_FAVORITE_PATH = '/save-favourite';

export const isSaveFavoriteMode = (pathname: string): boolean => pathname === SAVE_FAVORITE_PATH;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/favoriteLimit.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/favoriteLimit.ts src/services/saveFavoriteMode.ts tests/favoriteLimit.test.ts
git commit -m "feat: favourites limit and save-mode helpers"
```

---

### Task 2: Rules — the counter and the limit

**Files:**
- Modify: `firestore.rules` (the `match /users/{uid}/favorites/{comboId}` block, about lines 181–239)
- Create: `tests/favoritesLimitRules.test.ts`
- Modify: `tests/socialRules.test.ts` (test "a full custom-build favourite is accepted", about line 416)

- [ ] **Step 1: Write the failing rules tests**

`tests/favoritesLimitRules.test.ts`:

```ts
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc, doc, getDoc, runTransaction, setDoc, writeBatch, type Firestore,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const CAROL = 'carol-uid';
const GUEST = 'guest-uid';

const favPath = (uid: string, comboId: string) => `users/${uid}/favorites/${comboId}`;
const counterPath = (uid: string) => `users/${uid}/counters/favorites`;
const fav = (comboId: string) => ({ comboId, label: `Combo ${comboId}`, kind: 'mix' });

beforeAll(async () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  if (!rules.trim()) throw new Error('firestore.rules is empty');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-favourites-limit',
    firestore: { rules },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

const alice = () => testEnv.authenticatedContext(ALICE, { email: 'alice@example.com' }).firestore();
const bob = () => testEnv.authenticatedContext(BOB, { email: 'bob@example.com' }).firestore();
const carol = () => testEnv.authenticatedContext(CAROL, { email: 'carol@example.com' }).firestore();

/** `count` favourites mix:0..mix:{count-1}, plus a matching counter unless told not to. */
const seed = async (uid: string, count: number, withCounter = true) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (let i = 0; i < count; i += 1) {
      await setDoc(doc(db, favPath(uid, `mix:${i}`)), fav(`mix:${i}`));
    }
    if (withCounter) await setDoc(doc(db, counterPath(uid)), { count, changed: '' });
  });
};

const add = (db: Firestore, uid: string, comboId: string, count: number) => {
  const batch = writeBatch(db);
  batch.set(doc(db, favPath(uid, comboId)), fav(comboId));
  batch.set(doc(db, counterPath(uid)), { count, changed: comboId });
  return batch.commit();
};

const remove = (db: Firestore, uid: string, comboId: string, count: number) => {
  const batch = writeBatch(db);
  batch.delete(doc(db, favPath(uid, comboId)));
  batch.set(doc(db, counterPath(uid)), { count, changed: comboId });
  return batch.commit();
};

describe('creating favourites', () => {
  test('the first favourite creates the counter at 1', async () => {
    await assertSucceeds(add(alice(), ALICE, 'mix:new', 1));
  });

  test('the 20th favourite is accepted', async () => {
    await seed(ALICE, 19);
    await assertSucceeds(add(alice(), ALICE, 'mix:new', 20));
  });

  test('the 21st favourite is refused', async () => {
    await seed(ALICE, 20);
    await assertFails(add(alice(), ALICE, 'mix:new', 21));
  });

  test('a favourite created without moving the counter is refused', async () => {
    await seed(ALICE, 3);
    await assertFails(setDoc(doc(alice(), favPath(ALICE, 'mix:new')), fav('mix:new')));
  });

  test('a first favourite without creating the counter is refused', async () => {
    await assertFails(setDoc(doc(alice(), favPath(ALICE, 'mix:new')), fav('mix:new')));
  });

  test('the counter cannot skip ahead', async () => {
    await seed(ALICE, 3);
    await assertFails(add(alice(), ALICE, 'mix:new', 5));
  });

  test('a new counter must start at 1', async () => {
    await assertFails(add(alice(), ALICE, 'mix:new', 0));
    await assertFails(add(alice(), ALICE, 'mix:new', 2));
  });

  test('the same transaction the app runs is accepted', async () => {
    await seed(ALICE, 3);
    const db = alice();
    await assertSucceeds(runTransaction(db, async (tx) => {
      const favRef = doc(db, favPath(ALICE, 'mix:new'));
      const counterRef = doc(db, counterPath(ALICE));
      await tx.get(favRef);
      const counter = await tx.get(counterRef);
      tx.set(favRef, fav('mix:new'));
      tx.set(counterRef, { count: (counter.data()?.count ?? 0) + 1, changed: 'mix:new' });
    }));
  });
});

describe('overwriting and deleting favourites', () => {
  test('overwriting an existing favourite needs no counter change', async () => {
    await seed(ALICE, 3);
    await assertSucceeds(setDoc(doc(alice(), favPath(ALICE, 'mix:0')), {
      ...fav('mix:0'), tobaccoType: 'darkblend',
    }));
  });

  test('a favourite can always be deleted, counter or not', async () => {
    await seed(ALICE, 3);
    await assertSucceeds(deleteDoc(doc(alice(), favPath(ALICE, 'mix:0'))));
    await seed(BOB, 2, false);
    await assertSucceeds(deleteDoc(doc(bob(), favPath(BOB, 'mix:0'))));
  });

  test('deleting with the matching decrement is accepted', async () => {
    await seed(ALICE, 3);
    await assertSucceeds(remove(alice(), ALICE, 'mix:0', 2));
  });

  test('a customer over the limit can remove but not add', async () => {
    await seed(ALICE, 23);
    await assertFails(add(alice(), ALICE, 'mix:new', 24));
    await assertSucceeds(remove(alice(), ALICE, 'mix:0', 22));
    await assertFails(add(alice(), ALICE, 'mix:new', 23));
  });

  test('back under the limit, adding works again', async () => {
    await seed(ALICE, 20);
    await assertSucceeds(remove(alice(), ALICE, 'mix:0', 19));
    await assertSucceeds(add(alice(), ALICE, 'mix:new', 20));
  });
});

describe('the counter itself', () => {
  test('cannot go up without a favourite appearing', async () => {
    await seed(ALICE, 3);
    await assertFails(setDoc(doc(alice(), counterPath(ALICE)), { count: 4, changed: 'mix:new' }));
  });

  test('cannot go up by naming a favourite that already existed', async () => {
    await seed(ALICE, 3);
    const db = alice();
    const batch = writeBatch(db);
    batch.set(doc(db, favPath(ALICE, 'mix:0')), fav('mix:0'));
    batch.set(doc(db, counterPath(ALICE)), { count: 4, changed: 'mix:0' });
    await assertFails(batch.commit());
  });

  test('cannot go down without a favourite disappearing', async () => {
    await seed(ALICE, 3);
    await assertFails(setDoc(doc(alice(), counterPath(ALICE)), { count: 2, changed: 'mix:0' }));
  });

  test('cannot be set to an arbitrary value', async () => {
    await seed(ALICE, 3);
    await assertFails(setDoc(doc(alice(), counterPath(ALICE)), { count: 0, changed: 'mix:0' }));
  });

  test('cannot carry extra fields', async () => {
    const db = alice();
    const batch = writeBatch(db);
    batch.set(doc(db, favPath(ALICE, 'mix:new')), fav('mix:new'));
    batch.set(doc(db, counterPath(ALICE)), { count: 1, changed: 'mix:new', junk: true });
    await assertFails(batch.commit());
  });

  test('cannot be deleted', async () => {
    await seed(ALICE, 3);
    await assertFails(deleteDoc(doc(alice(), counterPath(ALICE))));
  });

  test('is readable by its owner only', async () => {
    await seed(ALICE, 3);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const pairId = [ALICE, BOB].sort().join('_');
      await setDoc(doc(ctx.firestore(), 'friendships', pairId), {
        uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
      });
    });
    await assertSucceeds(getDoc(doc(alice(), counterPath(ALICE))));
    await assertFails(getDoc(doc(bob(), counterPath(ALICE))));
    await assertFails(getDoc(doc(carol(), counterPath(ALICE))));
  });

  test('cannot be written for someone else', async () => {
    await assertFails(add(bob(), ALICE, 'mix:new', 1));
  });
});

describe('guest transfer', () => {
  beforeEach(async () => {
    await seed(GUEST, 2);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'accountClaims', GUEST), {
        secretHash: 'a'.repeat(64), claimedBy: ALICE,
      });
    });
  });

  test('the claimer deletes guest copies without touching the guest counter', async () => {
    await assertSucceeds(deleteDoc(doc(alice(), favPath(GUEST, 'mix:0'))));
  });

  test('the claimer cannot write the guest counter', async () => {
    await assertFails(setDoc(doc(alice(), counterPath(GUEST)), { count: 0, changed: 'mix:0' }));
  });

  test('copies into a full account are refused', async () => {
    await seed(ALICE, 20);
    await assertFails(add(alice(), ALICE, 'mix:copied', 21));
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/favoritesLimitRules.test.ts"`
Expected: FAIL. Among others, "the 21st favourite is refused" and "a favourite created without moving the counter is refused" fail (today's rules accept any create), and every counter write fails (no rule matches `counters`).

- [ ] **Step 3: Update the rules**

In `firestore.rules`, directly above `match /users/{uid}/favorites/{comboId} {`, add:

```
    // ------------------------------------------------- favourites limit
    // Rules cannot count a collection, so each customer's count lives in
    // users/{uid}/counters/favorites and moves in the SAME write as the
    // favourite it counts. Not a field on users/{uid}: that document's rule
    // lets its owner write anything, so a count there could be reset to 0.
    // Mirrors MAX_FAVORITES in src/services/favoriteLimit.ts.
    function maxFavorites() {
      return 20;
    }

    function favoriteCounterPath(uid) {
      return /databases/$(database)/documents/users/$(uid)/counters/favorites;
    }

    function favoriteDocPath(uid, comboId) {
      return /databases/$(database)/documents/users/$(uid)/favorites/$(comboId);
    }

    // exists() before get(): get() on a missing document raises.
    function favoriteCountBefore(uid) {
      return exists(favoriteCounterPath(uid)) ? get(favoriteCounterPath(uid)).data.count : 0;
    }

    function favoriteAdded(uid, comboId) {
      return !exists(favoriteDocPath(uid, comboId)) && existsAfter(favoriteDocPath(uid, comboId));
    }

    function favoriteRemoved(uid, comboId) {
      return exists(favoriteDocPath(uid, comboId)) && !existsAfter(favoriteDocPath(uid, comboId));
    }

    function favoriteCounterShapeOk(d) {
      return d.keys().hasOnly(['count', 'changed'])
        && d.count is int
        && d.changed is string && d.changed.size() >= 1 && d.changed.size() <= 100;
    }
```

Then replace the favourites block's `allow create, update: if isSignedIn() && request.auth.uid == uid && …;` with a shape function plus split rules. Move every condition after `request.auth.uid == uid` into `favoriteShapeOk(d)`, unchanged except that each `request.resource.data` becomes `d`. Keep all existing comments with the conditions they describe. The result:

```
    function favoriteShapeOk(d) {
      return d.keys().hasOnly([
             'comboId', 'label', 'kind', 'mixId', 'hookahId', 'tobaccoType',
             'flavorIds', 'tobaccoStrength', 'flavorPercentages', 'withIce',
             'hasLED', 'hasColoredWater', 'hasAlcohol', 'hasFruits', 'createdAt'])
        // … every existing condition, with request.resource.data → d …
        && (!('createdAt' in d) || d.createdAt == request.time);
    }

    match /users/{uid}/favorites/{comboId} {
      allow read: if isSignedIn()
        && (request.auth.uid == uid || isFriendOf(uid) || hasClaimOn(uid));
      // A new favourite must raise the counter by exactly one, to at most
      // maxFavorites(), in the same write. The counter's own rule below checks
      // the other direction: that the favourite it names really appeared.
      allow create: if isSignedIn() && request.auth.uid == uid
        && favoriteShapeOk(request.resource.data)
        && existsAfter(favoriteCounterPath(uid))
        && getAfter(favoriteCounterPath(uid)).data.count == favoriteCountBefore(uid) + 1
        && getAfter(favoriteCounterPath(uid)).data.count <= maxFavorites();
      // Overwriting a favourite that exists (e.g. recording the tobacco type a
      // mix was ordered with) never changes the count.
      allow update: if isSignedIn() && request.auth.uid == uid
        && favoriteShapeOk(request.resource.data);
      // Unchanged and counter-free on purpose: a stale or missing count must
      // never stop anyone removing a favourite. Skipping the decrement only
      // costs the customer a slot; it can never grant one.
      allow delete: if isSignedIn() && (request.auth.uid == uid || hasClaimOn(uid));
    }

    match /users/{uid}/counters/favorites {
      allow read: if isSignedIn() && request.auth.uid == uid;
      allow create: if isSignedIn() && request.auth.uid == uid
        && favoriteCounterShapeOk(request.resource.data)
        && request.resource.data.count == 1
        && favoriteAdded(uid, request.resource.data.changed);
      allow update: if isSignedIn() && request.auth.uid == uid
        && favoriteCounterShapeOk(request.resource.data)
        && ((request.resource.data.count == resource.data.count + 1
             && request.resource.data.count <= maxFavorites()
             && favoriteAdded(uid, request.resource.data.changed))
          || (request.resource.data.count == resource.data.count - 1
             && request.resource.data.count >= 0
             && favoriteRemoved(uid, request.resource.data.changed)));
      // No delete: removing the counter would reset the count to 0.
    }
```

The old block's comments about hasClaimOn on read and about the claimer's delete stay where they are.

- [ ] **Step 4: Update the one existing test that creates a favourite**

In `tests/socialRules.test.ts`, the test `'a full custom-build favourite is accepted'` creates `custom:abc` with a bare `setDoc`, which the new create rule refuses. Write the counter in the same batch. Add `writeBatch` to the `firebase/firestore` import, then replace the test body:

```ts
  // The full favourite shape a custom build produces must still be writable.
  // Written with its counter, as favoritesService does - see
  // favoritesLimitRules.test.ts for the limit itself.
  test('a full custom-build favourite is accepted', async () => {
    const db = alice();
    const batch = writeBatch(db);
    batch.set(doc(db, `users/${ALICE}/favorites/custom:abc`), {
      comboId: 'custom:abc', label: 'Khalil Mamoon - Mint, Lemon', kind: 'custom',
      hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia'],
      tobaccoStrength: 6, flavorPercentages: { 'mint:virginia': 100 },
      withIce: true, hasLED: true, hasColoredWater: false,
      hasAlcohol: false, hasFruits: false, createdAt: serverTimestamp(),
    });
    batch.set(doc(db, `users/${ALICE}/counters/favorites`), { count: 1, changed: 'custom:abc' });
    await assertSucceeds(batch.commit());
  });
```

- [ ] **Step 5: Run the full suite**

Run: `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm test`
Expected: PASS, every file. If anything else in `socialRules`, `rules` or `socialExtrasRules` now fails because it creates a favourite without a counter, fix the test the same way as Step 4 — never by loosening the rule.

- [ ] **Step 6: Prove each restriction is load-bearing**

For each line below, edit `firestore.rules`, run `npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/favoritesLimitRules.test.ts"` (with the `PATH` prefix), confirm the named test fails, then `git checkout firestore.rules`:

| Weaken | Test that must fail |
|---|---|
| drop `&& getAfter(...).data.count <= maxFavorites()` from favourite create | the 21st favourite is refused |
| drop the `existsAfter(...) && getAfter(...) == before + 1` lines from favourite create | a favourite created without moving the counter is refused |
| replace `favoriteAdded(...)` in the counter update with `true` | cannot go up without a favourite appearing |
| replace `favoriteRemoved(...)` with `true` | cannot go down without a favourite disappearing |
| drop `request.resource.data.count == 1` from counter create | a new counter must start at 1 |
| add `allow delete: if isSignedIn() && request.auth.uid == uid;` to the counter | cannot be deleted |

- [ ] **Step 7: Commit**

```bash
git add firestore.rules tests/favoritesLimitRules.test.ts tests/socialRules.test.ts
git commit -m "feat: enforce 20 favourites in the rules through a counter document"
```

---

### Task 3: Service — transactions

**Files:**
- Modify: `src/services/favoritesService.ts`

No unit test: the module imports the production Firebase app. The rules tests in Task 2 run the same transaction shape against the emulator, and the type checker covers callers.

- [ ] **Step 1: Replace `addFavorite` and `removeFavorite`, add two helpers**

Change the import block to:

```ts
import {
  collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { truncateLabel } from '@/services/comboId';
import { FavoritesFullError, hasRoomForFavorite } from '@/services/favoriteLimit';
```

Below `const favoritesRef = …`, add:

```ts
/** See the favourites-limit section of firestore.rules. */
const counterRef = (uid: string) => doc(firestore, 'users', uid, 'counters', 'favorites');

const readCount = (data: { count?: unknown } | undefined): number =>
  (typeof data?.count === 'number' ? data.count : 0);
```

Replace `addFavorite` with:

```ts
/**
 * Deliberately stores ids and never prices. Re-ordering re-prices from the live
 * menu; a stored price would let a saved favourite quietly undercharge after a
 * price rise.
 *
 * A transaction, so the favourite and its counter move together; the rules
 * refuse either without the other. Overwriting an existing favourite leaves the
 * count alone. Throws FavoritesFullError, without writing, when a NEW favourite
 * would go past the limit - read inside the transaction, so a list filled up on
 * another device is caught here too.
 *
 * Needs a connection: a transaction is not queued offline the way setDoc was.
 */
export const addFavorite = async (uid: string, favorite: FavoriteCombo): Promise<void> => {
  const { createdAt, ...rest } = favorite;
  const payload = {
    ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
    label: truncateLabel(favorite.label),
    createdAt: serverTimestamp(),
  };
  const favoriteRef = doc(favoritesRef(uid), favorite.comboId);

  await runTransaction(firestore, async (tx) => {
    const existing = await tx.get(favoriteRef);
    const counter = await tx.get(counterRef(uid));
    if (existing.exists()) {
      tx.set(favoriteRef, payload);
      return;
    }
    const count = readCount(counter.data());
    if (!hasRoomForFavorite(count)) throw new FavoritesFullError();
    tx.set(favoriteRef, payload);
    tx.set(counterRef(uid), { count: count + 1, changed: favorite.comboId });
  });
};
```

Replace `removeFavorite` with:

```ts
/** Deletes the favourite and, when it existed, gives its slot back. */
export const removeFavorite = async (uid: string, comboId: string): Promise<void> => {
  const favoriteRef = doc(favoritesRef(uid), comboId);
  await runTransaction(firestore, async (tx) => {
    const existing = await tx.get(favoriteRef);
    const counter = await tx.get(counterRef(uid));
    if (!existing.exists()) return;
    tx.delete(favoriteRef);
    const count = readCount(counter.data());
    if (counter.exists() && count > 0) {
      tx.set(counterRef(uid), { count: count - 1, changed: comboId });
    }
  });
};

/**
 * For the guest transfer only. The claimer may delete a guest's favourites but
 * not write the guest's counter, and the guest uid is abandoned anyway.
 */
export const deleteGuestFavorite = async (anonUid: string, comboId: string): Promise<void> => {
  await deleteDoc(doc(favoritesRef(anonUid), comboId));
};

/** The stored count; 0 before a customer's first favourite. */
export const getFavoriteCount = async (uid: string): Promise<number> => {
  const snapshot = await getDoc(counterRef(uid));
  return readCount(snapshot.data());
};
```

Remove `setDoc` from the import (no longer used).

- [ ] **Step 2: Type check and build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → Expected: `4`
Run: `npm run build 2>&1 | grep -E "built in|error"` → Expected: `✓ built in …`

- [ ] **Step 3: Commit**

```bash
git add src/services/favoritesService.ts
git commit -m "feat: write favourites and their counter in one transaction"
```

---

### Task 4: Guest transfer respects the limit

**Files:**
- Modify: `src/services/accountClaimService.ts` (import line 12, `ClaimSummary` about line 70, `copyFavorites` about line 325, `runClaim` return about line 480, `describeClaim` about line 536)

- [ ] **Step 1: Change the import**

```ts
import {
  addFavorite, deleteGuestFavorite, getFavoriteCount, listFavorites,
} from '@/services/favoritesService';
import {
  FavoritesFullError, describeFavoritesThatDidNotFit, favoritesThatFit,
} from '@/services/favoriteLimit';
```

- [ ] **Step 2: Extend `ClaimSummary`**

Add after `ratings: number;`:

```ts
  /**
   * Guest favourites left behind because the account was full. Not part of
   * `outstanding`: a retry cannot make room, so they must not keep the claim
   * record alive. They stay on the guest uid - not deleted, but unreachable
   * once the claim completes.
   */
  favoritesDidNotFit: number;
```

- [ ] **Step 3: Replace `copyFavorites`**

```ts
interface FavoriteMoveResult extends MoveResult {
  didNotFit: number;
}

/**
 * Copy before delete, one item at a time, so an interrupted run can never lose
 * an entry: the worst it can leave behind is a guest copy that has already been
 * carried across, which the next run deletes.
 *
 * Only as many as fit under the limit, newest first. The rest stay where they
 * are and are reported, never deleted.
 */
const copyFavorites = async (anonUid: string, newUid: string): Promise<FavoriteMoveResult> => {
  let guestFavorites: Awaited<ReturnType<typeof listFavorites>>;
  let existing: Awaited<ReturnType<typeof listFavorites>>;
  let count: number;
  try {
    [guestFavorites, existing, count] = await Promise.all([
      listFavorites(anonUid),
      listFavorites(newUid),
      getFavoriteCount(newUid),
    ]);
  } catch (error) {
    // Reading the guest's list needs the claim, so this is also how "the take
    // did not work" shows up. Unknown how much is left, so report one failure
    // and let the retry find out.
    console.error('Could not read the favourites to move:', error);
    return { copied: 0, failed: 1, didNotFit: 0 };
  }
  const mine = new Set(existing.map((favorite) => favorite.comboId));
  const { fit, left } = favoritesThatFit(
    guestFavorites.filter((favorite) => !mine.has(favorite.comboId)),
    count,
  );

  let copied = 0;
  let failed = 0;
  let didNotFit = left.length;
  // Already on the account: only the guest copy needs to go.
  for (const favorite of guestFavorites.filter((f) => mine.has(f.comboId))) {
    try {
      await deleteGuestFavorite(anonUid, favorite.comboId);
    } catch (error) {
      console.error(`Favourite ${favorite.comboId} could not be removed from the guest:`, error);
      failed += 1;
    }
  }
  for (const favorite of fit) {
    try {
      // addFavorite re-stamps createdAt with serverTimestamp(), and has to:
      // the rule pins it to request.time, so the original date cannot be
      // carried over. "Saved on" becomes "moved on" for these entries.
      await addFavorite(newUid, favorite);
      copied += 1;
      await deleteGuestFavorite(anonUid, favorite.comboId);
    } catch (error) {
      // Filled up from another device mid-transfer: as good as not fitting.
      if (error instanceof FavoritesFullError) {
        didNotFit += 1;
      } else {
        console.error(`Favourite ${favorite.comboId} could not be moved:`, error);
        failed += 1;
      }
    }
  }
  return { copied, failed, didNotFit };
};
```

- [ ] **Step 4: Return it from `runClaim`**

In the object `runClaim` returns, add `favoritesDidNotFit: favorites.didNotFit,` after `ratings: ratings.copied,`. Run `npx tsc --noEmit -p tsconfig.app.json` and add the same field (`favoritesDidNotFit: 0`) anywhere else a `ClaimSummary` literal is built, if tsc reports one.

- [ ] **Step 5: Mention it in `describeClaim`**

Replace the body of `describeClaim` after `if (!summary) return null;` so the did-not-fit sentence is appended, and stands alone when nothing moved:

```ts
  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;
  const parts: string[] = [];
  if (summary.orders) parts.push(plural(summary.orders, 'order'));
  if (summary.favorites) parts.push(plural(summary.favorites, 'favourite'));
  if (summary.ratings) parts.push(plural(summary.ratings, 'rating'));
  const full = describeFavoritesThatDidNotFit(summary.favoritesDidNotFit);
  const withFull = (text: string) => (full ? `${text} ${full}` : text);

  if (!parts.length) {
    if (summary.outstanding) {
      return withFull('We could not move your guest data over just now - we will try again next time you sign in.');
    }
    return full;
  }

  const list = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return withFull(summary.outstanding
    ? `${list} from this device moved to your account; the rest will follow next time you sign in.`
    : `${list} from this device moved to your account.`);
```

- [ ] **Step 6: Type check, build, suite**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → `4`
Run: `npm run build 2>&1 | grep -E "built in|error"` → `✓ built in …`
Run: `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm test` → all pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/accountClaimService.ts
git commit -m "feat: move only the guest favourites that fit, and say how many did not"
```

---

### Task 5: Save-mode building blocks

**Files:**
- Create: `src/components/SaveFavoriteBanner.tsx`
- Modify: `src/components/layout/OrderFooter.tsx`, `src/components/OrderStatusTracker.tsx`, `src/components/CommunityMixes.tsx`, `src/components/ComboLists.tsx`
- Test: `tests/orderFooterSaveMode.dom.test.tsx`

- [ ] **Step 1: Write the failing DOM test**

`tests/orderFooterSaveMode.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React, { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider, useCart } from '../src/contexts/CartContext';
import { OrderFooter, type BuildState } from '../src/components/layout/OrderFooter';

afterEach(cleanup);

const build: BuildState = {
  hookahName: 'Darkblend', tobaccoLabel: 'Darkblend · Medium',
  flavors: [{ id: 'mint', name: 'Mint' }], flavorMax: 3, complete: true, onAdd: () => {},
};

/** Puts one item in the cart, so the cart summary would normally show. */
function WithCartItem({ children }: { children: React.ReactNode }) {
  const { addItem } = useCart();
  useEffect(() => {
    addItem({ id: 'x', type: 'mix', name: 'Turbo Mix', price: 100, image: '', comboId: 'mix:x', table: '/table-1' });
  }, [addItem]);
  return <>{children}</>;
}

const renderFooter = (props: React.ComponentProps<typeof OrderFooter>) => render(
  <MemoryRouter>
    <CartProvider>
      <WithCartItem>
        <OrderFooter {...props} />
      </WithCartItem>
    </CartProvider>
  </MemoryRouter>,
);

describe('OrderFooter in save mode', () => {
  it('offers to save the build instead of adding it to the cart', () => {
    renderFooter({ build, saveMode: true });

    expect(screen.getByRole('button', { name: 'Save to favourites' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to Cart' })).toBeNull();
  });

  it('shows no cart summary while nothing is being built', () => {
    renderFooter({ build: { ...build, hookahName: null, tobaccoLabel: null, flavors: [] }, saveMode: true });

    expect(screen.queryByRole('button', { name: 'View Cart' })).toBeNull();
  });

  it('is unchanged outside save mode', () => {
    renderFooter({ build });

    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeTruthy();
  });
});
```

If `addItem` from `useCart` is not referentially stable and the effect loops, change the effect's dependency array to `[]` with an `// eslint-disable-next-line react-hooks/exhaustive-deps` comment.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/orderFooterSaveMode.dom.test.tsx`
Expected: FAIL. "Save to favourites" is not found, and `saveMode` is not a known prop (type error under tsc; at runtime the first test fails).

- [ ] **Step 3: `OrderFooter` — the `saveMode` prop**

In `src/components/layout/OrderFooter.tsx`, add to `OrderFooterProps`:

```ts
  /**
   * The menu at /save-favourite: the build's button saves a favourite, and the
   * cart summary is hidden - nothing on this screen is ordered.
   */
  saveMode?: boolean;
```

Destructure it: `({ build, primaryAction, saveMode = false })`. Directly after the `hasBuild` constant, add:

```ts
  if (saveMode && !hasBuild) return null;
```

Change the build button's text from `Add to Cart` to:

```tsx
            {saveMode ? 'Save to favourites' : 'Add to Cart'}
```

- [ ] **Step 4: Run the DOM test**

Run: `npx vitest run tests/orderFooterSaveMode.dom.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: The banner**

`src/components/SaveFavoriteBanner.tsx`:

```tsx
import React from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onCancel: () => void;
}

/** Pinned above the menu at /save-favourite, so nobody thinks they are ordering. */
export const SaveFavoriteBanner: React.FC<Props> = ({ onCancel }) => (
  <div className="flex items-center gap-3 rounded-md border border-primary bg-turbo-card p-3">
    <Heart className="h-5 w-5 flex-shrink-0 text-primary" />
    <p className="flex-1 text-sm">Building a favourite - nothing will be ordered</p>
    <Button variant="ghost" size="sm" onClick={onCancel}>
      Cancel
    </Button>
  </div>
);
```

- [ ] **Step 6: Hide the order tracker in save mode**

In `src/components/OrderStatusTracker.tsx`, add the imports:

```ts
import { useLocation } from 'react-router-dom';
import { isSaveFavoriteMode } from '@/services/saveFavoriteMode';
```

After the existing `useState` line (hooks must run before any return), add `const location = useLocation();` and change the early return to:

```ts
  if (activeOrders.length === 0 || isSaveFavoriteMode(location.pathname)) return null;
```

The tracker is rendered inside `BrowserRouter` in `App.tsx` (line 85), so `useLocation` is available. Confirm by reading `src/App.tsx` around line 85 before editing.

- [ ] **Step 7: `CommunityMixes` — the `actionLabel` prop**

In `src/components/CommunityMixes.tsx`, add to `Props`:

```ts
  /** "Add" on the menu; "Save" in save mode. */
  actionLabel?: string;
```

Destructure `actionLabel = 'Add'` and replace the button's literal `Add` text with `{actionLabel}`.

- [ ] **Step 8: `FavoritesList` — the `countLabel` prop**

In `src/components/ComboLists.tsx`, add to `FavoritesListProps`:

```ts
  // "7/20" on the customer's own list. Friends see a plain count.
  countLabel?: string;
```

Destructure `countLabel` and change the heading text to:

```tsx
        {`${heading} (${countLabel ?? favorites.length})`}
```

- [ ] **Step 9: Verify and commit**

Run: `npx vitest run tests/orderFooterSaveMode.dom.test.tsx tests/translateSafeText.guard.test.ts` → PASS
Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → `4`

```bash
git add src/components tests/orderFooterSaveMode.dom.test.tsx
git commit -m "feat: save-mode banner, footer, tracker and list labels"
```

---

### Task 6: The menu in save mode, and the limit on the menu

**Files:**
- Modify: `src/pages/Index.tsx`

Read the whole of each region before editing it; line numbers are from `origin/main` at 62d05c6 and drift as you edit.

- [ ] **Step 1: Imports**

Change the favourites import (line 26) and add three:

```ts
import { addFavorite, listFavorites, removeFavorite } from '@/services/favoritesService';
import { FAVORITES_FULL_MESSAGE, FavoritesFullError, hasRoomForFavorite } from '@/services/favoriteLimit';
import { isSaveFavoriteMode } from '@/services/saveFavoriteMode';
import { SaveFavoriteBanner } from '@/components/SaveFavoriteBanner';
```

- [ ] **Step 2: Mode flag and the save action**

After `const { user } = useAuth();` (line 76) add:

```ts
  // /save-favourite: the same menu, but every "add to cart" saves a favourite.
  const saveMode = isSaveFavoriteMode(location.pathname);
```

`location` is declared on line 74, above this — keep that order.

After the `useEffect` that loads `favoriteIds` (ends about line 151), add:

```ts
  const showFavoritesFull = () => {
    errorHaptic();
    toast({ title: 'Favourites full', description: FAVORITES_FULL_MESSAGE, variant: 'destructive' });
  };

  /**
   * Save mode's replacement for every "add to cart". Already-saved combos are
   * not rewritten: the comboId is the document id, so a second copy is
   * impossible anyway, and rewriting would only move createdAt.
   */
  const saveFavoriteFromMenu = async (favorite: FavoriteCombo) => {
    if (!user) {
      toast({ title: 'Could not save', description: 'Please try again in a moment.', variant: 'destructive' });
      return;
    }
    if (favoriteIds.has(favorite.comboId)) {
      toast({ title: 'Already in your favourites' });
      navigate('/account');
      return;
    }
    try {
      await addFavorite(user.uid, favorite);
      setFavoriteIds((prev) => new Set(prev).add(favorite.comboId));
      successHaptic();
      toast({ title: 'Saved to favourites' });
      navigate('/account');
    } catch (error) {
      if (error instanceof FavoritesFullError) {
        showFavoritesFull();
      } else {
        errorHaptic();
        toast({ title: 'Could not save', variant: 'destructive' });
      }
    }
  };
```

- [ ] **Step 3: Hearts respect the limit**

In `toggleMixFavorite`, directly after `const wasFavorite = favoriteIds.has(comboId);`, add:

```ts
    // The heart stays tappable at the limit so this message can be seen.
    if (!wasFavorite && !hasRoomForFavorite(favoriteIds.size)) {
      showFavoritesFull();
      return;
    }
```

In its `catch (error)`, replace `toast({ title: 'Could not update favourites', variant: 'destructive' });` with:

```ts
      if (error instanceof FavoritesFullError) {
        showFavoritesFull();
      } else {
        toast({ title: 'Could not update favourites', variant: 'destructive' });
      }
```

- [ ] **Step 4: Recommended mixes save in save mode**

In `addMixToCart`, at the top of the function body add:

```ts
    // No table needed: nothing is ordered in save mode.
    if (saveMode) {
      setMixDialogId(mixId);
      return;
    }
```

In `confirmMixToCart`, replace

```ts
    const tableId = localStorage.getItem('turbo-table');
    setMixDialogId(null);
    if (!mix || !tableId) return;
```

with

```ts
    const tableId = localStorage.getItem('turbo-table');
    setMixDialogId(null);
    if (!mix) return;

    if (saveMode) {
      // The tobacco chosen here is stored, so "order again" restores this
      // exact version rather than resolveMixCategory's fallback.
      void saveFavoriteFromMenu({
        comboId: comboIdForMix(mix.id), label: mix.name, kind: 'mix', mixId: mix.id, tobaccoType: category,
      });
      return;
    }
    if (!tableId) return;
```

On the recommended-mix card's button (`onClick={() => addMixToCart(mix.id)}`, about line 790), change its text from `Add` to `{saveMode ? 'Save' : 'Add'}`.

- [ ] **Step 5: Custom build saves in save mode**

In `requestAddToCart`, wrap the table check so it is skipped in save mode: change `if (!isValidTableId(tableId)) {` to `if (!saveMode && !isValidTableId(tableId)) {`.

In `finalizeAddToCart`:

1. Change `if (!selectedHookahData || !tableId || !selectedTobaccoType) return;` to
   `if (!selectedHookahData || !selectedTobaccoType || (!saveMode && !tableId)) return;`
2. Directly after the `favoriteFlavorPercentages` constant, build the favourite once:

```ts
    // The same object the "Save this combo?" prompt offers after ordering, and
    // what save mode stores directly.
    const favorite: FavoriteCombo = {
      comboId: comboIdForCustom(selectedHookahData.id, finalTobaccoType, flavorIds),
      label: buildComboLabel(selectedHookahData.name, selectedFlavorNames),
      kind: 'custom',
      hookahId: selectedHookahData.id,
      tobaccoType: finalTobaccoType,
      flavorIds,
      tobaccoStrength,
      flavorPercentages: favoriteFlavorPercentages,
      withIce,
      hasLED: selectedAddons.hasLED,
      hasColoredWater: selectedAddons.hasColoredWater,
      hasAlcohol: selectedAddons.hasAlcohol,
      hasFruits: selectedAddons.hasFruits,
    };

    if (saveMode) {
      void saveFavoriteFromMenu(favorite);
      return;
    }
```

3. Directly after that `if (saveMode) { … }` block, add `if (!tableId) return;`. It narrows `tableId` to `string` for the `addItem` call below. Do not use a non-null assertion.
4. Replace the `setLastBuild({ … })` literal with `setLastBuild(favorite);`, keeping the comment above it.

- [ ] **Step 6: The "Save this combo?" prompt respects the limit**

Change `{user && lastBuild && (` (about line 1242) to:

```tsx
      {user && lastBuild && hasRoomForFavorite(favoriteIds.size) && (
```

Inside its Save button, change the bare `catch {` to `catch (error) {` and its body to:

```ts
                    if (error instanceof FavoritesFullError) showFavoritesFull();
                    else toast({ title: 'Could not save', variant: 'destructive' });
```

- [ ] **Step 7: Banner, header, hookah of the day, community mixes, footer**

1. Header cart button (about line 713): render it only outside save mode — wrap the `<Button … onClick={navigateToCart}> … </Button>` in `{!saveMode && ( … )}`. To keep the title centred, render `<div className="w-10" />` in its place when `saveMode`: `{saveMode ? <div className="w-10" /> : ( …button… )}`.
2. First child of `<div className="container mx-auto px-4 py-6 space-y-8">` (about line 722): add
   ```tsx
          {saveMode && <SaveFavoriteBanner onCancel={() => navigate('/account')} />}
   ```
3. Hookah of the day: change `{hookahOfTheDay && (` to `{!saveMode && hookahOfTheDay && (` and add the comment `{/* Its button orders; save mode orders nothing. */}` above it.
4. Community mixes (about line 813): replace the element with
   ```tsx
            <CommunityMixes
              mixes={communityMixes}
              menu={menuSnapshot}
              onAdd={saveMode ? (favorite) => { void saveFavoriteFromMenu(favorite); } : orderCommunityMix}
              actionLabel={saveMode ? 'Save' : 'Add'}
            />
   ```
5. `<OrderFooter` (about line 1187): add the prop `saveMode={saveMode}`.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → `4`
Run: `npx vitest run tests/translateSafeText.guard.test.ts tests/turboColors.guard.test.ts` → PASS
Run: `npm run build 2>&1 | grep -E "built in|error"` → `✓ built in …`

- [ ] **Step 9: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: save favourites from the menu at /save-favourite, and stop at 20"
```

---

### Task 7: Account — count and "Add favourite"

**Files:**
- Modify: `src/pages/Account.tsx`

- [ ] **Step 1: Imports**

Add:

```ts
import { formatFavoriteCount, hasRoomForFavorite } from '@/services/favoriteLimit';
import { SAVE_FAVORITE_PATH } from '@/services/saveFavoriteMode';
```

`Button` and `navigate` already exist in this file (Button is imported on line 4; confirm `const navigate = useNavigate()` exists — it is used for `/my-orders` — before relying on it).

- [ ] **Step 2: Pass the count and the button to `FavoritesList`**

Replace the `<FavoritesList … />` element (about line 211) with:

```tsx
            <FavoritesList
              favorites={favorites}
              heading="Favourites"
              countLabel={formatFavoriteCount(favorites.length)}
              emptyText="Tap the heart on a mix, or add one below."
              onReorder={handleReorder}
              onRemove={handleRemoveFavorite}
              onShare={setSharing}
              footer={(
                <div className="mt-3 space-y-1">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={!hasRoomForFavorite(favorites.length)}
                    onClick={() => navigate(SAVE_FAVORITE_PATH)}
                  >
                    + Add favourite
                  </Button>
                  {!hasRoomForFavorite(favorites.length) && (
                    <p className="text-center text-xs text-turbo-muted">Remove one to add another</p>
                  )}
                </div>
              )}
            />
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → `4`
Run: `npx vitest run tests/translateSafeText.guard.test.ts` → PASS

```bash
git add src/pages/Account.tsx
git commit -m "feat: show the favourites count and add favourites from Account"
```

---

### Task 8: Backfill script

**Files:**
- Create: `scripts/backfill-favorite-counts.mjs`

- [ ] **Step 1: Write the script**

```js
/**
 * One-off: set users/{uid}/counters/favorites to each customer's real number of
 * favourites. Run straight after deploying the rules that introduce the counter
 * (see docs/superpowers/specs/2026-11-13-favourites-manual-add-and-limit-design.md,
 * "Release order").
 *
 *   node scripts/backfill-favorite-counts.mjs           # write
 *   node scripts/backfill-favorite-counts.mjs --dry-run # report only
 *
 * Requires serviceAccountKey.json in the repo root, downloaded from
 * Firebase console -> Project settings -> Service accounts.
 * That file is gitignored and must never be committed.
 *
 * Idempotent: it always overwrites with the real count, so it can be re-run to
 * correct drift. Covers anonymous guests too - their favourites live under the
 * same path.
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');
const MAX_FAVORITES = 20; // src/services/favoriteLimit.ts

initializeApp({ credential: cert(JSON.parse(readFileSync('serviceAccountKey.json', 'utf8'))) });
const db = getFirestore();

// favorites subcollections exist under user ids that may have no users/{uid}
// document (guests), so walk the collection group, not the users collection.
const counts = new Map();
const snapshot = await db.collectionGroup('favorites').select().get();
for (const favorite of snapshot.docs) {
  const userDoc = favorite.ref.parent.parent;
  if (!userDoc || userDoc.parent.id !== 'users') continue;
  counts.set(userDoc.id, (counts.get(userDoc.id) ?? 0) + 1);
}

let over = 0;
for (const [uid, count] of counts) {
  if (count > MAX_FAVORITES) over += 1;
  if (!dryRun) {
    await db.doc(`users/${uid}/counters/favorites`).set({ count, changed: '' });
  }
}

console.log(`${dryRun ? 'Would update' : 'Updated'} ${counts.size} customer(s).`);
console.log(`${over} customer(s) are over ${MAX_FAVORITES} and keep everything.`);
```

- [ ] **Step 2: Syntax check only**

Run: `node --check scripts/backfill-favorite-counts.mjs`
Expected: no output. Do **not** run the script: it needs the production service account and is run by the owner after the rules deploy.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-favorite-counts.mjs
git commit -m "feat: script to backfill favourite counters"
```

---

### Task 9: Whole-branch verification

- [ ] **Step 1:** `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm test` → every file passes; note the totals.
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"` → `4`.
- [ ] **Step 3:** `npm run build` → clean.
- [ ] **Step 4:** `git diff origin/main -- firestore.rules | grep '^-' | grep -v '^---'` — every removed line must be one that moved into `favoriteShapeOk` (the old `allow create, update` and its `request.resource.data` conditions). Nothing else may be removed.

---

### Task 10: Spec note and PR

- [ ] **Step 1:** Append to the spec:

```markdown
## Changes during implementation

- **Save mode lives at `/save-favourite`, not `/?mode=save-favourite`.** `/` is
  `RedirectPage`, which reads its own query parameters; the menu is the `*` route.
- **The hookah-of-the-day card is hidden in save mode.** Its button orders
  (#20 made it add straight to the cart), and save mode orders nothing.
- **The backfill script has a `--dry-run` flag** to see how many customers it
  would touch, and how many are over 20, before writing.
```

- [ ] **Step 2:** Commit, push, and open the PR. The PR body must state the release order from the spec (merge → rules deploy → backfill script, straight after), that the script needs `serviceAccountKey.json`, and the dry-run option.
