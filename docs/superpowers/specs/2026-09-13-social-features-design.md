# Social Features Design — Ratings, Favourites, Friends

**Date:** 2026-09-13
**Status:** Approved for planning

## Goal

Give customers three things: star ratings on what they ordered, saved favourite combos they can re-order in one tap, and friends who can see each other's favourites and ratings.

## Why these three together

Ratings and favourites share a data shape — one small owner-written document per user per combo. Friends is what makes them social. Built alone, a friends list shows a name and nothing else.

The user chose a single spec covering all three, having been shown the alternative of slicing friends off on its own. The privacy design for friends is therefore called out explicitly in its own sections rather than being decided in passing.

---

## 1. Combo identity

A custom build is ephemeral today. It is assembled in `Index.tsx`, dropped into the cart, written into the order, and forgotten. There is no id for "the mix I invented last Tuesday", so there is nothing to attach a favourite or a rating to.

### Derivation

```
mix:{mixDocId}
custom:{fnv1a64(hookahId|tobaccoType|sortedFlavorIds)}
```

Curated mixes already have stable document ids. The tobacco category chosen at order time (`virginia` / `darkblend` / `mix`) is **not** part of a mix's combo id: it is a variant of one combo, not three combos.

Custom builds hash three fields and no others:

- `hookahId`
- `tobaccoType`
- `flavorIds`, sorted ascending, joined with `,`

Strength, flavour percentages, ice and addons are deliberately **excluded**. They are personalisation, not identity. Including them would make 60/40 Mint-Lemon and 61/39 Mint-Lemon different combos, and nothing would ever accumulate.

### Hash choice: FNV-1a 64-bit, not SHA-256

`crypto.subtle.digest` requires a secure context. This project has already been bitten by that: `crypto.randomUUID()` was `undefined` when the dev server was opened over a LAN IP on plain HTTP, which unmounted the React tree and produced a blank page (fixed in `RedirectPage.tsx`).

The combo id is an identity key, not a security boundary — a collision merges two combos' ratings, it does not grant access to anything. A pure-JS FNV-1a 64-bit hash is deterministic, synchronous, and has no secure-context dependency. With a few hundred real combos, 64 bits makes collision probability negligible.

SHA-256 *is* required for `discoverable` document ids, because Firestore rules must recompute the same hash. See §5.

### Required change to the order write path

Cart items carry flavour **names** today, with percentages baked into the string (`"Mint 60%"`). A stable id needs structured ids.

`CartItem` and `DatabaseOrderItem` gain:

| field | type | set for |
|---|---|---|
| `comboId` | `string` | both paths |
| `mixId` | `string?` | curated mixes |
| `hookahId` | `string?` | custom builds |
| `flavorIds` | `string[]?` | custom builds |

Existing display fields (`name`, `flavors`, `hookah`) are unchanged — staff still read those.

This adds a few dozen bytes per order item. Irrelevant against the ~1 KB order documents that resulted from stripping base64 images.

### Consequence: old orders cannot be rated

Orders placed before this ships carry no `comboId`, so they cannot be rated. This is **not backfillable** — flavour names with percentages baked in do not reliably reverse to flavour ids, and hookah names are not unique keys.

The UI must handle this rather than break: an order without a `comboId` shows no star row. Not an error state, not a message — the control is simply absent.

---

## 2. Data model

| path | writes | reads | contents |
|---|---|---|---|
| `orders/{id}.rating` | owner | owner, admin | `1..5`, plus `ratedAt` |
| `users/{uid}/ratings/{comboId}` | owner | owner, accepted friends | `score`, `comboId`, `label`, `ratedAt` |
| `users/{uid}/favorites/{comboId}` | owner | owner, accepted friends | recipe snapshot, `label`, `createdAt` |
| `profiles/{uid}` | owner | self, any friendship (incl. pending) | `displayName`, `photoURL`, `updatedAt` |
| `inviteCodes/{code}` | owner | any signed-in, **get only** | `uid`, `displayName` |
| `discoverable/{sha256(email)}` | owner | any signed-in, **get only** | `uid`, `displayName` |
| `friendships/{pairId}` | either party | either party | `uids[2]`, `requestedBy`, `status`, timestamps |

### Why ratings are stored twice

The rating on the order proves it is real: rules already establish that the caller owns that order, so a rating there is by construction tied to a purchase. But orders must stay sealed — they carry table, total and timestamp, which is precisely what the user decided friends should not see.

So the shareable form is a projection under the rater: `users/{uid}/ratings/{comboId}` holds the score and a human label, and nothing about when they visited, where they sat, or what they paid.

Both writes happen in one batch. If they diverge, the order's `rating` is authoritative for "have I rated this", and the projection is authoritative for what friends see.

### Why `profiles/{uid}` is separate from `users/{uid}`

**Firestore has no field-level read security.** A rule granting a friend read access to `users/{uid}` would hand them the email address, order count, total spend and last-order timestamp along with the display name.

Shareable fields therefore move to their own document. `users/{uid}` stays strictly owner-only, exactly as it is now.

### Favourite snapshot stores ids, never prices

```
{
  comboId, label,
  kind: 'mix' | 'custom',
  mixId?, hookahId?, tobaccoType?, flavorIds?,
  tobaccoStrength?, flavorPercentages?, addons?, withIce?,
  createdAt
}
```

Re-ordering resolves against the live menu and re-prices from it. A stored price would let a saved favourite quietly undercharge after a price rise. If a flavour or hookah has since been deactivated, the re-order flow says so instead of silently dropping it.

Strength, percentages and addons are stored here even though they are excluded from the combo id — the favourite should restore the customer's exact build.

### `label` is denormalised on purpose

Both favourites and ratings store a human-readable `label`:

- curated mix — the mix name, e.g. `"Sunset Blend"`
- custom build — hookah and flavours joined, e.g. `"Khalil Mamoon · Mint, Lemon"`

A friend viewing your list would otherwise have to resolve menu ids to names, which means reading the menu and hoping every id still exists. A mix can be deactivated or renamed; the label is what you rated, frozen at the time you rated it. It is display text only and never used as a key.

---

## 3. Ratings

Given only from order history (`/my-orders`), where ownership is already proven.

Rating is **not** prompted on the confirmation overlay. The customer has not smoked it yet; a rating collected there measures nothing.

A rating may be changed. The order's `rating` field is overwritten and the projection updated in the same batch.

### No aggregate in v1

There is no `★ 4.3 (28)` on menu cards, and no `comboStats` collection.

For the chosen scope nothing needs an average: friends see individual ratings and you see your own. Maintaining a live aggregate without Cloud Functions means transactional counters validated in rules through `getAfter()`, plus first-time-versus-edit detection to prevent double counting — by a wide margin the most intricate piece of the build, for a number nothing currently displays.

If menu averages are wanted later, the approach is: `comboStats/{comboId}` holding `{sum, count}`, updated in the same transaction as the rating, with rules using `get()` on the pre-state and `getAfter()` on the post-state of the order to verify the delta and to distinguish a new rating (`count + 1`) from an edit (`count + 0`). Recorded here so the follow-up does not start from scratch.

---

## 4. Favourites

Heart control on curated mix cards. "Save this combo" in the custom builder, offered after a build is added to the cart.

Favourites and ratings both work for **anonymous guests**, and survive signing up. The anonymous-to-account upgrade uses `linkWithCredential` / `linkWithPopup`, which preserves the uid, so everything under `users/{uid}/` carries over with no migration.

Friends require a real account: a friendship needs a profile, and `upsertUserProfile` deliberately writes nothing for anonymous users.

---

## 5. Friends

### Relationship document

One document per relationship. `pairId` is the two uids sorted ascending and joined with `_`, so rules can compute it without a lookup.

```
friendships/{pairId} = {
  uids: [uidA, uidB],     // sorted
  requestedBy: uid,
  status: 'pending' | 'accepted',
  createdAt, acceptedAt?
}
```

| action | who | effect |
|---|---|---|
| request | either | create with `status: 'pending'` |
| accept | **only the other party** | `pending` → `accepted` |
| decline / cancel / unfriend | either | delete |

Decline, cancel and unfriend are all a delete. There is no blocklist, and no record is kept of a declined request — a person may request again. This is a bar with a few hundred customers, not a social network; a blocklist can be added if it is ever actually needed.

**Simultaneous requests.** Because `pairId` is derived from the two uids, both people requesting each other target the same document. Firestore evaluates the second write as an *update* rather than a create, since the document now exists, and the update rule permits only the other party flipping `pending` → `accepted`. So it is denied.

The client must not surface that as an error: on a denied request it re-reads the document, and if it finds a pending request from the other person it offers Accept instead. Two people tapping at the same table is a likely case, not an edge case.

Unfriending revokes access immediately, because rules evaluate the friendship document live on every read.

### Discovery — all three routes

**Invite link and QR.** `inviteCodes/{code}` maps a random code to a uid and display name. `get` is allowed to any signed-in user, `list` is denied, so codes cannot be enumerated. The code is generated with `crypto.getRandomValues`, which — unlike `crypto.subtle` — is available in non-secure contexts.

The current code is stored as `users/{uid}.inviteCode` so the profile screen can render the QR without a lookup. Rotating means: create the new `inviteCodes` document, update `users/{uid}.inviteCode`, then delete the old document. In that order — a crash midway leaves two working codes, which is harmless, whereas deleting first would leave a customer with a QR that resolves to nothing.

**Email search.** `discoverable/{sha256(lowercased email)}` maps to uid and display name. `get` allowed, `list` denied.

This is the route the user chose against a recommendation, so its mitigations are load-bearing:

- **Opt-in, default off.** A customer is not findable until they turn it on.
- **Exact hash lookup only.** `list` is denied, so the collection cannot be walked. Someone can confirm an address they already hold; they cannot harvest the user base.
- **No squatting.** Rules verify the document id equals the SHA-256 of the caller's *own* token email, using `hashing.sha256()`. Nobody can publish a document under another person's email hash.
- **Minimal payload.** The document returns a display name and uid, never an email back.

The toggle's state is mirrored as `users/{uid}.discoverableByEmail` so the settings screen can render without computing a hash on every load. **The document's existence is authoritative**: if the two ever disagree, whether `discoverable/{hash}` exists is what actually determines findability, and the boolean is repaired to match. Turning the toggle off deletes the document first and updates the flag second, so an interrupted opt-out never leaves someone findable while their settings claim otherwise.

The residual risk is unchanged and should be stated plainly: anyone who already knows a customer's email can confirm that the customer drinks at this bar, provided that customer opted in. That is inherent to email search and is the reason the default is off.

SHA-256 here needs `crypto.subtle`, so the opt-in toggle requires a secure context. `localhost` counts as secure, so normal development is fine; only LAN-IP testing over plain HTTP is affected, and only for this one toggle.

### What a friend sees

Display name, favourited combos, and star ratings given. Nothing else.

Orders remain owner-or-admin. No presence, no "who is at the bar", no activity feed, no spend, no visit times.

---

## 6. Security rules

Helper functions:

```
function friendPairId(a, b) {
  return a < b ? a + '_' + b : b + '_' + a;
}

function sharesFriendshipWith(owner) {
  let pair = friendPairId(request.auth.uid, owner);
  return request.auth.uid != owner
    && exists(/databases/$(database)/documents/friendships/$(pair));
}

function isFriendOf(owner) {
  let pair = friendPairId(request.auth.uid, owner);
  return request.auth.uid != owner
    && exists(/databases/$(database)/documents/friendships/$(pair))
    && get(/databases/$(database)/documents/friendships/$(pair)).data.status == 'accepted';
}
```

`exists()` is checked before `get()` because `get()` on a missing document raises rather than returning null, and a raise in a helper would deny reads for reasons unrelated to friendship.

Profiles are readable on *any* friendship including pending, so the recipient of a request can see who is asking without the requester being able to supply their own name. Favourites and ratings require `accepted`.

### Order rating update

`orders` currently allows update only to admins. It gains a narrow owner path:

```
allow update: if isAdmin()
  || (isSignedIn() && ownsOrder()
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['rating','ratedAt'])
      && request.resource.data.rating is int
      && request.resource.data.rating >= 1
      && request.resource.data.rating <= 5);
```

`affectedKeys().hasOnly([...])` is what stops a customer from riding this path to alter `status` or `total`.

### Fix to `ownsOrder()` while here

```
function ownsOrder() {
  return resource.data.get('customerInfo', {}).get('uid', '') == request.auth.uid;
}
```

The current version accesses `resource.data.customerInfo.uid` directly, which **raises** on orders written in the pre-uid shape rather than evaluating to false. The resulting denial is correct, but it arrives as an error and logs `Property uid is undefined` on every such read. The create rule was already made tolerant for exactly this reason; the read path was missed.

### Subcollections need their own blocks

`match /users/{uid}` is not recursive, so `users/{uid}/favorites` and `users/{uid}/ratings` are not covered by it and get their own match blocks. Worth stating because the natural assumption is the opposite.

---

## 7. Indexes

None. Friends are listed with a single `where('uids', 'array-contains', myUid)` query and the `pending` / `accepted` split is done client-side. A customer here has at most a few dozen friends, so filtering in the client avoids a composite index and a deploy step.

`firestore.indexes.json` is unchanged.

---

## 8. Files

**New services**

- `src/services/comboId.ts` — FNV-1a and both id builders. Pure, no Firebase import, directly unit-testable. Follows the pattern established by `orderItem.ts`.
- `src/services/favoritesService.ts`
- `src/services/ratingsService.ts`
- `src/services/friendsService.ts` — friendships, invite codes, discoverable opt-in
- `src/services/profileService.ts` — `profiles/{uid}` reads and writes

**New pages / components**

- `src/pages/Friends.tsx` — invite QR and link, email search, incoming and outgoing requests, friend list
- `src/pages/FriendProfile.tsx` — one friend's favourites and ratings
- `src/components/StarRating.tsx` — interactive and read-only
- `src/components/FavoriteButton.tsx`

**Modified**

- `src/pages/Index.tsx` — pass ids into cart items; heart on mix cards; "Save this combo"
- `src/pages/MyOrders.tsx` — star row per rateable order
- `src/pages/Account.tsx` — favourites, ratings and friends sections
- `src/components/NavigationSidebar.tsx` — Friends entry
- `src/contexts/CartContext.tsx`, `src/types/database.ts`, `src/services/orderItem.ts` — new id fields
- `firestore.rules`

---

## 9. Testing

`comboId.ts` gets unit tests: same inputs produce the same id, flavour order does not matter, strength and percentages do not change the id, different flavours do.

Rules tests currently number 30 and roughly double. The cases that carry weight:

- a stranger cannot read favourites or ratings
- a **pending** friendship grants no access to favourites or ratings
- a pending friendship *does* allow reading the profile
- deleting a friendship revokes access immediately
- a user cannot accept a request they sent themselves
- a user cannot create a friendship they are not part of
- a second, simultaneous request on the same pair is denied rather than overwriting the first
- `pairId` must match the sorted uids
- rating an order cannot change `status` or `total`
- a rating outside 1–5 is rejected
- a user cannot rate someone else's order
- a user cannot write a `discoverable` document under another person's email hash
- `discoverable` and `inviteCodes` reject `list` while allowing `get`
- friends still cannot read each other's orders

---

## 10. Out of scope

- Orders visible to friends — sealed, by decision
- Presence or "who is at the bar"
- Menu star averages, and the `comboStats` aggregate
- Friend activity feed
- Blocklist
- Rating orders placed before this ships
- Friends for anonymous guests

## 11. Known risks

| risk | disposition |
|---|---|
| Pre-existing orders unrateable | Accepted. Star row hidden when `comboId` is absent. |
| Email search confirms a known address belongs to a customer | Mitigated by opt-in default-off, get-only access, and hash-ownership checks. Residual risk accepted by the user. |
| `crypto.subtle` needs a secure context | Affects only the discoverable opt-in. `localhost` is secure; LAN-IP HTTP dev is not. |
| Combo id collision merges two combos | 64-bit hash against a few hundred combos. Negligible. |
| Rules `get()` costs a read per friend-scoped query | Cached within a single rule evaluation. Volume here is trivial. |
