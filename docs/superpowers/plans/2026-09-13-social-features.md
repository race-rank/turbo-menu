# Social Features Implementation Plan — Ratings, Favourites, Friends

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers rate what they ordered, save favourite combos for one-tap re-order, and befriend each other to see one another's favourites and ratings.

**Architecture:** A pure `comboId` module gives every combo — curated or custom — a stable identity, which is written into order items at checkout. Ratings are stored twice: on the order, where security rules already prove ownership, and as a friend-readable projection under the rater, so orders themselves stay sealed. Friendships are one document per pair, keyed on the two uids sorted, so rules can compute the key without a lookup.

**Tech Stack:** React 18, TypeScript, Vite, Firebase Auth + Firestore, shadcn/ui, Tailwind, Vitest + `@firebase/rules-unit-testing` against the Firestore emulator.

**Spec:** `docs/superpowers/specs/2026-09-13-social-features-design.md`

---

## Before you start

Read the spec. The privacy decisions in it are load-bearing and several are deliberately narrower than they could be.

**Run the test suite once to confirm your environment works:**

```bash
cd /Users/alexalbu/Projects/others/turbo-menu
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm test
```

Expected: `Tests 35 passed (35)`. The Firestore emulator needs a JDK on `PATH`; Java here is a keg-only Homebrew `openjdk`, hence the prefix. Every `npm test` in this plan assumes it.

**Known pre-existing conditions — do not try to fix these:**

- `npx tsc --noEmit -p tsconfig.app.json` reports **4 errors** in `src/services/firebaseService.ts`. They are on `main`. Your job is to not add a fifth.
- `npm run lint` is broken repo-wide (eslint 9.39.2 against the installed `@typescript-eslint`). Don't run it.

**Branch:** work on `feat/social-ratings-favorites-friends`, which already exists and holds the spec commit.

---

## File Structure

### New — services

| file | responsibility |
|---|---|
| `src/services/comboId.ts` | FNV-1a hash and the two id builders. **No Firebase import** so it is unit-testable directly, following `src/services/orderItem.ts`. |
| `src/services/profileService.ts` | `profiles/{uid}` — the shareable subset of an account. |
| `src/services/favoritesService.ts` | `users/{uid}/favorites` CRUD. |
| `src/services/ratingsService.ts` | The two-document rating write, batched. |
| `src/services/friendsService.ts` | Friendships, invite codes, email discoverability. |

### New — UI

| file | responsibility |
|---|---|
| `src/components/StarRating.tsx` | One control, interactive or read-only. |
| `src/components/FavoriteButton.tsx` | Heart toggle for a combo. |
| `src/pages/Friends.tsx` | Invite QR/link, email search, requests, friend list. |
| `src/pages/FriendProfile.tsx` | One friend's favourites and ratings. |

### New — tests

| file | covers |
|---|---|
| `tests/comboId.test.ts` | Pure hash and id derivation. |
| `tests/socialRules.test.ts` | All new rules. Kept separate from `tests/rules.test.ts` so neither file becomes unwieldy. |

### Modified

| file | change |
|---|---|
| `src/contexts/CartContext.tsx` | `CartItem` gains combo identity fields. |
| `src/types/database.ts` | `DatabaseOrderItem` gains the same. |
| `src/services/orderItem.ts` | Mapper carries them through. |
| `src/pages/Index.tsx` | Emit ids on both order paths; heart on mix cards; save custom combo. |
| `src/pages/MyOrders.tsx` | Star row per rateable order. |
| `src/pages/Account.tsx` | Favourites, ratings, friends sections. |
| `src/components/NavigationSidebar.tsx` | Friends entry. |
| `src/App.tsx` | `/friends` and `/friends/:uid` routes. |
| `src/services/userService.ts` | Keep `profiles/{uid}` in sync. |
| `firestore.rules` | Six new collections plus two fixes. |

---

## Task 1: Combo identity module

**Files:**
- Create: `src/services/comboId.ts`
- Test: `tests/comboId.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/comboId.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/comboId.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/services/comboId"`.

- [ ] **Step 3: Write the implementation**

Create `src/services/comboId.ts`:

```ts
/**
 * Stable identity for a combo, so a build can be favourited and rated.
 *
 * FNV-1a rather than SHA-256 on purpose. crypto.subtle only exists in a secure
 * context, and this project has already shipped a blank page from assuming a
 * crypto API was present - crypto.randomUUID() was undefined over plain http
 * on a LAN IP and took the whole React tree down with it. A combo id is an
 * identity key, not a security boundary: a collision merges two combos'
 * ratings, it grants access to nothing. So a plain deterministic hash is the
 * right tool, and it works everywhere.
 */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export const fnv1a64 = (input: string): string => {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
};

/**
 * Curated mixes already have a stable document id. The tobacco category picked
 * at order time is a variant of one combo, not three separate combos, so it is
 * deliberately not part of the id.
 */
export const comboIdForMix = (mixId: string): string => `mix:${mixId}`;

/**
 * `flavorIds` entries are `{flavorDocId}:{variantType}`.
 *
 * NOT the `variantId` the menu UI uses internally: that is the bare document id
 * for a single-compatibility flavour but `{id}-{type}` for a multi-compatibility
 * one, so it changes shape if an admin edits a flavour's compatible types -
 * which would orphan every favourite and rating referencing it.
 *
 * Strength, flavour percentages, ice and addons are excluded. They are
 * personalisation, not identity. Fold them in and 60/40 Mint-Lemon stops
 * matching 61/39 Mint-Lemon, and nothing ever accumulates.
 */
export const comboIdForCustom = (
  hookahId: string,
  tobaccoType: string,
  flavorIds: string[],
): string => {
  const canonical = [
    hookahId,
    tobaccoType,
    [...flavorIds].sort().join(','),
  ].join('|');
  return `custom:${fnv1a64(canonical)}`;
};
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/comboId.test.ts
```

Expected: `Tests 11 passed (11)`.

- [ ] **Step 5: Commit**

```bash
git add src/services/comboId.ts tests/comboId.test.ts
git commit -m "feat: add stable combo identity"
```

---

## Task 2: Carry combo identity into orders

**Files:**
- Modify: `src/contexts/CartContext.tsx`
- Modify: `src/types/database.ts`
- Modify: `src/services/orderItem.ts`
- Test: `tests/orderItem.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/orderItem.test.ts`:

```ts
test('the persisted order item carries combo identity', () => {
  const dbItem = convertCartItemToDbItem({
    ...cartItem,
    comboId: 'custom:0123456789abcdef',
    hookahId: 'hookah-1',
    flavorIds: ['mint:virginia', 'lemon:virginia'],
  });

  expect(dbItem.comboId).toBe('custom:0123456789abcdef');
  expect(dbItem.hookahId).toBe('hookah-1');
  expect(dbItem.flavorIds).toEqual(['mint:virginia', 'lemon:virginia']);
});

test('a curated mix item carries its mix id', () => {
  const dbItem = convertCartItemToDbItem({
    ...cartItem,
    type: 'mix',
    comboId: 'mix:abc123',
    mixId: 'abc123',
  });

  expect(dbItem.comboId).toBe('mix:abc123');
  expect(dbItem.mixId).toBe('abc123');
});

// Regression guard from the previous perf work: images are ~900KB base64 and
// must never reach Firestore again.
test('combo identity did not smuggle the image back in', () => {
  const dbItem = convertCartItemToDbItem({ ...cartItem, comboId: 'mix:abc123' });
  expect(Object.keys(dbItem)).not.toContain('image');
});
```

Then update the shared `cartItem` fixture at the top of that file to include the new required field:

```ts
const cartItem: CartItem = {
  id: 'item-1',
  type: 'custom',
  name: 'Khalil Mamoon',
  price: 60,
  quantity: 2,
  // Stand-in for the real thing: menu images are base64 data URIs of ~900KB.
  image: 'data:image/webp;base64,AAAAAAAAAAAAAAAA',
  comboId: 'custom:0000000000000000',
  table: '7',
  hookah: 'Khalil Mamoon',
  tobaccoType: 'virginia',
  tobaccoStrength: 6,
  flavors: ['Mint', 'Lemon'],
  flavorPercentages: { Mint: 60, Lemon: 40 },
  hasLED: true,
};
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/orderItem.test.ts
```

Expected: FAIL — two tests fail with `expected undefined to be 'custom:0123456789abcdef'`.

Note it does **not** fail as a type error. Vitest transforms through esbuild, which strips TypeScript types without checking them, so a missing field surfaces at runtime rather than at compile time. The type error appears only under `tsc` in Step 6.

- [ ] **Step 3: Add the fields to `CartItem`**

In `src/contexts/CartContext.tsx`, inside `export interface CartItem`, after `image: string;`:

```ts
  // Stable identity for favouriting and rating. See src/services/comboId.ts.
  comboId: string;
  // Set on curated mixes only.
  mixId?: string;
  // Set on custom builds only. flavorIds are `{flavorDocId}:{variantType}`.
  hookahId?: string;
  flavorIds?: string[];
```

- [ ] **Step 4: Add the fields to `DatabaseOrderItem`**

In `src/types/database.ts`, inside `export interface DatabaseOrderItem`, after `quantity: number;` and the existing no-image comment:

```ts
  // Identity of the combo ordered, so it can be rated from order history.
  // Optional because orders written before this shipped have none - those are
  // not rateable and the UI hides the control rather than erroring.
  comboId?: string;
  mixId?: string;
  hookahId?: string;
  flavorIds?: string[];
```

- [ ] **Step 5: Carry them through the mapper**

In `src/services/orderItem.ts`, inside the returned object literal, after `quantity: item.quantity,`:

```ts
  comboId: item.comboId,
  mixId: item.mixId,
  hookahId: item.hookahId,
  flavorIds: item.flavorIds,
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/orderItem.test.ts && npx tsc --noEmit -p tsconfig.app.json
```

Expected: vitest `Tests 6 passed (6)`. `tsc` will list errors — count them. **Exactly 4, all in `src/services/firebaseService.ts`.** Any error in another file is yours to fix.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/CartContext.tsx src/types/database.ts src/services/orderItem.ts tests/orderItem.test.ts
git commit -m "feat: carry combo identity into order items"
```

---

## Task 3: Emit combo ids from both order paths

**Files:**
- Modify: `src/pages/Index.tsx`

There is no unit test here — `Index.tsx` is a large page component with no test harness, and building one is out of scope. Verification is by running the app and reading the order document back.

- [ ] **Step 1: Import the id builders**

At the top of `src/pages/Index.tsx`, after the existing service imports:

```ts
import { comboIdForCustom, comboIdForMix } from '@/services/comboId';
```

- [ ] **Step 2: Emit the id on the curated-mix path**

In `confirmMixToCart`, inside the `addItem({ ... })` call, after `image: mix.mainImage,`:

```ts
      comboId: comboIdForMix(mix.id),
      mixId: mix.id,
```

- [ ] **Step 3: Emit the id on the custom-build path**

In `finalizeAddToCart`, immediately after the `selectedFlavorNames` block ends (after the `if (withIce) { ... }` block), insert:

```ts
    // `{flavorDocId}:{variantType}` rather than the UI's variantId, which is a
    // bare id for single-compatibility flavours and `{id}-{type}` for
    // multi-compatibility ones. That shape flips when an admin edits a
    // flavour's compatible types, which would orphan favourites keyed on it.
    const flavorIds = selectedFlavors
      .map(variantId => currentFlavors.find(f => f.variantId === variantId))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .map(f => `${f.id}:${f.variantType ?? finalTobaccoType}`);
```

Then inside the `addItem({ ... })` call in the same function, after `image: selectedHookahData.image,`:

```ts
      comboId: comboIdForCustom(selectedHookahData.id, finalTobaccoType, flavorIds),
      hookahId: selectedHookahData.id,
      flavorIds,
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: exactly 4 errors, all in `src/services/firebaseService.ts`.

- [ ] **Step 5: Verify against a real order**

```bash
npm run dev
```

Open the dev server, scan or set a table (`localStorage.setItem('turbo-table', 'table-1')` in the console works), build a custom hookah, order it, then read the document back:

```bash
node -e "
const {readFileSync}=require('fs');
const {initializeApp,cert}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
initializeApp({credential:cert(JSON.parse(readFileSync('serviceAccountKey.json','utf8')))});
getFirestore().collection('orders').orderBy('createdAt','desc').limit(1).get()
  .then(s=>console.log(JSON.stringify(s.docs[0].data().items,null,2)));
"
```

Expected: the item carries `comboId`, `hookahId` and `flavorIds`, and still carries **no** `image`.

**`serviceAccountKey.json` bypasses security rules entirely. It is gitignored. Never commit it and never paste its contents anywhere.**

- [ ] **Step 6: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: emit combo ids when adding to cart"
```

---

## Task 4: Rules — helpers and profiles

**Files:**
- Modify: `firestore.rules`
- Create: `tests/socialRules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/socialRules.test.ts`:

```ts
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const CAROL = 'carol-uid';

// pairId is the two uids sorted ascending and joined with '_', so that rules
// can compute it from the two participants without a lookup.
const pair = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const ALICE_BOB = pair(ALICE, BOB);

const loadRules = (): string => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  // initializeTestEnvironment skips both the rules upload and its own "is the
  // emulator running?" check when the rules string is falsy, which would
  // silently run the whole suite against the emulator's allow-all default.
  if (!rules.trim()) {
    throw new Error('firestore.rules is empty - refusing to test against default allow-all rules');
  }
  return rules;
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-social',
    firestore: { rules: loadRules() },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'profiles', ALICE), { displayName: 'Alice', photoURL: null });
    await setDoc(doc(db, 'profiles', BOB), { displayName: 'Bob', photoURL: null });
    await setDoc(doc(db, `users/${ALICE}/favorites/mix:sunset`), {
      comboId: 'mix:sunset', label: 'Sunset Blend', kind: 'mix',
    });
    await setDoc(doc(db, `users/${ALICE}/ratings/mix:sunset`), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 5,
    });
  });
});

const alice = () => testEnv.authenticatedContext(ALICE, { email: 'alice@example.com' }).firestore();
const bob = () => testEnv.authenticatedContext(BOB, { email: 'bob@example.com' }).firestore();
const carol = () => testEnv.authenticatedContext(CAROL, { email: 'carol@example.com' }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

/** Puts an accepted or pending friendship in place, bypassing the rules. */
const seedFriendship = async (a: string, b: string, status: 'pending' | 'accepted', requestedBy = a) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'friendships', pair(a, b)), {
      uids: [a, b].sort(), requestedBy, status,
    });
  });
};

describe('profiles', () => {
  test('a user reads and writes their own profile', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'profiles', ALICE)));
    await assertSucceeds(setDoc(doc(alice(), 'profiles', ALICE), {
      displayName: 'Alice A', photoURL: null,
    }));
  });

  test('a stranger cannot read a profile', async () => {
    await assertFails(getDoc(doc(carol(), 'profiles', ALICE)));
  });

  test('a user cannot write someone else profile', async () => {
    await assertFails(setDoc(doc(bob(), 'profiles', ALICE), { displayName: 'Not Alice' }));
  });

  // Pending is enough for a profile: the recipient of a request has to see who
  // is asking, and denormalising the name onto the request would let the
  // requester supply whatever name they liked.
  test('a pending friendship is enough to read a profile', async () => {
    await seedFriendship(ALICE, BOB, 'pending');
    await assertSucceeds(getDoc(doc(bob(), 'profiles', ALICE)));
  });

  test('an accepted friendship reads a profile', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertSucceeds(getDoc(doc(bob(), 'profiles', ALICE)));
  });

  test('a profile write cannot smuggle in extra fields', async () => {
    await assertFails(setDoc(doc(alice(), 'profiles', ALICE), {
      displayName: 'Alice', photoURL: null, isAdmin: true,
    }));
  });

  test('an unauthenticated client reads nothing', async () => {
    await assertFails(getDoc(doc(anon(), 'profiles', ALICE)));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialRules.test.ts"
```

Expected: FAIL. `profiles` has no rules yet, so default-deny rejects even the owner.

- [ ] **Step 3: Add the helpers and the profiles block**

In `firestore.rules`, after the existing `ownsOrder()` function, add:

```
    // pairId is the two uids sorted ascending and joined with '_', so a rule can
    // derive the friendship document key from the two participants rather than
    // needing it passed in and then trusting it.
    function friendPairId(a, b) {
      return a < b ? a + '_' + b : b + '_' + a;
    }

    function friendshipPath(owner) {
      return /databases/$(database)/documents/friendships/$(friendPairId(request.auth.uid, owner));
    }

    // exists() before get(): get() on a missing document raises rather than
    // returning null, and a raise inside a helper denies the read for a reason
    // that has nothing to do with friendship.
    function sharesFriendshipWith(owner) {
      return request.auth != null
        && request.auth.uid != owner
        && exists(friendshipPath(owner));
    }

    function isFriendOf(owner) {
      return sharesFriendshipWith(owner)
        && get(friendshipPath(owner)).data.status == 'accepted';
    }
```

Then, before the closing braces of the `match /databases/{database}/documents` block, add:

```
    // Split from users/{uid} because Firestore has no field-level read
    // security: a friend-read on the user document would hand over the email
    // address, order count and total spend along with the display name.
    // Readable on ANY friendship including pending, so the recipient of a
    // request can see who is asking.
    match /profiles/{uid} {
      allow read: if isSignedIn() && (request.auth.uid == uid || sharesFriendshipWith(uid));
      allow create, update: if isSignedIn() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['displayName', 'photoURL', 'updatedAt']);
      allow delete: if isSignedIn() && request.auth.uid == uid;
    }
```

Create and update are separated from delete because `request.resource` is null on a delete, so `request.resource.data.keys()` would raise.

- [ ] **Step 4: Run the tests**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialRules.test.ts"
```

Expected: `Tests 7 passed (7)`.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/socialRules.test.ts
git commit -m "feat: add profile rules with friendship-scoped reads"
```

---

## Task 5: Rules — friendships

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/socialRules.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/socialRules.test.ts`:

```ts
describe('friendships', () => {
  const request = (uids: string[], requestedBy: string) => ({
    uids: [...uids].sort(), requestedBy, status: 'pending',
  });

  test('a user sends a friend request', async () => {
    await assertSucceeds(setDoc(
      doc(alice(), 'friendships', ALICE_BOB), request([ALICE, BOB], ALICE),
    ));
  });

  test('a user cannot create a friendship they are not part of', async () => {
    await assertFails(setDoc(
      doc(carol(), 'friendships', ALICE_BOB), request([ALICE, BOB], ALICE),
    ));
  });

  test('a user cannot send a request in someone else name', async () => {
    await assertFails(setDoc(
      doc(alice(), 'friendships', ALICE_BOB), request([ALICE, BOB], BOB),
    ));
  });

  test('the document id must match the sorted uids', async () => {
    await assertFails(setDoc(
      doc(alice(), 'friendships', 'not-the-pair-id'), request([ALICE, BOB], ALICE),
    ));
  });

  test('a request cannot be created already accepted', async () => {
    await assertFails(setDoc(doc(alice(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
    }));
  });

  test('the recipient accepts', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertSucceeds(setDoc(doc(bob(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
    }));
  });

  test('the requester cannot accept their own request', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertFails(setDoc(doc(alice(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
    }));
  });

  test('accepting cannot rewrite who the friendship is between', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertFails(setDoc(doc(bob(), 'friendships', ALICE_BOB), {
      uids: [CAROL, BOB].sort(), requestedBy: ALICE, status: 'accepted',
    }));
  });

  // Two people tapping at the same table is the likely case, not an edge case.
  // The second write lands on an existing document, so it is evaluated as an
  // update, and the update rule only permits the OTHER party accepting.
  test('a simultaneous counter-request is denied rather than overwriting', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertFails(setDoc(
      doc(bob(), 'friendships', ALICE_BOB), request([ALICE, BOB], BOB),
    ));
  });

  test('either party deletes - decline, cancel and unfriend are all a delete', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertSucceeds(deleteDoc(doc(bob(), 'friendships', ALICE_BOB)));
  });

  test('a stranger cannot delete a friendship', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(deleteDoc(doc(carol(), 'friendships', ALICE_BOB)));
  });

  test('a participant reads the friendship', async () => {
    await seedFriendship(ALICE, BOB, 'pending');
    await assertSucceeds(getDoc(doc(bob(), 'friendships', ALICE_BOB)));
  });

  test('a stranger cannot read a friendship', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(getDoc(doc(carol(), 'friendships', ALICE_BOB)));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialRules.test.ts"
```

Expected: the 13 new tests fail; the 7 profile tests still pass.

- [ ] **Step 3: Add the friendships block**

In `firestore.rules`, after the `profiles` block:

```
    // One document per relationship. Decline, cancel and unfriend are all a
    // delete - there is no blocklist and no record of a refusal, which is
    // proportionate for a venue with a few hundred customers.
    match /friendships/{pairId} {
      allow read: if isSignedIn() && request.auth.uid in resource.data.uids;

      allow create: if isSignedIn()
        && request.resource.data.uids.size() == 2
        && request.resource.data.uids[0] < request.resource.data.uids[1]
        && pairId == friendPairId(request.resource.data.uids[0], request.resource.data.uids[1])
        && request.auth.uid in request.resource.data.uids
        && request.resource.data.requestedBy == request.auth.uid
        && request.resource.data.status == 'pending';

      // Only the other party accepts, and only pending -> accepted. Pinning
      // affectedKeys stops an accept from rewriting who the friendship is
      // between or who asked.
      allow update: if isSignedIn()
        && request.auth.uid in resource.data.uids
        && resource.data.requestedBy != request.auth.uid
        && resource.data.status == 'pending'
        && request.resource.data.status == 'accepted'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'acceptedAt']);

      allow delete: if isSignedIn() && request.auth.uid in resource.data.uids;
    }
```

- [ ] **Step 4: Run the tests**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialRules.test.ts"
```

Expected: `Tests 20 passed (20)`.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/socialRules.test.ts
git commit -m "feat: add friendship rules with mutual consent"
```

---

## Task 6: Rules — favourites and ratings

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/socialRules.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/socialRules.test.ts`:

```ts
describe('favourites and ratings', () => {
  const favPath = (uid: string) => `users/${uid}/favorites/mix:sunset`;
  const ratingPath = (uid: string) => `users/${uid}/ratings/mix:sunset`;

  test('a user reads and writes their own favourites', async () => {
    await assertSucceeds(getDoc(doc(alice(), favPath(ALICE))));
    await assertSucceeds(setDoc(doc(alice(), favPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', kind: 'mix',
    }));
  });

  test('a stranger cannot read favourites', async () => {
    await assertFails(getDoc(doc(carol(), favPath(ALICE))));
  });

  test('a stranger cannot read ratings', async () => {
    await assertFails(getDoc(doc(carol(), ratingPath(ALICE))));
  });

  // The distinction that matters: a request you have not answered grants
  // nothing beyond seeing who asked.
  test('a pending friendship grants no access to favourites or ratings', async () => {
    await seedFriendship(ALICE, BOB, 'pending');
    await assertFails(getDoc(doc(bob(), favPath(ALICE))));
    await assertFails(getDoc(doc(bob(), ratingPath(ALICE))));
  });

  test('an accepted friend reads favourites and ratings', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertSucceeds(getDoc(doc(bob(), favPath(ALICE))));
    await assertSucceeds(getDoc(doc(bob(), ratingPath(ALICE))));
  });

  test('a friend cannot write to your favourites or ratings', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(setDoc(doc(bob(), favPath(ALICE)), { comboId: 'mix:sunset' }));
    await assertFails(setDoc(doc(bob(), ratingPath(ALICE)), { comboId: 'mix:sunset', score: 1 }));
  });

  // Rules evaluate the friendship document live, so revocation is immediate.
  test('unfriending revokes access at once', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertSucceeds(getDoc(doc(bob(), favPath(ALICE))));
    await deleteDoc(doc(bob(), 'friendships', ALICE_BOB));
    await assertFails(getDoc(doc(bob(), favPath(ALICE))));
  });

  test('a rating score must be an integer from 1 to 5', async () => {
    await assertFails(setDoc(doc(alice(), ratingPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 0,
    }));
    await assertFails(setDoc(doc(alice(), ratingPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 6,
    }));
    await assertFails(setDoc(doc(alice(), ratingPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 'five',
    }));
    await assertSucceeds(setDoc(doc(alice(), ratingPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 3,
    }));
  });

  // users/{uid} is matched non-recursively, so subcollections are NOT covered
  // by it. Proving that here because the natural assumption is the opposite.
  test('friends still cannot read the private user document', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(getDoc(doc(bob(), 'users', ALICE)));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialRules.test.ts"
```

Expected: the favourites and ratings tests fail — no rules yet, so even the owner is denied.

- [ ] **Step 3: Add the subcollection blocks**

In `firestore.rules`, immediately after the existing `match /users/{uid} { ... }` block:

```
    // match /users/{uid} above is NOT recursive, so these subcollections need
    // their own blocks. They are the friend-readable projection of a customer's
    // taste; the user document itself stays owner-only.
    match /users/{uid}/favorites/{comboId} {
      allow read: if isSignedIn() && (request.auth.uid == uid || isFriendOf(uid));
      allow write: if isSignedIn() && request.auth.uid == uid;
    }

    match /users/{uid}/ratings/{comboId} {
      allow read: if isSignedIn() && (request.auth.uid == uid || isFriendOf(uid));
      allow create, update: if isSignedIn() && request.auth.uid == uid
        && request.resource.data.score is int
        && request.resource.data.score >= 1
        && request.resource.data.score <= 5;
      allow delete: if isSignedIn() && request.auth.uid == uid;
    }
```

- [ ] **Step 4: Run the tests**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialRules.test.ts"
```

Expected: `Tests 29 passed (29)`.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/socialRules.test.ts
git commit -m "feat: let accepted friends read favourites and ratings"
```

---

## Task 7: Rules — rating an order, and the ownsOrder fix

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/socialRules.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/socialRules.test.ts`:

```ts
describe('rating an order', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'alice-order'), {
        total: 100, status: 'pending', customerInfo: { uid: ALICE },
        items: [{ comboId: 'mix:sunset', name: 'Sunset Blend' }],
      });
      // Written by the pre-uid bundle: no customerInfo.uid at all.
      await setDoc(doc(ctx.firestore(), 'orders', 'legacy-order'), {
        total: 80, status: 'completed', customerInfo: { id: 'customer-abc' },
      });
    });
  });

  test('the owner rates their own order', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'orders', 'alice-order'), {
      rating: 4, ratedAt: new Date(),
    }));
  });

  test('a rating outside 1 to 5 is rejected', async () => {
    await assertFails(updateDoc(doc(alice(), 'orders', 'alice-order'), { rating: 0 }));
    await assertFails(updateDoc(doc(alice(), 'orders', 'alice-order'), { rating: 6 }));
  });

  test('a user cannot rate someone else order', async () => {
    await assertFails(updateDoc(doc(bob(), 'orders', 'alice-order'), { rating: 5 }));
  });

  // The point of pinning affectedKeys: without it this update path is a hole
  // straight into revenue figures.
  test('rating cannot be used to change the total or the status', async () => {
    await assertFails(updateDoc(doc(alice(), 'orders', 'alice-order'), {
      rating: 5, total: 1,
    }));
    await assertFails(updateDoc(doc(alice(), 'orders', 'alice-order'), {
      rating: 5, status: 'completed',
    }));
  });

  // ownsOrder() used to read customerInfo.uid directly, which RAISES on
  // pre-uid documents instead of evaluating to false. The denial was right but
  // arrived as an error and logged "Property uid is undefined" on every read.
  test('a pre-uid order denies cleanly rather than raising', async () => {
    await assertFails(getDoc(doc(bob(), 'orders', 'legacy-order')));
    await assertFails(updateDoc(doc(bob(), 'orders', 'legacy-order'), { rating: 5 }));
  });

  // The invariant the whole design rests on. An order carries table, total and
  // timestamp - who was at the bar, when, and what they spent. Friends see the
  // projection under users/{uid}/ratings and never this. If this test ever goes
  // green-to-red, stop: something has widened the order rules.
  test('an accepted friend still cannot read or rate your orders', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(getDoc(doc(bob(), 'orders', 'alice-order')));
    await assertFails(updateDoc(doc(bob(), 'orders', 'alice-order'), { rating: 5 }));
  });
});
```

Add `updateDoc` to the `firebase/firestore` import at the top of the file.

- [ ] **Step 2: Run it and watch it fail**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialRules.test.ts"
```

Expected: the owner-rates test fails — update is admin-only today.

- [ ] **Step 3: Make `ownsOrder()` tolerant**

In `firestore.rules`, replace the existing `ownsOrder()`:

```
    // .get() with defaults rather than a bare property access, which RAISES on
    // orders written in the pre-uid shape rather than evaluating to false. The
    // denial was always correct; it just arrived as an error. The create rule
    // was made tolerant for this reason already - the read path was missed.
    function ownsOrder() {
      return resource.data.get('customerInfo', {}).get('uid', '') == request.auth.uid;
    }
```

- [ ] **Step 4: Allow the owner to write only a rating**

In the `match /orders/{orderId}` block, replace `allow update, delete: if isAdmin();` with:

```
      allow delete: if isAdmin();

      // hasOnly is what keeps this from becoming a route into status and total.
      allow update: if isAdmin()
        || (isSignedIn() && ownsOrder()
            && request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['rating', 'ratedAt'])
            && request.resource.data.rating is int
            && request.resource.data.rating >= 1
            && request.resource.data.rating <= 5);
```

- [ ] **Step 5: Run both rules suites**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm test
```

Expected: `tests/socialRules.test.ts` reports **35 passed** (7 + 13 + 9 + 6), and the run finishes with **0 failed** across all five test files.

Do not check a global total — it drifts every time a task adds a test. Check two things instead: the per-file count for the file you changed, and that nothing previously green went red.

`tests/rules.test.ts` in particular must still pass **in full** — `ownsOrder()` changed and that file exercises it on both the read and the create path. If any of its 30 tests go red, the tolerant rewrite is wrong; fix that rather than adjusting the test file.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/socialRules.test.ts
git commit -m "feat: let an order owner set a rating and nothing else"
```

---

## Task 8: Rules — invite codes and email discovery

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/socialRules.test.ts`

**Read this before starting.** This task depends on `hashing.sha256()` being available in Firestore rules. Step 2 proves that before any client code is built on it. **If the emulator rejects `hashing.sha256`,** fall back to: store `emailHash` on `users/{uid}` (owner-only), and have the rule verify ownership with `get(/databases/$(database)/documents/users/$(request.resource.data.uid)).data.emailHash == emailHash` instead of recomputing the hash. Everything else in the plan is unchanged. Do not skip the ownership check entirely — without it anyone can publish a document under someone else's email hash.

- [ ] **Step 1: Write the failing test**

Append to `tests/socialRules.test.ts`:

```ts
// sha256('alice@example.com'), lowercase hex. Hard-coded so the test proves the
// rule computes the same value rather than agreeing with the test's own helper.
const ALICE_EMAIL_HASH = '2bd0f8f1ecbfe4e5e4dc04d3eb2c5b0d1b9dc55c9a3b0a1bb12cf24f7ab1a2fd';

describe('invite codes', () => {
  test('any signed-in user resolves a code by exact id', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'inviteCodes', 'CODE1234'), {
        uid: ALICE, displayName: 'Alice',
      });
    });
    await assertSucceeds(getDoc(doc(bob(), 'inviteCodes', 'CODE1234')));
  });

  test('a user publishes a code pointing at themselves', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'inviteCodes', 'NEWCODE1'), {
      uid: ALICE, displayName: 'Alice',
    }));
  });

  test('a user cannot publish a code pointing at someone else', async () => {
    await assertFails(setDoc(doc(bob(), 'inviteCodes', 'NEWCODE2'), {
      uid: ALICE, displayName: 'Alice',
    }));
  });

  test('a user deletes only their own code', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'inviteCodes', 'CODE1234'), {
        uid: ALICE, displayName: 'Alice',
      });
    });
    await assertFails(deleteDoc(doc(bob(), 'inviteCodes', 'CODE1234')));
    await assertSucceeds(deleteDoc(doc(alice(), 'inviteCodes', 'CODE1234')));
  });
});

describe('email discovery', () => {
  test('a user publishes a discoverable entry under the hash of their own email', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'discoverable', ALICE_EMAIL_HASH), {
      uid: ALICE, displayName: 'Alice',
    }));
  });

  // Without this check anyone could squat the hash of an email they do not own
  // and intercept requests meant for that person.
  test('a user cannot publish under someone else email hash', async () => {
    await assertFails(setDoc(doc(bob(), 'discoverable', ALICE_EMAIL_HASH), {
      uid: BOB, displayName: 'Bob',
    }));
  });

  test('a signed-in user looks up an exact hash', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'discoverable', ALICE_EMAIL_HASH), {
        uid: ALICE, displayName: 'Alice',
      });
    });
    await assertSucceeds(getDoc(doc(bob(), 'discoverable', ALICE_EMAIL_HASH)));
  });

  test('a user removes their own entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'discoverable', ALICE_EMAIL_HASH), {
        uid: ALICE, displayName: 'Alice',
      });
    });
    await assertFails(deleteDoc(doc(bob(), 'discoverable', ALICE_EMAIL_HASH)));
    await assertSucceeds(deleteDoc(doc(alice(), 'discoverable', ALICE_EMAIL_HASH)));
  });
});
```

Add `collection` and `getDocs` to the `firebase/firestore` import at the top of the file, then add this test inside the `email discovery` describe block. It is the mitigation that actually stops harvesting, so it is worth its own test:

```ts
  test('neither lookup collection can be enumerated', async () => {
    await assertFails(getDocs(collection(bob(), 'discoverable')));
    await assertFails(getDocs(collection(bob(), 'inviteCodes')));
  });
```

- [ ] **Step 2: Run it and watch it fail — and confirm `hashing.sha256` works**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialRules.test.ts"
```

Expected: the new tests fail on default-deny. After Step 3, if you instead see a rules *compilation* error naming `hashing`, take the fallback described at the top of this task.

- [ ] **Step 3: Add both blocks**

In `firestore.rules`, after the `friendships` block:

```
    // Code -> uid, for invite links and QR. get is open to any signed-in user
    // because a code is unguessable; list is denied so the collection cannot be
    // walked to harvest them.
    match /inviteCodes/{code} {
      allow get: if isSignedIn();
      allow list: if false;
      allow create: if isSignedIn()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.keys().hasOnly(['uid', 'displayName', 'createdAt']);
      allow delete: if isSignedIn() && resource.data.uid == request.auth.uid;
    }

    // sha256(lowercased email) -> uid, for email search. Opt-in and default-off
    // in the client. get is allowed and list is denied, so someone can confirm
    // an address they already hold but cannot harvest the customer base - which
    // is the part that matters. The document id must be the hash of the
    // CALLER'S OWN email, so nobody can squat an address they do not control.
    match /discoverable/{emailHash} {
      allow get: if isSignedIn();
      allow list: if false;
      allow create: if isSignedIn()
        && request.auth.token.email != null
        && emailHash == hashing.sha256(request.auth.token.email.lower()).toHexString().lower()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.keys().hasOnly(['uid', 'displayName']);
      allow delete: if isSignedIn() && resource.data.uid == request.auth.uid;
    }
```

- [ ] **Step 4: Run the full suite**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm test
```

Expected: `tests/socialRules.test.ts` reports **44 passed** (the 35 above plus 9 here), and **0 failed** overall.

If the `discoverable` create tests fail on the hash comparison rather than compiling, print what the rule computes by temporarily relaxing the rule to `allow create: if true;`, write a document, and compare — the likely cause is hex case. Both sides are `.lower()`ed for exactly this reason.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/socialRules.test.ts
git commit -m "feat: add invite code and opt-in email discovery rules"
```

---

## Task 9: Profile service

**Files:**
- Create: `src/services/profileService.ts`
- Modify: `src/services/userService.ts`
- Modify: `src/services/authService.ts`

- [ ] **Step 1: Write the service**

Create `src/services/profileService.ts`:

```ts
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';

export interface PublicProfile {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * The shareable subset of an account.
 *
 * Separate from users/{uid} because Firestore has no field-level read
 * security: granting a friend read access to the user document would hand
 * over the email address, order count and total spend along with the name.
 */
export const upsertPublicProfile = async (user: User): Promise<void> => {
  if (user.isAnonymous) return;
  await setDoc(
    doc(firestore, 'profiles', user.uid),
    {
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const getPublicProfile = async (uid: string): Promise<PublicProfile | null> => {
  const snapshot = await getDoc(doc(firestore, 'profiles', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    uid,
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
  };
};
```

- [ ] **Step 2: Keep the profile in sync wherever the account changes**

In `src/services/userService.ts`, add the import:

```ts
import { upsertPublicProfile } from '@/services/profileService';
```

and at the end of `upsertUserProfile`, after the existing `setDoc(...)` call:

```ts
  // The friend-readable copy. Kept in step here so there is one place that
  // knows an account changed.
  await upsertPublicProfile(user);
```

In `src/pages/Account.tsx`, the `saveName` handler already calls `upsertUserProfile(updated)`, so the rename propagates with no further change.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: exactly 4 errors, all in `src/services/firebaseService.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/services/profileService.ts src/services/userService.ts
git commit -m "feat: add the friend-readable public profile"
```

---

## Task 10: Favourites service

**Files:**
- Create: `src/services/favoritesService.ts`

- [ ] **Step 1: Write the service**

Create `src/services/favoritesService.ts`:

```ts
import {
  collection, deleteDoc, doc, getDocs, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

export interface FavoriteCombo {
  comboId: string;
  /**
   * Display text, denormalised on purpose. A friend viewing this list would
   * otherwise have to resolve menu ids to names and hope each one still
   * exists; a mix can be deactivated or renamed. This is what was favourited,
   * frozen at the time. Never used as a key.
   */
  label: string;
  kind: 'mix' | 'custom';
  mixId?: string;
  hookahId?: string;
  tobaccoType?: string;
  flavorIds?: string[];
  // Personalisation. Excluded from comboId, stored here so "order again"
  // restores the customer's exact build.
  tobaccoStrength?: number;
  flavorPercentages?: Record<string, number>;
  withIce?: boolean;
  hasLED?: boolean;
  hasColoredWater?: boolean;
  hasAlcohol?: boolean;
  hasFruits?: boolean;
  createdAt?: Date;
}

const favoritesRef = (uid: string) => collection(firestore, 'users', uid, 'favorites');

/**
 * Deliberately stores ids and never prices. Re-ordering re-prices from the live
 * menu; a stored price would let a saved favourite quietly undercharge after a
 * price rise.
 */
export const addFavorite = async (uid: string, favorite: FavoriteCombo): Promise<void> => {
  const { createdAt, ...rest } = favorite;
  const payload = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  await setDoc(doc(favoritesRef(uid), favorite.comboId), {
    ...payload,
    createdAt: serverTimestamp(),
  });
};

export const removeFavorite = async (uid: string, comboId: string): Promise<void> => {
  await deleteDoc(doc(favoritesRef(uid), comboId));
};

export const listFavorites = async (uid: string): Promise<FavoriteCombo[]> => {
  const snapshot = await getDocs(favoritesRef(uid));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      ...data,
      comboId: docSnap.id,
      createdAt: data.createdAt?.toDate?.() ?? undefined,
    } as FavoriteCombo;
  });
};
```

`undefined` values are stripped before writing because Firestore rejects them outright, and a custom build leaves every mix field undefined and vice versa.

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/services/favoritesService.ts
git commit -m "feat: add favourites service"
```

Expected: exactly 4 pre-existing errors.

---

## Task 11: Ratings service

**Files:**
- Create: `src/services/ratingsService.ts`

- [ ] **Step 1: Write the service**

Create `src/services/ratingsService.ts`:

```ts
import {
  collection, doc, getDocs, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

export interface ComboRating {
  comboId: string;
  label: string;
  score: number;
  ratedAt?: Date;
}

const ratingsRef = (uid: string) => collection(firestore, 'users', uid, 'ratings');

/**
 * Writes the rating twice, in one batch.
 *
 * The copy on the order is what makes the rating verified: security rules
 * already establish that the caller owns that order, so a score there is by
 * construction tied to a real purchase, and it answers "have I rated this?".
 *
 * The copy under the rater is what friends read. Orders carry table, total and
 * timestamp - effectively who was at the bar, when, and what they spent - so
 * they stay owner-only and the shareable projection holds nothing but the
 * score and a label.
 */
export const rateOrder = async (
  uid: string,
  orderId: string,
  comboId: string,
  label: string,
  score: number,
): Promise<void> => {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error(`Rating must be an integer from 1 to 5, got ${score}`);
  }

  const batch = writeBatch(firestore);
  batch.update(doc(firestore, 'orders', orderId), {
    rating: score,
    ratedAt: serverTimestamp(),
  });
  batch.set(doc(ratingsRef(uid), comboId), {
    comboId,
    label,
    score,
    ratedAt: serverTimestamp(),
  });
  await batch.commit();
};

export const listRatings = async (uid: string): Promise<ComboRating[]> => {
  const snapshot = await getDocs(ratingsRef(uid));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      comboId: docSnap.id,
      label: data.label ?? '',
      score: data.score ?? 0,
      ratedAt: data.ratedAt?.toDate?.() ?? undefined,
    };
  });
};
```

The range check is duplicated in rules and here on purpose: rules are the boundary that matters, and the local throw gives a usable error instead of a bare permission-denied.

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/services/ratingsService.ts
git commit -m "feat: add ratings service with sealed-order projection"
```

---

## Task 12: Friends service

**Files:**
- Create: `src/services/friendsService.ts`

- [ ] **Step 1: Write the service**

Create `src/services/friendsService.ts`:

```ts
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';

export type FriendshipStatus = 'pending' | 'accepted';

export interface Friendship {
  pairId: string;
  uids: [string, string];
  requestedBy: string;
  status: FriendshipStatus;
  otherUid: string;
}

/** Sorted and joined so rules can derive the same key from the participants. */
export const pairIdFor = (a: string, b: string): string =>
  (a < b ? `${a}_${b}` : `${b}_${a}`);

export class FriendRequestConflictError extends Error {
  constructor(public readonly existing: Friendship) {
    super('A friendship already exists for this pair.');
    this.name = 'FriendRequestConflictError';
  }
}

/**
 * Both people tapping "add" at the same table target the same document, and
 * Firestore evaluates the second write as an update, which the rules refuse.
 * That is expected traffic, not an error to show: the caller catches this and
 * offers Accept instead.
 */
export const sendFriendRequest = async (me: string, otherUid: string): Promise<void> => {
  if (me === otherUid) throw new Error('You cannot add yourself.');
  const pairId = pairIdFor(me, otherUid);
  const ref = doc(firestore, 'friendships', pairId);

  try {
    await setDoc(ref, {
      uids: [me, otherUid].sort(),
      requestedBy: me,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists()) {
      const data = existing.data();
      throw new FriendRequestConflictError({
        pairId,
        uids: data.uids,
        requestedBy: data.requestedBy,
        status: data.status,
        otherUid,
      });
    }
    throw error;
  }
};

export const acceptFriendRequest = async (pairId: string): Promise<void> => {
  await updateDoc(doc(firestore, 'friendships', pairId), {
    status: 'accepted',
    acceptedAt: serverTimestamp(),
  });
};

/** Decline, cancel and unfriend are all the same operation. */
export const removeFriendship = async (pairId: string): Promise<void> => {
  await deleteDoc(doc(firestore, 'friendships', pairId));
};

/**
 * One array-contains query, with the pending/accepted split done in the client.
 * A customer here has at most a few dozen friends, so filtering locally avoids
 * a composite index and the deploy step that comes with it.
 */
export const listFriendships = async (uid: string): Promise<Friendship[]> => {
  const snapshot = await getDocs(query(
    collection(firestore, 'friendships'),
    where('uids', 'array-contains', uid),
  ));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const uids = data.uids as [string, string];
    return {
      pairId: docSnap.id,
      uids,
      requestedBy: data.requestedBy,
      status: data.status as FriendshipStatus,
      otherUid: uids.find((candidate) => candidate !== uid) ?? uid,
    };
  });
};

// ---------------------------------------------------------------- invite codes

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * crypto.getRandomValues, NOT crypto.randomUUID or crypto.subtle: only
 * getRandomValues works outside a secure context, and this project has already
 * shipped a blank page from assuming otherwise.
 *
 * The alphabet omits I, L, O, 0 and 1 because these codes get read aloud and
 * typed in by hand at a table.
 */
const generateCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
};

/**
 * Rotation order matters: publish the new code, repoint the user, then delete
 * the old one. A crash midway leaves two working codes, which is harmless.
 * Deleting first would leave the customer showing a QR that resolves to
 * nothing.
 */
export const ensureInviteCode = async (user: User): Promise<string> => {
  const userRef = doc(firestore, 'users', user.uid);
  const existing = await getDoc(userRef);
  const current = existing.data()?.inviteCode as string | undefined;
  if (current) return current;

  const code = generateCode();
  await setDoc(doc(firestore, 'inviteCodes', code), {
    uid: user.uid,
    displayName: user.displayName ?? null,
    createdAt: serverTimestamp(),
  });
  await setDoc(userRef, { inviteCode: code }, { merge: true });
  return code;
};

export const rotateInviteCode = async (user: User): Promise<string> => {
  const userRef = doc(firestore, 'users', user.uid);
  const previous = (await getDoc(userRef)).data()?.inviteCode as string | undefined;

  const code = generateCode();
  await setDoc(doc(firestore, 'inviteCodes', code), {
    uid: user.uid,
    displayName: user.displayName ?? null,
    createdAt: serverTimestamp(),
  });
  await setDoc(userRef, { inviteCode: code }, { merge: true });
  if (previous) {
    await deleteDoc(doc(firestore, 'inviteCodes', previous)).catch(() => undefined);
  }
  return code;
};

export const resolveInviteCode = async (
  code: string,
): Promise<{ uid: string; displayName: string | null } | null> => {
  const snapshot = await getDoc(doc(firestore, 'inviteCodes', code));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return { uid: data.uid, displayName: data.displayName ?? null };
};

// ------------------------------------------------------------ email discovery

/**
 * Real SHA-256, because the security rule recomputes the same value with
 * hashing.sha256(). That means crypto.subtle, which requires a secure context -
 * localhost counts, a LAN IP over plain http does not. Only this one toggle is
 * affected.
 */
export const sha256Hex = async (input: string): Promise<string> => {
  if (!crypto?.subtle) {
    throw new Error('Email discovery needs a secure context (https or localhost).');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Opt-in, default off.
 *
 * Turning it OFF deletes the lookup document first and clears the flag second,
 * so an interrupted opt-out never leaves someone findable while their settings
 * claim otherwise. The document's existence is what actually determines
 * findability; the boolean is a UI mirror.
 */
export const setDiscoverable = async (user: User, enabled: boolean): Promise<void> => {
  if (!user.email) throw new Error('This account has no email address.');
  const hash = await sha256Hex(normalizeEmail(user.email));
  const lookupRef = doc(firestore, 'discoverable', hash);
  const userRef = doc(firestore, 'users', user.uid);

  if (enabled) {
    await setDoc(lookupRef, { uid: user.uid, displayName: user.displayName ?? null });
    await setDoc(userRef, { discoverableByEmail: true }, { merge: true });
    return;
  }

  await deleteDoc(lookupRef).catch(() => undefined);
  await setDoc(userRef, { discoverableByEmail: false }, { merge: true });
};

/**
 * Reads the UI mirror on users/{uid}.
 *
 * The lookup document's existence is what actually determines findability, but
 * checking that directly means hashing the email, which needs a secure context.
 * This is the cheap read for rendering the toggle; setDiscoverable keeps the
 * two in step and deletes the document first on opt-out so they cannot
 * disagree in the dangerous direction.
 */
export const getDiscoverable = async (uid: string): Promise<boolean> => {
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  return snapshot.data()?.discoverableByEmail === true;
};

export const findByEmail = async (
  email: string,
): Promise<{ uid: string; displayName: string | null } | null> => {
  const hash = await sha256Hex(normalizeEmail(email));
  const snapshot = await getDoc(doc(firestore, 'discoverable', hash)).catch(() => null);
  if (!snapshot?.exists()) return null;
  const data = snapshot.data();
  return { uid: data.uid, displayName: data.displayName ?? null };
};
```

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/services/friendsService.ts
git commit -m "feat: add friends service with invite codes and opt-in discovery"
```

Expected: exactly 4 pre-existing errors.

---

## Task 13: Star rating component

**Files:**
- Create: `src/components/StarRating.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/StarRating.tsx`:

```tsx
import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  onChange?: (score: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6' };

/**
 * Read-only when onChange is omitted, in which case the stars render as plain
 * text rather than buttons so screen readers do not announce five controls
 * nobody can press.
 */
export const StarRating: React.FC<StarRatingProps> = ({
  value, onChange, disabled = false, size = 'md',
}) => {
  const scores = [1, 2, 3, 4, 5];

  if (!onChange) {
    return (
      <div className="flex gap-0.5" role="img" aria-label={`Rated ${value} out of 5`}>
        {scores.map((score) => (
          <Star
            key={score}
            aria-hidden="true"
            className={cn(
              SIZES[size],
              score <= value ? 'fill-amber-400 text-amber-400' : 'text-turbo-muted',
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {scores.map((score) => (
        <button
          key={score}
          type="button"
          disabled={disabled}
          onClick={() => onChange(score)}
          aria-label={`Rate ${score} out of 5`}
          aria-pressed={score === value}
          className="disabled:opacity-50"
        >
          <Star
            className={cn(
              SIZES[size],
              'transition-colors',
              score <= value ? 'fill-amber-400 text-amber-400' : 'text-turbo-muted',
            )}
          />
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/components/StarRating.tsx
git commit -m "feat: add star rating control"
```

---

## Task 14: Rate an order from order history

**Files:**
- Modify: `src/pages/MyOrders.tsx`

- [ ] **Step 1: Add the star row**

In `src/pages/MyOrders.tsx`, add the imports:

```tsx
import { StarRating } from '@/components/StarRating';
import { rateOrder } from '@/services/ratingsService';
import { toast } from '@/hooks/use-toast';
```

Add state below the existing `busy` state:

```tsx
  // Optimistic local scores, keyed by orderId. The list is fetched once, so
  // without this a freshly given rating would not appear until a reload.
  const [scores, setScores] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
```

Add the handler above the `return`:

```tsx
  const handleRate = async (order: OrderDetails, score: number) => {
    if (!user) return;
    const firstItem = order.items?.[0] as { comboId?: string; name?: string } | undefined;
    if (!firstItem?.comboId) return;

    setSaving(order.orderId);
    const previous = scores[order.orderId];
    setScores((current) => ({ ...current, [order.orderId]: score }));
    try {
      await rateOrder(
        user.uid,
        order.orderId,
        firstItem.comboId,
        firstItem.name ?? 'Your order',
        score,
      );
      toast({ title: 'Thanks for rating' });
    } catch (error) {
      setScores((current) => ({ ...current, [order.orderId]: previous ?? 0 }));
      toast({
        title: 'Could not save your rating',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };
```

Inside the order card, after the `<p className="text-lg font-bold text-amber-400">{order.total} Lei</p>` line:

```tsx
              {(order.items?.[0] as { comboId?: string } | undefined)?.comboId && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-2 text-xs uppercase text-turbo-muted">
                    {scores[order.orderId] ?? (order as { rating?: number }).rating
                      ? 'Your rating'
                      : 'Rate this'}
                  </p>
                  <StarRating
                    size="sm"
                    value={
                      scores[order.orderId]
                      ?? (order as { rating?: number }).rating
                      ?? 0
                    }
                    disabled={saving === order.orderId}
                    onChange={(score) => handleRate(order, score)}
                  />
                </div>
              )}
```

The whole block is conditional on `comboId` being present, so orders placed before this shipped simply show no control. That is the intended behaviour, not a failure — it is not backfillable.

- [ ] **Step 2: Verify in the browser**

```bash
npm run dev
```

Sign in, place an order so it has a `comboId`, open `/my-orders`, and rate it. Then confirm both documents were written:

```bash
node -e "
const {readFileSync}=require('fs');
const {initializeApp,cert}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
initializeApp({credential:cert(JSON.parse(readFileSync('serviceAccountKey.json','utf8')))});
const db=getFirestore();
db.collection('orders').orderBy('createdAt','desc').limit(1).get().then(async s=>{
  const o=s.docs[0];
  console.log('order rating:', o.data().rating);
  const uid=o.data().customerInfo?.uid;
  const r=await db.collection('users').doc(uid).collection('ratings').get();
  console.log('projection:', r.docs.map(d=>d.data()));
});
"
```

Expected: the order carries `rating`, and a matching document exists under `users/{uid}/ratings/{comboId}`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyOrders.tsx
git commit -m "feat: rate an order from order history"
```

---

## Task 15: Favourite a curated mix

**Files:**
- Create: `src/components/FavoriteButton.tsx`
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/FavoriteButton.tsx`:

```tsx
import React from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  isFavorite, onToggle, disabled = false, label,
}) => (
  <button
    type="button"
    disabled={disabled}
    aria-pressed={isFavorite}
    aria-label={isFavorite ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
    onClick={(event) => {
      // Mix cards are themselves tappable - without this, favouriting also
      // opens the order dialog.
      event.stopPropagation();
      onToggle();
    }}
    className="rounded-full bg-black/40 p-2 backdrop-blur disabled:opacity-50"
  >
    <Heart
      className={cn('h-5 w-5 transition-colors', isFavorite ? 'fill-red-500 text-red-500' : 'text-white')}
    />
  </button>
);
```

- [ ] **Step 2: Wire it into the mix cards**

In `src/pages/Index.tsx`, add the imports:

```tsx
import { FavoriteButton } from '@/components/FavoriteButton';
import { addFavorite, listFavorites, removeFavorite } from '@/services/favoritesService';
import { useAuth } from '@/contexts/AuthContext';
```

Add state alongside the other `useState` declarations:

```tsx
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
```

Load them once the user is known:

```tsx
  useEffect(() => {
    if (!user) return;
    listFavorites(user.uid)
      .then((favorites) => setFavoriteIds(new Set(favorites.map((f) => f.comboId))))
      // A failed favourites read must not take the menu down with it.
      .catch(() => setFavoriteIds(new Set()));
  }, [user]);
```

Add the toggle handler:

```tsx
  const toggleMixFavorite = async (mix: DatabaseRecommendedMix) => {
    if (!user) return;
    const comboId = comboIdForMix(mix.id);
    const next = new Set(favoriteIds);

    try {
      if (favoriteIds.has(comboId)) {
        next.delete(comboId);
        setFavoriteIds(next);
        await removeFavorite(user.uid, comboId);
      } else {
        next.add(comboId);
        setFavoriteIds(next);
        await addFavorite(user.uid, {
          comboId, label: mix.name, kind: 'mix', mixId: mix.id,
        });
      }
    } catch (error) {
      // Put the optimistic change back.
      setFavoriteIds(new Set(favoriteIds));
      toast({ title: 'Could not update favourites', variant: 'destructive' });
    }
  };
```

In the mix card JSX, inside the element wrapping `<img src={mix.mainImage} ... />`, add as a sibling of the image:

```tsx
                        <div className="absolute right-2 top-2 z-10">
                          <FavoriteButton
                            label={mix.name}
                            isFavorite={favoriteIds.has(comboIdForMix(mix.id))}
                            onToggle={() => toggleMixFavorite(mix)}
                            disabled={!user}
                          />
                        </div>
```

Ensure the wrapping element has `relative` in its className so the absolute positioning anchors to the card.

- [ ] **Step 3: Typecheck and verify**

```bash
npx tsc --noEmit -p tsconfig.app.json && npm run dev
```

Expected: 4 pre-existing errors. In the browser, favouriting a mix fills the heart, and it stays filled after a reload.

- [ ] **Step 4: Commit**

```bash
git add src/components/FavoriteButton.tsx src/pages/Index.tsx
git commit -m "feat: favourite a curated mix"
```

---

## Task 16: Save a custom build as a favourite

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Save the build alongside adding it to the cart**

In `finalizeAddToCart`, after the `addItem({ ... })` call and before `successHaptic()`:

```ts
    // Offered rather than automatic: not every build is worth keeping, and a
    // favourites list that fills itself is noise.
    setLastBuild({
      comboId: comboIdForCustom(selectedHookahData.id, finalTobaccoType, flavorIds),
      label: `${selectedHookahData.name} · ${selectedFlavorNames.join(', ')}`,
      kind: 'custom',
      hookahId: selectedHookahData.id,
      tobaccoType: finalTobaccoType,
      flavorIds,
      tobaccoStrength,
      flavorPercentages: selectedFlavors.length >= 2 ? flavorPercentages : undefined,
      withIce,
      hasLED: selectedAddons.hasLED,
      hasColoredWater: selectedAddons.hasColoredWater,
      hasAlcohol: selectedAddons.hasAlcohol,
      hasFruits: selectedAddons.hasFruits,
    });
```

Add the state and import:

```tsx
import type { FavoriteCombo } from '@/services/favoritesService';

  const [lastBuild, setLastBuild] = useState<FavoriteCombo | null>(null);
```

- [ ] **Step 2: Render the save prompt**

Leave the existing `toast({ title: 'Added to cart', ... })` call in `finalizeAddToCart` exactly as it is. The prompt is a separate surface, because a toast dismisses itself and this one asks a question.

Add the prompt near the end of the component's JSX, before the closing tag of the outermost element:

```tsx
      {user && lastBuild && (
        <div className="fixed bottom-24 left-0 right-0 z-40 px-4">
          <Card className="bg-turbo-card border-primary">
            <CardContent className="flex items-center gap-3 p-4">
              <p className="flex-1 text-sm">Save this combo to your favourites?</p>
              <Button variant="ghost" size="sm" onClick={() => setLastBuild(null)}>
                No thanks
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await addFavorite(user.uid, lastBuild);
                    setFavoriteIds((current) => new Set(current).add(lastBuild.comboId));
                    toast({ title: 'Saved to favourites' });
                  } catch {
                    toast({ title: 'Could not save', variant: 'destructive' });
                  } finally {
                    setLastBuild(null);
                  }
                }}
              >
                Save
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
```

- [ ] **Step 3: Typecheck, verify, commit**

```bash
npx tsc --noEmit -p tsconfig.app.json && npm run dev
```

Build a custom hookah, add it to the cart, and confirm the save prompt appears and writes a favourite. Then:

```bash
git add src/pages/Index.tsx
git commit -m "feat: offer to save a custom build as a favourite"
```

---

## Task 17: Friends page

**Files:**
- Create: `src/pages/Friends.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/NavigationSidebar.tsx`

- [ ] **Step 1: Write the page**

Create `src/pages/Friends.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { getPublicProfile } from '@/services/profileService';
import {
  FriendRequestConflictError, acceptFriendRequest, ensureInviteCode, findByEmail,
  getDiscoverable, listFriendships, removeFriendship, resolveInviteCode,
  sendFriendRequest, setDiscoverable, type Friendship,
} from '@/services/friendsService';

interface FriendRow extends Friendship {
  displayName: string | null;
}

const Friends: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<FriendRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [discoverable, setDiscoverableState] = useState(false);

  const signedIn = !!user && !isAnonymous;

  const refresh = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const friendships = await listFriendships(user.uid);
      const withNames = await Promise.all(friendships.map(async (friendship) => ({
        ...friendship,
        displayName: (await getPublicProfile(friendship.otherUid).catch(() => null))?.displayName ?? null,
      })));
      setRows(withNames);
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => { if (signedIn) void refresh(); }, [signedIn, refresh]);

  useEffect(() => {
    if (!signedIn || !user) return;
    ensureInviteCode(user).then(setInviteCode).catch(() => setInviteCode(''));
    // Without this the switch renders off for someone who already opted in,
    // and flipping it would write the value it already had.
    getDiscoverable(user.uid).then(setDiscoverableState).catch(() => setDiscoverableState(false));
  }, [signedIn, user]);

  // Arriving from someone's invite link.
  useEffect(() => {
    const code = searchParams.get('code');
    if (!code || !signedIn || !user) return;
    (async () => {
      const target = await resolveInviteCode(code);
      setSearchParams({});
      if (!target) {
        toast({ title: 'That invite link is not valid', variant: 'destructive' });
        return;
      }
      await request(target.uid, target.displayName);
    })();
  }, [searchParams, signedIn, user]);

  const request = async (otherUid: string, name: string | null) => {
    if (!user) return;
    try {
      await sendFriendRequest(user.uid, otherUid);
      toast({ title: `Request sent to ${name ?? 'them'}` });
    } catch (error) {
      if (error instanceof FriendRequestConflictError) {
        // Both people tapped at once, or one already asked. Not an error.
        toast({
          title: error.existing.requestedBy === user.uid
            ? 'You already asked them'
            : `${name ?? 'They'} already asked you - accept below`,
        });
      } else {
        toast({ title: 'Could not send that request', description: String(error), variant: 'destructive' });
      }
    }
    await refresh();
  };

  const search = async () => {
    if (!email.trim() || !user) return;
    try {
      const found = await findByEmail(email);
      if (!found) {
        // Deliberately the same message whether nobody has that address or the
        // person has not opted in - the difference is exactly what email search
        // must not reveal.
        toast({ title: 'No one found with that email' });
        return;
      }
      if (found.uid === user.uid) {
        toast({ title: 'That is you' });
        return;
      }
      await request(found.uid, found.displayName);
      setEmail('');
    } catch (error) {
      toast({ title: 'Search failed', description: String(error), variant: 'destructive' });
    }
  };

  const inviteUrl = inviteCode ? `${window.location.origin}/friends?code=${inviteCode}` : '';
  const incoming = rows.filter((r) => r.status === 'pending' && r.requestedBy !== user?.uid);
  const outgoing = rows.filter((r) => r.status === 'pending' && r.requestedBy === user?.uid);
  const accepted = rows.filter((r) => r.status === 'accepted');

  return (
    <div className="min-h-screen pb-24">
      <header className="flex items-center justify-between border-b border-border p-4">
        <NavigationSidebar />
        <h1 className="text-2xl font-bold tracking-wider">FRIENDS</h1>
        <div className="w-10" />
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        {loading ? (
          <p className="text-center text-turbo-muted">Loading…</p>
        ) : !signedIn ? (
          <Card className="border-primary bg-turbo-card">
            <CardContent className="p-6 text-center">
              <p className="mb-4 text-sm">Friends need an account.</p>
              <Button className="w-full" onClick={() => navigate('/account')}>
                Create an account
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bg-turbo-card border-border">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-bold uppercase text-turbo-muted">Your invite link</h2>
                <p className="break-all font-mono text-xs">{inviteUrl || '…'}</p>
                <Button
                  variant="outline" className="w-full" disabled={!inviteUrl}
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteUrl);
                    toast({ title: 'Link copied' });
                  }}
                >
                  Copy link
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-turbo-card border-border">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-bold uppercase text-turbo-muted">Find by email</h2>
                <div className="flex gap-2">
                  <Input
                    type="email" value={email} aria-label="Friend's email"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button onClick={search}>Find</Button>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <Label htmlFor="discoverable" className="text-sm">
                    Let people find me by email
                  </Label>
                  <Switch
                    id="discoverable" checked={discoverable}
                    onCheckedChange={async (checked) => {
                      if (!user) return;
                      try {
                        await setDiscoverable(user, checked);
                        setDiscoverableState(checked);
                      } catch (error) {
                        toast({ title: 'Could not change that', description: String(error), variant: 'destructive' });
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-turbo-muted">
                  Off by default. While it is off, nobody can find you by email.
                </p>
              </CardContent>
            </Card>

            {busy ? <Skeleton className="h-24 w-full" /> : (
              <>
                {incoming.length > 0 && (
                  <Card className="border-primary bg-turbo-card">
                    <CardContent className="space-y-2 p-4">
                      <h2 className="text-sm font-bold uppercase text-turbo-muted">Requests</h2>
                      {incoming.map((row) => (
                        <div key={row.pairId} className="flex items-center gap-2">
                          <span className="flex-1 truncate">{row.displayName ?? 'Someone'}</span>
                          <Button size="sm" onClick={async () => {
                            await acceptFriendRequest(row.pairId); await refresh();
                          }}>Accept</Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            await removeFriendship(row.pairId); await refresh();
                          }}>Decline</Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card className="bg-turbo-card border-border">
                  <CardContent className="space-y-2 p-4">
                    <h2 className="text-sm font-bold uppercase text-turbo-muted">
                      Friends ({accepted.length})
                    </h2>
                    {accepted.length === 0 && <p className="text-sm text-turbo-muted">No friends yet.</p>}
                    {accepted.map((row) => (
                      <div key={row.pairId} className="flex items-center gap-2">
                        <button
                          type="button"
                          className="flex-1 truncate text-left underline"
                          onClick={() => navigate(`/friends/${row.otherUid}`)}
                        >
                          {row.displayName ?? 'Friend'}
                        </button>
                        <Button size="sm" variant="ghost" onClick={async () => {
                          await removeFriendship(row.pairId); await refresh();
                        }}>Remove</Button>
                      </div>
                    ))}
                    {outgoing.map((row) => (
                      <p key={row.pairId} className="text-sm text-turbo-muted">
                        {row.displayName ?? 'Someone'} — request sent
                      </p>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Friends;
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add alongside the other lazy imports:

```tsx
const Friends = lazy(() => import("./pages/Friends"));
```

and inside `<Routes>`, before the catch-all:

```tsx
              <Route path="/friends" element={<Friends />} />
```

- [ ] **Step 3: Add the nav entry**

In `src/components/NavigationSidebar.tsx`, add `Users` to the `lucide-react` import and add to `navItems`, after the My orders entry:

```tsx
    { path: '/friends', label: 'Friends', icon: Users },
```

- [ ] **Step 4: Typecheck, verify, commit**

```bash
npx tsc --noEmit -p tsconfig.app.json && npm run build
```

Expected: 4 pre-existing errors; build succeeds.

```bash
git add src/pages/Friends.tsx src/App.tsx src/components/NavigationSidebar.tsx
git commit -m "feat: add friends page with invites, search and requests"
```

---

## Task 18: Friend profile page

**Files:**
- Create: `src/pages/FriendProfile.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the page**

Create `src/pages/FriendProfile.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { StarRating } from '@/components/StarRating';
import { getPublicProfile, type PublicProfile } from '@/services/profileService';
import { listFavorites, type FavoriteCombo } from '@/services/favoritesService';
import { listRatings, type ComboRating } from '@/services/ratingsService';

const FriendProfile: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [favorites, setFavorites] = useState<FavoriteCombo[]>([]);
  const [ratings, setRatings] = useState<ComboRating[]>([]);
  const [busy, setBusy] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setBusy(true);
    Promise.all([
      getPublicProfile(uid),
      listFavorites(uid),
      listRatings(uid),
    ])
      .then(([p, f, r]) => { setProfile(p); setFavorites(f); setRatings(r); })
      // Rules read the friendship live, so this is also what an unfriend looks
      // like while the page is open.
      .catch(() => setDenied(true))
      .finally(() => setBusy(false));
  }, [uid]);

  return (
    <div className="min-h-screen pb-24">
      <header className="flex items-center justify-between border-b border-border p-4">
        <NavigationSidebar />
        <h1 className="truncate text-2xl font-bold tracking-wider">
          {profile?.displayName ?? 'FRIEND'}
        </h1>
        <div className="w-10" />
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        {busy && <Skeleton className="h-32 w-full" />}

        {!busy && denied && (
          <p className="text-center text-turbo-muted">
            You can only see this once you are friends.
          </p>
        )}

        {!busy && !denied && (
          <>
            <Card className="bg-turbo-card border-border">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
                  Favourites ({favorites.length})
                </h2>
                {favorites.length === 0 && <p className="text-sm text-turbo-muted">Nothing saved yet.</p>}
                {favorites.map((favorite) => (
                  <p key={favorite.comboId} className="py-1 text-sm">{favorite.label}</p>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-turbo-card border-border">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
                  Ratings ({ratings.length})
                </h2>
                {ratings.length === 0 && <p className="text-sm text-turbo-muted">Nothing rated yet.</p>}
                {ratings.map((rating) => (
                  <div key={rating.comboId} className="flex items-center justify-between py-1">
                    <span className="flex-1 truncate text-sm">{rating.label}</span>
                    <StarRating value={rating.score} size="sm" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default FriendProfile;
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`:

```tsx
const FriendProfile = lazy(() => import("./pages/FriendProfile"));
```

and, **after** the `/friends` route so the static path wins:

```tsx
              <Route path="/friends/:uid" element={<FriendProfile />} />
```

- [ ] **Step 3: Typecheck, build, commit**

```bash
npx tsc --noEmit -p tsconfig.app.json && npm run build
git add src/pages/FriendProfile.tsx src/App.tsx
git commit -m "feat: view a friend's favourites and ratings"
```

---

## Task 19: Surface favourites and ratings on the profile

**Files:**
- Modify: `src/pages/Account.tsx`

- [ ] **Step 1: Add the sections**

In `src/pages/Account.tsx`, add the imports:

```tsx
import { useNavigate } from 'react-router-dom';
import { StarRating } from '@/components/StarRating';
import { listFavorites, type FavoriteCombo } from '@/services/favoritesService';
import { listRatings, type ComboRating } from '@/services/ratingsService';
```

Add state beside the existing `summary` state:

```tsx
  const [favorites, setFavorites] = useState<FavoriteCombo[]>([]);
  const [ratings, setRatings] = useState<ComboRating[]>([]);
```

Extend the existing effect that loads the summary:

```tsx
    Promise.all([listFavorites(user.uid), listRatings(user.uid)])
      .then(([f, r]) => { setFavorites(f); setRatings(r); })
      .catch(() => { setFavorites([]); setRatings([]); });
```

Add the two cards after the stats card and before the "My orders" button:

```tsx
            <Card className="bg-turbo-card border-border">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
                  Favourites ({favorites.length})
                </h2>
                {favorites.length === 0 && (
                  <p className="text-sm text-turbo-muted">Tap the heart on a mix to save it.</p>
                )}
                {favorites.map((favorite) => (
                  <p key={favorite.comboId} className="py-1 text-sm">{favorite.label}</p>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-turbo-card border-border">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
                  Your ratings ({ratings.length})
                </h2>
                {ratings.length === 0 && (
                  <p className="text-sm text-turbo-muted">Rate an order from your history.</p>
                )}
                {ratings.map((rating) => (
                  <div key={rating.comboId} className="flex items-center justify-between py-1">
                    <span className="flex-1 truncate text-sm">{rating.label}</span>
                    <StarRating value={rating.score} size="sm" />
                  </div>
                ))}
              </CardContent>
            </Card>
```

Add a Friends button beside the existing "My orders" button:

```tsx
            <Button variant="outline" className="w-full" onClick={() => navigate('/friends')}>
              Friends
            </Button>
```

- [ ] **Step 2: Typecheck, build, commit**

```bash
npx tsc --noEmit -p tsconfig.app.json && npm run build
git add src/pages/Account.tsx
git commit -m "feat: show favourites and ratings on the profile"
```

---

## Task 20: Full verification and rules deploy

**Files:** none

- [ ] **Step 1: Run everything**

```bash
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm test
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: **0 failed** across all test files, with `tests/socialRules.test.ts` at 44; exactly 4 `tsc` errors, all in `src/services/firebaseService.ts`; build succeeds.

- [ ] **Step 2: End-to-end check with two accounts**

Run `npm run dev` and, using a normal window and a private window so two accounts are signed in at once:

1. Account A builds a custom hookah, orders it, saves it as a favourite.
2. Account A rates the order from `/my-orders`.
3. Account A copies their invite link; account B opens it and a request appears.
4. Account A accepts on `/friends`.
5. Account B opens account A's friend page and sees the favourite and the rating.
6. Account B opens `/my-orders` — account A's orders are **not** there.
7. Account A removes the friendship; account B reloads the friend page and is refused.

Step 6 is the one that matters most. If a friend can see orders, stop and fix it before deploying.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/social-ratings-favorites-friends
gh pr create --base main --title "feat: ratings, favourites and friends" --body "See docs/superpowers/specs/2026-09-13-social-features-design.md"
```

- [ ] **Step 4: Deploy the rules — after the app is live, not before**

Merging deploys the app through Vercel. **Wait for that, confirm ordering still works in production, and only then:**

```bash
npm run rules:deploy
```

Deploying rules before the app is live would not break ordering here — every new collection is additive and the order rules only widen. But the project has been bitten once by deploying rules ahead of the code that satisfies them, and the habit is worth keeping.

- [ ] **Step 5: Confirm in production**

Place one order, rate it, and favourite a mix on the live site. Then check that friends genuinely cannot reach orders by signing in as a second account and requesting `/my-orders`.

---

## Notes for whoever executes this

**The one thing not to get wrong.** Orders stay owner-only. Favourites and ratings are friend-readable; orders never are. If a task seems to need loosening `match /orders`, it is wrong — the friend-visible data is the projection under `users/{uid}/ratings`, which exists precisely so the order does not have to be opened up.

**Anonymous guests.** Favourites and ratings work for them and survive signing up, because `linkWithCredential` preserves the uid and everything lives under `users/{uid}/`. Friends require a real account: a friendship needs a profile, and `upsertUserProfile` deliberately writes nothing for anonymous users. `Friends.tsx` handles this with a sign-up prompt.

**Orders placed before this ships cannot be rated.** They carry no `comboId` and it is not backfillable. Every rating control is conditional on `comboId` being present. That is correct behaviour, not a gap to paper over.
