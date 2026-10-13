# Poke, Now Smoking and User-Made Mixes — Design

**Date:** 2026-10-13
**Status:** Approved

## Goal

Three social features on top of the friends system shipped in PR #11:

1. **Poke** — nudge a friend; they see it in the app.
2. **What is my friend smoking?** — opted-in customers share what they just ordered with friends.
3. **User-made mixes** — customers submit a custom build as a named mix; once an admin approves it, everyone can see and order it.

One spec, one plan, one PR, as chosen. The plan builds them in the order above so every
task leaves the app shippable.

## Decisions taken

| Question | Decision |
|---|---|
| Poke delivery | In-app only. No push, no service worker, no Cloud Functions. Stored so push can be layered on later. |
| Now smoking visibility | Opt-in, off by default. |
| User mixes audience | Everyone, after admin approval. |
| Packaging | One spec, one plan. |

## The invariant this must not break

**Orders stay owner-only.** Nothing here makes an order document readable by anyone but
its owner and admins. "Now smoking" is a separate projection written at checkout,
exactly as `users/{uid}/ratings` is a projection of order ratings. If any task appears to
need `match /orders` loosened, the task is wrong.

## Existing pieces this builds on

- Rules helpers in `firestore.rules`: `isSignedIn`, `isAdmin`, `isRealAccount`,
  `isFriendOf(uid)`, `sharesFriendshipWith`.
- `profiles/{uid}` holds the public `displayName`.
- `users/{uid}` is owner-only and already holds `discoverableByEmail`.
- `resolveReorder` in `src/services/reorderService.ts` rebuilds a cart item from a saved
  build against the **live** menu: it re-prices, and refuses anything deactivated, naming it.
- `publishMenuSnapshot()` folds the menu into one document, `menu/current`, so guests load
  the menu in one read.
- Checkout (`src/pages/Cart.tsx`) already runs a non-fatal side effect after
  `submitOrder`: `recordOrderPlaced(user).catch(() => undefined)`.

---

## 1. Poke

### Data

`users/{toUid}/pokes/{fromUid}`:

```ts
{ at: Timestamp; seenAt?: Timestamp }
```

**One document per poker, overwritten on each poke.** The deterministic id is what makes
a rate limit enforceable in rules. With one new document per poke, nothing short of a
server could count them.

A poke is **unseen** when `seenAt` is absent or earlier than `at`.

### Rules

- **Create or update by the poker** (`fromUid == request.auth.uid`). The caller must be a
  real account and an accepted friend of `toUid` (`isFriendOf(toUid)`). Only `at` may be
  written, and it must equal `request.time`. An update additionally requires the previous
  `at` to be at least **10 minutes** old.
- **Update by the recipient** (`toUid == request.auth.uid`): only `seenAt`, equal to
  `request.time`.
- **Read:** the recipient reads all of theirs; the poker may `get` the one they wrote, so
  the UI can show "poked 3 min ago".
- **Delete:** the recipient only.

### UI

- **Poke** button on each friend row in `/friends` and on the friend's profile page.
  It is disabled with "poked 3 min ago" inside the 10-minute window, and the rule enforces
  the window regardless of the UI.
- A listener on the signed-in user's `pokes` subcollection while the app is open:
  - each new unseen poke shows a toast: "Andrei poked you 👉", with **Poke back**;
  - the count of unseen pokes shows as a badge on the menu button.
- Opening `/friends` marks all unseen pokes as seen.
- Real accounts only; guests have no friends.

---

## 2. What is my friend smoking?

### Opt-in

A switch on the account page: **"Let friends see what I'm smoking"**, off by default.
Stored as `shareNowSmoking: boolean` on `users/{uid}`, beside `discoverableByEmail`.
Turning it **off** also deletes the customer's current `nowSmoking` document, so it stops
showing immediately rather than when it expires.

### Data

`nowSmoking/{uid}`:

```ts
{
  items: Array<{
    comboId: string;
    label: string;
    // custom builds only, so a friend can "Order the same"; a curated mix
    // resolves from its comboId (mix:{id}) alone
    hookahId?: string;
    tobaccoType?: string;
    flavorIds?: string[];
  }>;
  since: Timestamp;
}
```

Personalisation — strength, percentages, add-ons — is deliberately **not** shared.

- `items` are the ordered combos, from each order item's `comboId` and `comboLabel`
  (falling back to `name` for an item without a label). At most 5, each label at most
  200 characters, matching the bounds on favourites and ratings.
- Order items with no `comboId` (legacy shapes) are left out. If nothing qualifies,
  nothing is written.

### Why a projection and not a profile field

A field on `profiles/{uid}` would put a live status inside an identity record. Every
profile read — friend lists, request names — would carry it, and the opt-in would be
tangled with display-name writes. A separate document keeps it separately permissioned
and separately deletable.

### Writing it

At checkout, after `submitOrder` succeeds and only when `shareNowSmoking` is on, write
`nowSmoking/{uid}`, using the same non-fatal pattern as `recordOrderPlaced`. **A failure
here must never fail or appear to fail the order** — checkout is the bar's revenue path.

### Expiry

Two hours. The client hides a `nowSmoking` document whose `since` is older than that, so
no cleanup job is needed. The document stays until the next order overwrites it or the
customer opts out.

### Rules

- **Read:** the owner, or an accepted friend (`isFriendOf(uid)`).
- **Write:** the owner only. Fields `hasOnly(['items', 'since'])`, `since == request.time`,
  `items` a list of at most 5; each label at most 200 characters and each
  `flavorIds` at most 10 entries, matching the favourites block.
- **Delete:** the owner.

### UI

- On `/friends`, a friend with a live `nowSmoking` shows "smoking Khalil Mamoon · Mint,
  Lemon" under their name.
- On the friend's profile page, a **Now smoking** card listing the items, each with
  **Order the same**.
- **Order the same** resolves the combo against the live menu through `resolveReorder`:
  - the price is always today's price;
  - if something has since been deactivated, it says what, and adds nothing.
  - A curated mix resolves from its `comboId` alone; a custom build from the
    `hookahId`, `tobaccoType` and `flavorIds` carried in the item. The friend gets the
    combo at default strength and no add-ons, since personalisation is not shared.

---

## 3. User-made mixes

### Submitting

From a **saved custom favourite** on the account page, a customer with a real account taps
**Share as a mix** and gives:

- a **name** (required, at most 40 characters);
- a **description** (optional, at most 140 characters).

A display name on their profile is required, because the mix is credited publicly.

### Data

`userMixes/{id}` (auto id):

```ts
{
  creatorUid: string;
  creatorName: string;
  name: string;
  description?: string;
  // the build, same fields and bounds as a custom favourite
  hookahId: string;
  tobaccoType: string;
  flavorIds: string[];
  tobaccoStrength?: number;
  flavorPercentages?: Record<string, number>;
  withIce?: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
}
```

### Rules

- **Create:** a real account, `creatorUid == request.auth.uid`, `status == 'pending'`,
  `createdAt == request.time`, all fields shape-pinned and bounded, and
  `creatorName == get(/profiles/$(request.auth.uid)).data.displayName`. The last check
  stops a customer crediting a mix to someone else's name.
- **Read:** anyone signed in may read `status == 'approved'`; the creator reads their own
  in any state; admins read all. Lists are constrained to match, so a query for pending
  mixes is denied to non-admins rather than filtered.
- **Update:** admins only, and only `status` (to `approved` or `rejected`) and
  `reviewedAt == request.time`. The creator cannot edit; they withdraw and resubmit.
- **Delete:** the creator, or an admin.

There is no per-customer submission cap — the rules cannot count, and the approval
queue already is the filter.

### Back office

A **Community mixes** tab in menu management:

- the pending queue, oldest first, showing name, description, creator and the build in
  words;
- **Approve** and **Reject** on each;
- an approved list with **Remove**, which sets the mix back to `rejected`.

Every approve, reject or remove **republishes the menu snapshot**, matching every other
mutation on that screen.

### Customer side

- `publishMenuSnapshot()` includes approved user mixes, so guests still load the whole
  menu in **one document read**. `MenuData` gains `communityMixes`, optional, because a
  snapshot published before this ships has none.
- A **Community mixes** section on the menu, below the recommended mixes, each card
  credited "by Andrei".
- **Add** resolves the build through `resolveReorder`: today's price, and a clear refusal
  naming anything deactivated. A mix that cannot currently be ordered still shows, marked
  unavailable, rather than vanishing without explanation.
- The cart item gets the build's ordinary custom `comboId`, so favouriting and rating it
  work exactly as for any custom build.
- The creator sees their submissions and each one's status on the account page.

---

## Testing

- **Rules, emulator-backed, in `tests/socialRules.test.ts`.** Every rule above gets an
  allow case and the denials that matter. At minimum:
  - a non-friend cannot poke; a second poke inside 10 minutes is denied; the recipient
    cannot forge `at`; the poker cannot set `seenAt`;
  - a non-friend cannot read `nowSmoking`; a friend can; oversized `items` are denied;
  - **a friend still cannot read the order** (the existing assertion keeps passing);
  - a customer cannot create a mix as `approved`, cannot credit it to another name, and
    cannot approve their own; a non-admin cannot list pending mixes; the public can read
    approved ones.
- **Pure logic, unit-tested:**
  - building `nowSmoking.items` from order items (legacy items skipped, cap of 5, label
    fallback);
  - the 2-hour freshness check;
  - "is this poke unseen";
  - turning a `userMixes` document into a resolvable build.
- `npm run dev` is never used — it points at the live production database.

## Deploying

New rules for `pokes`, `nowSmoking` and `userMixes`, plus `shareNowSmoking` living in the
already-owner-only `users/{uid}`. Everything is additive; no existing access narrows.

Deploy **rules only** (`firebase deploy --only firestore:rules`), from an up-to-date
`main` checkout, after the app is live. `firestore.indexes.json` is out of sync with
production (3 console-created indexes are missing from it), so `npm run rules:deploy`
would try to delete them.

Queries that may need a composite index:

- the admin queue: `status == 'pending'` ordered by `createdAt`;
- the creator's own list: `creatorUid == uid` ordered by `createdAt`.

Add these to `firestore.indexes.json`. Deploying them means reconciling that file first,
so the indexes step is a separate, deliberate action, not part of the rules deploy.

## Out of scope

Push notifications, poke messages or emoji, reactions on now smoking, comments or ratings
on community mixes, editing a submitted mix, and per-customer submission limits.
