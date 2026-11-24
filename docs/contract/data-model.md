# turbo-menu data model and client contract

This is the reference for native (iOS / Android) clients that read and write the
same Cloud Firestore database as the turbo-menu web app. There is no server: every
rule a client must obey is in `firestore.rules`, and every shape below is what the
web client (the reference implementation) writes today.

Sources, in priority order: `firestore.rules`, `src/services/*.ts`,
`src/types/database.ts`, `src/contexts/CartContext.tsx`,
`src/contexts/AuthContext.tsx`, `firestore.indexes.json`, `tests/*.test.ts`. A few
call sites in `src/pages/` and `src/components/` are cited where they decide what
gets written. Anything the sources leave open is listed under
[Open questions / inconsistencies](#open-questions--inconsistencies).

Conventions used in this document:

- **Types** are Firestore value types: `string`, `integer` (Firestore `integerValue`),
  `double`, `number` (rules `is number`: integer or double both pass),
  `boolean`, `timestamp`, `map`, `array`, `null`.
- **"server time"** means the value must be the server-timestamp sentinel
  (`FieldValue.serverTimestamp()`). Rules compare it with `request.time`, so a
  device-clock `Date` is rejected.
- **"absent"** means the key must not be in the document. A `null` is not the same
  thing and is often rejected.
- **Owner** means `request.auth.uid` equals the uid in the path.
- **Signed in** (`isSignedIn()`) is true for anonymous guests too. **Real account**
  (`isRealAccount()`) means the token's `firebase.sign_in_provider` is not
  `'anonymous'`. **Admin** (`isAdmin()`) means the ID token carries the custom claim
  `admin == true`.
- **Friend of X** (`isFriendOf(X)`) means `friendships/{pairId(caller, X)}` exists
  and has `status == 'accepted'`. **Shares a friendship with X**
  (`sharesFriendshipWith(X)`) means that document exists with any status
  (`pending` or `accepted`), and the caller is not X.
- **Has a claim on X** (`hasClaimOn(X)`) means `accountClaims/{X}` exists and its
  `claimedBy == request.auth.uid` (and X is not `''`).

---

## Contents

1. [Sign-in and identity](#1-sign-in-and-identity)
2. [Ordering flow](#2-ordering-flow)
3. [Menu loading](#3-menu-loading)
4. [Friends flow](#4-friends-flow)
5. [Collections reference](#5-collections-reference)
6. [Composite indexes](#6-composite-indexes)
7. [Cross-platform pitfalls](#7-cross-platform-pitfalls)
8. [Contract vectors](#8-contract-vectors)
9. [Open questions / inconsistencies](#open-questions--inconsistencies)

---

## 1. Sign-in and identity

Reference: `src/services/authService.ts`, `src/contexts/AuthContext.tsx`,
`src/services/accountClaimService.ts`, `src/services/userService.ts`,
`src/services/profileService.ts`.

### Session bootstrap

- Every visitor gets a Firebase Auth session. With no current user, the web app calls
  `signInAnonymously` (`ensureSignedIn()`; concurrent callers share one pending
  promise so only one anonymous account is created).
- `AuthContext` listens with `onIdTokenChanged`, not `onAuthStateChanged`. Linking a
  guest to a real account keeps the uid, so only the id-token listener sees the
  upgrade.
- When the user signs out (`logout()` = `signOut`), the listener sees `null` and
  starts a fresh anonymous session.
- Admin status comes from the ID token claim `admin === true` (`getIdTokenResult().claims.admin`),
  never from a document.

### Providers

| Provider | Web call | Notes |
|---|---|---|
| Anonymous | `signInAnonymously` | Default for everyone. |
| Google | `linkWithPopup` (guest) / `signInWithPopup` | On `auth/credential-already-in-use`, `auth/email-already-in-use` or `auth/provider-already-linked` the web signs in to the existing account (`signInWithCredential` with `GoogleAuthProvider.credentialFromError`, else a popup) and throws `AccountExistsError`. |
| Email + password | `linkWithCredential(EmailAuthProvider.credential)` (guest) / `createUserWithEmailAndPassword` / `signInWithEmailAndPassword` | Same three "already in use" codes fall back to `signInWithEmailAndPassword` and throw `AccountExistsError`. After sign-up: `updateProfile({displayName})` if given, and `sendEmailVerification` (not awaited as a gate; verification is never required). Password reset: `sendPasswordResetEmail`. |

### What a guest (anonymous) can and cannot do

Per the rules:

| Action | Guest allowed? | Rule |
|---|---|---|
| Read menu, hookahs, tobaccoTypes, flavors, recommendedMixes, communityMixes | Yes (even with no session at all) | `allow read: if true` |
| Create an order, read and rate own orders | Yes | `isSignedIn()` |
| Create `notifications` of type `new_order` | Yes | `isSignedIn()` |
| Create own `accountClaims/{uid}` | Yes | `isSignedIn()` |
| Write own `users/{uid}`, favourites, counter, ratings, `profiles/{uid}`, `nowSmoking/{uid}` | Rules permit (no `isRealAccount()` check) | The web app writes favourites and ratings for guests, but deliberately skips `users/{uid}` (`upsertUserProfile`, `recordOrderPlaced`), `profiles/{uid}` (`upsertPublicProfile`) and `nowSmoking/{uid}` (`shareWhatImSmoking`) when `user.isAnonymous`. Native clients must do the same. |
| Create `inviteCodes`, create or accept `friendships`, create or update `pokes`, create `userMixes` | **No** | `isRealAccount()` required |
| Write `discoverable` | **No** in practice | Requires a non-empty `email` claim on the token. |

### On every real-account token change (`AuthContext`)

Once per uid per app session, fire-and-forget and non-fatal:

1. `upsertPublicProfile(user)`: writes `profiles/{uid}` (see [profiles](#profilesuid)).
2. `claimGuestData(user)`: finishes or burns any guest claim held on this device (see below).

After explicit sign-up / sign-in / rename the web also calls `upsertUserProfile(user)`
(writes `users/{uid}` then, non-fatally, `profiles/{uid}`) and, on rename,
`refreshInviteCodeName(user)`.

### Guest → account claim flow

Problem: linking (sign **up** while a guest) keeps the uid, so nothing has to move.
Signing **in** to an account that already exists yields a different uid, and Firebase
cannot merge accounts. The claim flow moves the guest's orders, favourites and ratings
to the new uid, proved by a secret held only on the guest device.
Implementation: `src/services/accountClaimService.ts`.

Local state: key `turbo-guest-claim` in `localStorage` (native: use secure, per-install
storage), JSON:

| Field | Type | Meaning |
|---|---|---|
| `uid` | string | The anonymous uid the claim belongs to. |
| `secret` | string | 64 lower-case hex chars: 32 random bytes from a CSPRNG. |
| `orderIds` | string[] | The guest's order ids, captured while still anonymous. |
| `written` | boolean | Whether `accountClaims/{uid}` is known to exist. |
| `attempts` | number | Failed migration runs so far (max 3). |

**Guest side, `ensureGuestClaim(user)`**: called when the sign-in screen mounts, while the
caller is still anonymous, and before any sign-in starts.

1. If the user is not anonymous, stop. If SHA-256 is unavailable, stop (the web needs `crypto.subtle`).
2. Read the stored record. `reuse` = stored record exists with `uid == user.uid`. A record for another uid is replaced.
3. Snapshot `orderIds`: query `orders` where `customerInfo.uid == user.uid` (no `orderBy`). On failure keep the stored ids (if reusing) or `[]`.
4. If reusing and `written` is true: save the record with the new `orderIds` and stop.
5. `secret` = stored secret if reusing, else new random hex. `secretHash` = lower-case hex SHA-256 of the UTF-8 bytes of the `secret` **string** (that is, of the 64 hex characters, not of the raw 32 bytes).
6. Save the record with `written: false, attempts: 0` **before** writing to Firestore.
7. `set accountClaims/{uid}` = `{ secretHash, createdAt: serverTimestamp() }`. If this fails and the secret was new, throw. If it fails while reusing, assume the document already exists.
8. Save the record with `written: true`.

**Account side, `claimGuestData(newUser)` → `runClaim`**: run after any successful
real-account sign-in. It is deduplicated per uid and its result is cached for the session.

1. Wait for any in-flight `ensureGuestClaim`. Read the stored record; if there is none, return `null`.
2. **Same uid** (sign-up / link path): *burn* the claim. `update accountClaims/{uid}` with `{ claimedBy: uid, secret }`, then delete it, then clear local storage. Errors are ignored. This stops a leaked secret being used later.
3. If `attempts >= 3`: clear local storage, return `null`.
4. **Take** the claim: `update accountClaims/{anonUid}` with `{ claimedBy: newUid, secret }`. A failure is logged and ignored: on a resumed run it is already taken, and every later step is gated by the same rule.
5. List the orders the new uid already owns (`where customerInfo.uid == newUid`). If that read fails, move no orders this run.
6. **Orders**: `pending` = stored `orderIds` not already owned. Reassign in `writeBatch`es of up to 450 with `update orders/{id}` setting the **dotted field path** `'customerInfo.uid'` to `newUid`. Replacing the whole `customerInfo` map is denied. If a batch fails, retry each order on its own.
7. **Favourites**: read the guest's favourites (allowed by `hasClaimOn`), the account's favourites and the account's counter. The existing account wins on any `comboId` collision: the guest copy is deleted and not copied. Of the guest-only favourites, as many as fit under 20 move, newest `createdAt` first (`favoritesThatFit`). Each one is copied with `addFavorite(newUid, fav)` (a transaction, `createdAt` restamped with server time) and then deleted from the guest. Favourites that do not fit stay on the guest uid and are counted in `favoritesDidNotFit`.
8. **Ratings**: same collision rule. For each guest rating with a valid integer score from 1 to 5 that the account lacks, `set users/{newUid}/ratings/{comboId}` = `{comboId, label: truncateLabel(label), score, ratedAt: serverTimestamp()}`. Then delete the guest copy, including for colliding or invalid ratings.
9. `outstanding` = unmoved orders + failed favourite moves + failed rating moves. If it is 0: delete `accountClaims/{anonUid}`, then clear local storage. Otherwise increment `attempts` and keep the record so the next sign-in resumes.

Guests never have `nowSmoking`, `profiles`, `users` documents in the web flow, so those are not migrated.

---

## 2. Ordering flow

Reference: `src/pages/Index.tsx` (builder), `src/contexts/CartContext.tsx`,
`src/pages/Cart.tsx` (submit), `src/services/orderService.ts`,
`src/services/firebaseService.ts`, `src/services/orderItem.ts`,
`src/services/nowSmokingService.ts`, `src/contexts/OrderTrackingContext.tsx`.

### 2.1 Table id

- Table QR codes open a URL whose **path** contains `table-` (e.g. `/table-5`), or the
  bar QR, whose path contains `bar`. `Index.tsx` stores `location.pathname`
  **verbatim, leading slash included** under local key `turbo-table` whenever the path
  includes `table-` or `bar`.
- `TableContext.tsx` also accepts a `?table=` query parameter and stores its raw value
  under the same key. With neither present it falls back to the stored value.
- Validation (`isValidTableId` in `src/services/tableValidation.ts`): non-empty and
  contains the substring `table-` **or** `bar`. That is the whole check. It runs before
  anything is added to the cart (builder, mixes, hookah of the day, re-order). The
  `/save-favourite` path (`saveFavoriteMode.ts`) adds favourites instead of cart items
  and needs no table.
- At submit, `Cart.tsx` reads `turbo-table` again (`|| ''`) and writes it as the
  order's top-level `table`. It does not re-validate.

### 2.2 Cart item shape (`CartItem`, client memory only)

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Cart line id. Mix: `mix-{mixId}-{category}`. Custom: `custom-{epochMillis}`. Hookah of the day: `hotd-{hash}`. Adding an item whose `id` is already in the cart increments its quantity. |
| `type` | `'mix' \| 'custom'` | Hookah of the day is `'mix'`. |
| `name` | string | Mix: `"{mix.name} (Virginia\|Darkblend\|Mix)"`. Custom: literal `"Custom Mix"`. HOTD: `"Hookah of the day: {hookah.name}"` or `"Hookah of the day: {hookah.name} ({promoText})"`. |
| `price` | number | Unit price from the live menu. Custom = hookah price + addon prices (`ADDON_PRICES`: `hasLED` 30, `hasColoredWater` 10, `hasAlcohol` 40, `hasFruits` 20). |
| `quantity` | number | ≥ 1. A quantity of 0 or less removes the line. |
| `image` | string | **Never persisted.** |
| `comboId` | string | `mix:{mixId}`, `custom:{16 hex}` or `hotd:{16 hex}`. See [comboId](#comboid-algorithms). |
| `comboLabel` | string? | Mix: `mix.name` (without the category). Custom: `buildComboLabel(hookahName, flavourDisplayNames)`. HOTD: `truncateLabel(name)`. |
| `mixId` | string? | Curated mixes only. |
| `hookahId` | string? | Custom and HOTD. |
| `flavorIds` | string[]? | Custom only, each `{flavorDocId}:{variantType}` (variantType falls back to the build's tobaccoType). |
| `table` | string | The table id. **Not** copied to the order item. |
| `tobaccoType` | `'virginia'\|'darkblend'\|'cigarleaf'\|'mix'`? | Mix: chosen category (`virginia`, `darkblend` or `mix`). HOTD: derived from the hookah name by `getHookahTobaccoType` in `Index.tsx` (`cigar`→`cigarleaf`, `mix`, `virginia`, `darkblend`, case-insensitive, in that order), absent if none match. |
| `tobaccoStrength` | number? | Custom builder. |
| `hookah` | string? | Hookah display name. |
| `flavors` | string[]? | Custom: display names from `buildFlavorDisplayNames` (may include `"Ice (N%)"`). |
| `flavorPercentages` | map<string, number>? | Custom with ≥ 2 flavours only, keyed by the `flavorIds` entry. |
| `hasLED`, `hasColoredWater`, `hasAlcohol`, `hasFruits` | boolean? | Custom add-ons. |

Builder constraints (`Index.tsx`): hookah, tobacco type and at least one flavour are
required. At most 3 flavours. Tobacco type `mix` needs at least one darkblend and one
virginia flavour. Ice (`withIce`) is not a cart or order field. It only shows in the
`flavors` names and `comboLabel`, and in favourites.

Cart `total` = Σ `price × quantity`. The rules take it on trust (see open questions).

### 2.3 Order creation

`Cart.handleOrderSubmission` → `submitOrder` → `createOrderRecord`:

1. `ensureSignedIn()` (anonymous if needed).
2. Build `{ items, total, table, customerInfo: { uid: user.uid }, status: 'pending' }`.
   `items` = `cart.items.map(convertCartItemToDbItem)` (see [orders](#ordersorderid)).
   `cleanObject` then drops every `undefined` key recursively.
3. Generate a document id client-side (`doc(collection('orders'))`) and write it with one
   `setDoc` that includes `orderId: <that id>`, `createdAt: serverTimestamp()` and
   `updatedAt: serverTimestamp()`. It must be **one create**: a later update to set
   `orderId` would be denied (only admins may update).
4. Non-fatal: `addDoc notifications` = `{ type: 'new_order', title: 'New Order Received',
   message: "Order from table {table || 'Unknown'} - {total} Lei", isRead: false,
   orderId, createdAt: serverTimestamp() }`. Failures are swallowed so the order is
   never reported as failed.
5. Non-fatal, real accounts only: `recordOrderPlaced` → merge `users/{uid}` with
   `{ orderCount: increment(1), lastOrderAt: serverTimestamp() }`.
6. Not awaited, never throws: `shareWhatImSmoking(user, items)`, the nowSmoking projection below.
7. Start tracking the order (`OrderTrackingContext.addOrder`) and clear the cart.

### 2.4 nowSmoking projection

`shareWhatImSmoking` (`src/services/nowSmokingService.ts`) + `buildNowSmokingItems`
(`src/services/nowSmoking.ts`):

- Skip if the user is anonymous, if no shareable items exist, or if
  `users/{uid}.shareNowSmoking !== true`.
- Items: walk the cart in order, skip items with no `comboId`, de-duplicate by `comboId`,
  and stop at 5. Each item is `{ comboId, label: truncateLabel(comboLabel ?? name) }`.
  Only for `type == 'custom'` with `hookahId`, `tobaccoType` and non-empty `flavorIds`,
  also add `hookahId`, `tobaccoType` and `flavorIds.slice(0, 10)`. Fields are added one
  by one, never spread: no strength, percentages or add-ons are shared, and no key
  carries `undefined`.
- `set nowSmoking/{uid}` = `{ items, since: serverTimestamp() }` (full overwrite).
- Friends see it for 2 hours (`NOW_SMOKING_TTL_MS` = 7 200 000; the rule enforces the same).

### 2.5 Tracking order status

- Status values: `'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed'`.
  Customers can only create `'pending'`. Only admins change `status`
  (`updateOrderStatus` → `updateDoc {status, updatedAt: serverTimestamp()}` plus an
  `order_update` notification).
- The customer keeps a list of tracked orders locally (web: `localStorage` key
  `turboActiveOrders`) and opens **one document listener per order**
  (`subscribeToOrder`: `onSnapshot(doc('orders', id))`). A listener on the whole
  collection is denied for non-admins.
- If the listener errors (typically `permission-denied` after the uid changed), the order
  is dropped from tracking. A snapshot of a missing document is ignored.
- `completed` orders are meant to drop out 2 minutes after the tracked `timestamp`, and
  the user can dismiss any card. See the open question about the missing `timestamp` field.
- Order history (`MyOrders`, account summary): query `orders` where
  `customerInfo.uid == uid` with `orderBy('createdAt','desc')`. This needs a composite
  index (present).
- Rating: see [orders](#ordersorderid) and [ratings](#usersuidratingscomboid).

---

## 3. Menu loading

Reference: `src/services/menuService.ts`, `src/services/userMixService.ts`,
`src/services/hookahOfTheDay.ts`.

### 3.1 Read path (`getMenuData`)

1. `get menu/current`. If it exists, use it, and that is the only read. Rules make it
   public (`allow read: if true`), so it works before any auth session exists.
2. If the document is missing or the read throws, fall back to per-collection queries
   (`fetchMenuCollections('guest')`). The four core queries run in parallel and must
   succeed. Hookah of the day and community mixes degrade to nothing on error:
   - `hookahs` where `isActive == true` orderBy `price` desc (composite index `isActive ASC, price DESC`).
   - `tobaccoTypes` where `isActive == true`.
   - `flavors` where `isActive == true`.
   - `recommendedMixes` where `isActive == true` orderBy `createdAt` desc (composite index `isActive ASC, createdAt DESC`).
   - `get menu/featured` → hookah of the day.
   - `get communityMixes` (whole collection), sorted client-side by `approvedAt` desc.

### 3.2 `menu/current` snapshot contents

Written by an admin with `publishMenuSnapshot()`, which runs the same six reads in strict
mode (any failure aborts and keeps the previous snapshot). It then does a full `setDoc`
(no merge) of:

| Field | Type | Contents |
|---|---|---|
| `hookahs` | array<map> | Active hookahs in `price` desc order. Each element is the hookah document's fields plus `id` (the doc id); `createdAt`/`updatedAt` are timestamps. |
| `tobaccoTypes` | array<map> | Active tobacco types plus `id`. |
| `flavors` | array<map> | Active flavours plus `id`. |
| `recommendedMixes` | array<map> | Active mixes in `createdAt` desc order, plus `id`. |
| `hookahOfTheDay` | map, **absent** when nothing is featured | `{ hookahId: string, promoText?: string }`. Only these two keys are copied. |
| `communityMixes` | array<map> | All `communityMixes` documents plus `id`, `approvedAt` desc. Empty array when there are none. |
| `publishedAt` | timestamp | Server time of publication. |

`undefined` values are stripped before writing. Snapshots published before
`hookahOfTheDay` / `communityMixes` existed lack those keys; treat a missing key as
"none". Inactive menu items are not in the snapshot.

Every admin menu change must be followed by `publishMenuSnapshot()`. This includes
featured-hookah changes and community mix approvals and rejections. Otherwise guests
keep seeing the previous snapshot.

### 3.3 Hookah of the day

- Stored at `menu/featured` = `{ hookahId, promoText? }` (`setFeaturedHookah`, full
  `setDoc`). `promoText` = `clampPromoText`: trimmed, cut to 140 UTF-16 units, and
  **absent** when empty. Ending the promotion deletes the document.
- Readers (`getFeaturedHookah`) treat a missing doc or a non-string or empty `hookahId` as
  "none". A non-string `promoText` is ignored.
- `resolveHookahOfTheDay(hookahs, featured)`: null when there is no pointer, when the
  hookah is not in the list, or when `isActive` is false. `promoText` is trimmed and
  dropped if empty.
- Ordering it builds one cart line with `hookahOfTheDayCartItem`:
  `hash = fnv1a64("{hookah.id}|{promoText ?? ''}")`, `id: "hotd-{hash}"`,
  `comboId: "hotd:{hash}"`, `type: 'mix'`, price = hookah price. A `hotd:` combo is
  never re-orderable (`nowSmokingItemToFavorite` returns null for it).

### 3.4 Community mixes in the menu

Approved customer recipes come from `menu/current.communityMixes` (or the
`communityMixes` collection in the fallback). To order or favourite one, the client turns
it into a custom favourite with `userMixToFavorite`:
`comboId = comboIdForCustom(hookahId, tobaccoType, flavorIds)`, `label = name`,
`kind = 'custom'`. It is then resolved against the live menu like any re-order
(`resolveReorder`), so it lands on the same combo as a hand-built one.

---

## 4. Friends flow

Reference: `src/services/friendsService.ts`, `src/services/profileService.ts`,
`src/services/pokeService.ts`, `src/services/pokes.ts`,
`src/services/nowSmokingService.ts`, `src/pages/Friends.tsx`,
`src/pages/FriendProfile.tsx`, `src/contexts/PokeContext.tsx`,
`src/components/PokeButton.tsx`.

Everything here requires a real account.

### 4.1 Invite codes

- `ensureInviteCode(user)`: if `users/{uid}.inviteCode` is set, return it. Otherwise
  generate a code: 8 random bytes, each mapped to
  `'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[byte % 31]`. Then
  `set inviteCodes/{code}` = `{ uid, displayName: shortName(user.displayName), createdAt: serverTimestamp() }`,
  and merge `{ inviteCode: code }` into `users/{uid}`.
- `shortName`: `null` for a falsy name, otherwise the first 100 UTF-16 units.
- Invite URL: `{origin}/friends?code={code}`. Opening it resolves the code
  (`get inviteCodes/{code}` → `{uid, displayName ?? null}`) and sends a friend request to
  that uid.
- `rotateInviteCode`: create the new code doc, repoint `users/{uid}.inviteCode`, then
  delete the old code doc. A failed delete is logged and not fatal. Keep this order.
- `refreshInviteCodeName`: `update inviteCodes/{code}` with `{ displayName }` only. Called after a rename.

### 4.2 Email discovery (opt-in, default off)

- Document id = lower-case hex SHA-256 of the UTF-8 bytes of the email.
  - **Own entry**: `user.email.toLowerCase()`, **no trim**. It must match the rule's
    `hashing.sha256(request.auth.token.email.lower())` byte for byte.
  - **Searching someone else**: `email.trim().toLowerCase()`.
- Opt in: `set discoverable/{hash}` = `{ uid, displayName: shortName(displayName) }`
  (plain set, no merge), then merge `{ discoverableByEmail: true }` into `users/{uid}`.
- Opt out: **delete `discoverable/{hash}` first**. If that throws, stop. Only then merge
  `{ discoverableByEmail: false }`. The document's existence is what makes you findable.
  The flag is only a UI mirror.
- Search: `get discoverable/{hash}`. Any error is treated as "not found".
- Known limitation: after an email change the old hash document cannot be found or deleted.

### 4.3 Friendship request / accept / remove

- `pairId = a < b ? a + '_' + b : b + '_' + a` (`pairIdFor`; the rules use the same
  function, `friendPairId`).
- Request: `set friendships/{pairId}` =
  `{ uids: [me, other].sort(), requestedBy: me, status: 'pending', createdAt: serverTimestamp() }`.
  If both sides send at once, the second write counts as an update and is denied. The web
  then reads the doc and raises `FriendRequestConflictError` so the UI can offer Accept.
- Accept (only the non-requester, only `pending` → `accepted`):
  `update` with `{ status: 'accepted', acceptedAt: serverTimestamp() }`.
- Decline, cancel and unfriend all **delete** the document. There is no block list.
- List: `friendships` where `uids array-contains uid`. Split pending/accepted, incoming
  (`requestedBy != me`) and outgoing on the client.

### 4.4 Friend profile reads

`FriendProfile.tsx` runs these in parallel and tolerates each one failing:

| Read | Rule needed |
|---|---|
| `get profiles/{uid}` | shares a friendship (pending is enough) |
| `getDocs users/{uid}/favorites` | accepted friend |
| `getDocs users/{uid}/ratings` | accepted friend |
| `get nowSmoking/{uid}` | accepted friend **and** `since` within 2 h (or document missing) |

A `permission-denied` on profile, favourites or ratings is shown as "not friends" (it is
also what an unfriend looks like). A denied or missing nowSmoking just means "nothing to
show". The client also checks `isNowSmokingFresh(since, now)`. `Friends.tsx` reads
`nowSmoking/{uid}` once per accepted friend.

Saving a friend's favourite calls `addFavorite(myUid, fav, { keepExisting: true })`. An
existing favourite with the same comboId is kept unchanged (result `'kept'`).

### 4.5 Pokes

- Document: `users/{toUid}/pokes/{fromUid}`, one per poker, overwritten on each poke.
- Poke: `set` with **merge** `{ at: serverTimestamp() }`. Merge is required: a plain set
  would delete the recipient's `seenAt`, which puts `seenAt` in `affectedKeys` and gets
  the write denied.
- Cooldown: 10 minutes (`POKE_COOLDOWN_MS` = 600 000), enforced by the rule on
  update. The poker cannot read the doc, so the client tracks its own last poke time
  locally (web: `localStorage`, per `(uid, friendUid)`) only to show the button state.
  A denial is treated as "poked recently".
- Recipient: listener on `users/{myUid}/pokes` (web reads with
  `serverTimestamps: 'estimate'` and ignores docs whose `at` is not a timestamp yet).
  A poke is unseen when `seenAt` is missing or `seenAt < at` (`isPokeUnseen`). Mark seen:
  `update` with `{ seenAt: serverTimestamp() }` per poker. The sender's name comes from
  `profiles/{fromUid}`.

### 4.6 "Now smoking" opt-in

`users/{uid}.shareNowSmoking` (boolean). Turning it off deletes `nowSmoking/{uid}`
**first** (throw on failure), then merges `{ shareNowSmoking: false }`. Turning it on
merges `{ shareNowSmoking: true }`.

---

## 5. Collections reference

Collections with no `match` block (`products`, `sessions`, `tables`) get the default deny
for every client. `firebaseService.updateTableStatus` targets `tables` but has no callers.

### `users/{uid}`

Private account document. Id = Firebase Auth uid. Implemented in
`src/services/userService.ts`, `friendsService.ts`, `nowSmokingService.ts`.

| Field | Type | Req. | Meaning / writer |
|---|---|---|---|
| `displayName` | string \| null | opt | `upsertUserProfile` |
| `email` | string \| null | opt | `upsertUserProfile` |
| `photoURL` | string \| null | opt | `upsertUserProfile` |
| `createdAt` | timestamp | opt | Server time, written only when the doc did not exist yet ("member since"). |
| `orderCount` | integer | opt | `increment(1)` per order (display only; the account summary counts the orders themselves). |
| `lastOrderAt` | timestamp | opt | Server time on each order. |
| `inviteCode` | string | opt | Current invite code. |
| `discoverableByEmail` | boolean | opt | UI mirror of `discoverable` opt-in. |
| `shareNowSmoking` | boolean | opt | nowSmoking opt-in. |

Access: owner may read and write anything (no shape checks). Admins may read. No one
else. All web writes are `setDoc(..., { merge: true })`. Never written for anonymous users.

### `users/{uid}/favorites/{comboId}`

A customer's saved combos. Id = the combo id (`mix:{id}` or `custom:{hex}`; see
[comboId](#comboid-algorithms)). Implemented in `src/services/favoritesService.ts`.

| Field | Type | Req. | Bounds / meaning |
|---|---|---|---|
| `comboId` | string | **yes** | ≤ 100. Same as the doc id (the client sets it; the rule does not compare them). |
| `label` | string | **yes** | ≤ 200 (client applies `truncateLabel`). Display text frozen at save time. |
| `kind` | string | **yes** | `'mix'` or `'custom'` only. |
| `mixId` | string | opt | ≤ 100. Mixes. |
| `hookahId` | string | opt | ≤ 100. Custom. |
| `tobaccoType` | string | opt | ≤ 100. For a mix, the last-ordered category. |
| `flavorIds` | array | opt | ≤ 10 entries (element type not checked by rule; client writes strings `{flavorDocId}:{variantType}`). |
| `tobaccoStrength` | number | opt | |
| `flavorPercentages` | map | opt | ≤ 10 entries, keyed by `flavorIds` entry (values not type-checked by rule). |
| `withIce`, `hasLED`, `hasColoredWater`, `hasAlcohol`, `hasFruits` | boolean | opt | |
| `createdAt` | timestamp | opt | If present, server time. The web always sends it, and re-stamps it on every overwrite. |

`keys().hasOnly(...)` allows exactly the fields above. Any other key is denied. Prices are
never stored: a re-order re-prices from the live menu.

Access:
- **Read** (single or list): owner, accepted friend, or a caller with a claim on `uid`.
- **Create**: owner, valid shape, **and** in the same write `users/{uid}/counters/favorites`
  must exist afterwards with `count == (count before, or 0 if missing) + 1` and
  `changed == {this comboId}`.
- **Update**: owner, valid shape. The counter is not involved.
- **Delete**: owner or a claim holder. The counter is not required.

Must be written in a **transaction** with the counter (`addFavorite` / `removeFavorite`):
- Add: `tx.get(favorite)`, `tx.get(counter)`. If the favourite exists: return `'kept'`
  when `keepExisting`, else `tx.set(favorite, payload)` → `'updated'`. If it is new and
  `count >= 20`: throw `FavoritesFullError` without writing. Otherwise
  `tx.set(favorite, payload)` and `tx.set(counter, { count: count + 1, changed: comboId })`.
  `payload` = favourite with `undefined` keys removed, `label` truncated,
  `createdAt: serverTimestamp()`. It is a full set (no merge).
- Remove: if the favourite exists, `tx.delete(favorite)`, and if the counter exists with
  `count > 0`, `tx.set(counter, { count: count - 1, changed: comboId })`.
- Guest-transfer deletes (`deleteGuestFavorite`) are plain deletes with no counter change.

Queries: `getDocs(users/{uid}/favorites)` with no filter or order.

### `users/{uid}/counters/favorites`

Single document: the favourites count. It is a separate document because the owner can
freely rewrite `users/{uid}`, so a count stored there could be reset. Implemented in
`favoritesService.ts`.

| Field | Type | Req. | Bounds |
|---|---|---|---|
| `count` | **integer** | yes | `0..20` on update; create is effectively `1`. |
| `changed` | string | yes | 1..100. The comboId of the favourite added or removed in the same write. |

Only these two keys are allowed.

Access: owner reads. **Create**: owner, valid shape, and the favourite named by `changed`
did not exist before this write and exists after it. **Update**: owner, valid shape, and
either (`count` = old + 1, ≤ 20, and the named favourite was added in this write) or
(`count` = old − 1, ≥ 0, and the named favourite was removed in this write). **Delete**:
never. A missing counter reads as 0 (`getFavoriteCount`).

### `users/{uid}/ratings/{comboId}`

Friend-readable copy of a customer's combo ratings. Id = comboId. Implemented in
`src/services/ratingsService.ts`.

| Field | Type | Req. | Bounds |
|---|---|---|---|
| `comboId` | string | yes | ≤ 100 |
| `label` | string | yes | ≤ 200 (`truncateLabel`) |
| `score` | **integer** | yes | 1..5 |
| `ratedAt` | timestamp | opt | If present, server time. The web always sends it. |

Only these four keys are allowed.

Access: **read** by owner, accepted friend, or claim holder. **Create/update**: owner with
valid shape. **Delete**: owner or claim holder.

Batch: `rateOrder(uid, orderId, comboId, label, score)` writes one `writeBatch`:
`update orders/{orderId}` with `{ rating: score, ratedAt: serverTimestamp() }` **and**
`set users/{uid}/ratings/{comboId}` with `{ comboId, label: truncateLabel(label), score, ratedAt: serverTimestamp() }`.
The order copy is the verified one (the rules prove ownership). The ratings copy is what
friends see. `MyOrders.tsx` rates the order's **first item**: `comboId = items[0].comboId`,
`label = items[0].comboLabel ?? items[0].name ?? 'Your order'`. Orders whose first item
has no `comboId` cannot be rated.

Queries: `getDocs(users/{uid}/ratings)`.

### `users/{toUid}/pokes/{fromUid}`

Id = the poker's uid. Implemented in `src/services/pokeService.ts`, `src/services/pokes.ts`.

| Field | Type | Writer | Meaning |
|---|---|---|---|
| `at` | timestamp (server time) | poker | Time of the latest poke. |
| `seenAt` | timestamp (server time) | recipient | When the recipient last saw it. |

Access:
- **Read**: recipient only (`toUid`).
- **Create**: real account, caller is `fromUid`, `fromUid != toUid`, accepted friend of
  `toUid`, keys only `['at']`, `at` = server time.
- **Update**: either
  (a) poker: real account, accepted friend, changed keys ⊆ `['at']`, `at` = server time,
  **and stored `at` < now − 10 minutes**; or
  (b) recipient: changed keys ⊆ `['seenAt']`, `seenAt` = server time.
- **Delete**: recipient only, so a poker cannot reset their cooldown by deleting.

Queries: listener on `users/{uid}/pokes` (whole subcollection).

### `orders/{orderId}`

Id = auto id generated by the client before writing, and also stored as `orderId`.
Implemented in `src/services/orderService.ts`, `src/services/firebaseService.ts`,
`src/services/orderItem.ts`.

| Field | Type | Req. by rule | Meaning |
|---|---|---|---|
| `orderId` | string | no | = doc id. |
| `items` | array<map> | no | See item table. |
| `total` | number | **yes**, ≥ 0 | Σ price × quantity (Lei). |
| `table` | string | no | Table id from `turbo-table` (e.g. `/table-5`). |
| `customerInfo` | map | no | Web writes `{ uid }`. `uid`, if present, must equal the caller at create. Older bundles wrote `customerInfo.id` and no uid; `DatabaseOrder` also declares optional `id`, `name`, `phone`. |
| `status` | string | **yes**, `== 'pending'` at create | Later set by admins to `confirmed`, `preparing`, `ready`, `completed`. |
| `createdAt` | timestamp | no | Server time (web). Used for every order query. |
| `updatedAt` | timestamp | no | Server time at create and on admin updates. |
| `rating` | **integer** | — | 1..5, set by the owner. |
| `ratedAt` | timestamp | — | Server time when changed. |

Order item (`DatabaseOrderItem`, built by `convertCartItemToDbItem`, `undefined` keys dropped):
`id`, `type`, `name`, `price`, `quantity`, and optionally `comboId`, `comboLabel`,
`mixId`, `hookahId`, `flavorIds`, `hookah`, `tobaccoType`, `tobaccoStrength`, `flavors`,
`flavorPercentages`, `hasLED`, `hasColoredWater`, `hasAlcohol`, `hasFruits`. **Never
`image`** (base64 images pushed order docs toward the 1 MiB limit) and **never `table`**.
Field meanings are as in the [cart item table](#22-cart-item-shape-cartitem-client-memory-only).

Access:
- **Create**: signed in (guests included);
  `customerInfo.uid` absent or `== caller`; `status == 'pending'`; `total` is number ≥ 0.
  Nothing else is checked.
- **Read** (get, list, listen): admin, or `customerInfo.uid == caller`. Lists must filter
  on `customerInfo.uid == myUid` to pass.
- **Update**:
  - admin: anything;
  - owner rating: changed top-level keys ⊆ `['rating','ratedAt']`, `rating` integer 1..5,
    `ratedAt` (if changed) = server time;
  - claim: changed top-level keys ⊆ `['customerInfo']`, changed keys inside
    `customerInfo` ⊆ `['uid']`, new uid == caller, caller has a claim on the **old**
    `customerInfo.uid`. Use the field path `customerInfo.uid`.
- **Delete**: admin only.

Batches: rating ↔ `users/{uid}/ratings` (see above). Claim reassignment is batched in
chunks of ≤ 450.

Queries:

| Query | Where | Index |
|---|---|---|
| `getOrdersForUser` (history, account summary) | `customerInfo.uid == uid`, `orderBy createdAt desc` | composite `customerInfo.uid ASC, createdAt DESC` (present) |
| `listOwnOrderIds` (claim) | `customerInfo.uid == uid` | single-field (automatic) |
| `subscribeToOrder` (tracking) | single doc listener | — |
| Admin `subscribeToOrders` | `orderBy createdAt desc`, `limit 200` | single-field |
| Admin `getOrdersByStatus()` (no status arg in use) | `orderBy createdAt desc` | single-field |
| Admin `getOrdersByStatus(status)` / `subscribeToOrders(.., status)` (code path exists, unused) | `status ==`, `orderBy createdAt desc` | would need `status, createdAt DESC`, **not declared** |
| Admin `getOrdersByDateRange` | `createdAt >= start`, `createdAt <= end`, `orderBy createdAt asc` | single-field |

### `menu/{document}`: `menu/current` and `menu/featured`

Public read, admin write (`match /menu/{document}`). There are two documents:

- `menu/current`: the denormalised menu snapshot. Fields in [§3.2](#32-menucurrent-snapshot-contents).
- `menu/featured`: hookah of the day pointer.

| Field (`menu/featured`) | Type | Req. | Bounds |
|---|---|---|---|
| `hookahId` | string | yes | Must be non-empty for readers to use it. |
| `promoText` | string | opt | ≤ 140 UTF-16 units, trimmed, absent when empty. The bound is applied in client code only. |

Implemented in `src/services/menuService.ts`, `src/services/hookahOfTheDay.ts`.

### `hookahs/{id}`, `tobaccoTypes/{id}`, `flavors/{id}`, `recommendedMixes/{id}`

Public read, admin-only write, no shape rules. Ids are auto ids (`addDoc`). "Delete" in the
admin UI is a soft delete (`isActive: false`). Every write also sets
`updatedAt: serverTimestamp()`, and create sets `createdAt` as well. Implemented in
`src/services/menuService.ts`, types in `src/types/database.ts`.

| Collection | Fields |
|---|---|
| `hookahs` | `name` string, `price` number, `image` string, `isActive` boolean, `hasLED?` `hasColoredWater?` `hasAlcohol?` `hasFruits?` boolean, `createdAt`, `updatedAt` timestamp |
| `tobaccoTypes` | `name` string, `description` string, `type` `'virginia'\|'darkblend'\|'cigarleaf'\|'mix'`, `image` string, `strengthRange` map `{min: number, max: number}`, `isActive`, `createdAt`, `updatedAt` |
| `flavors` | `name` string, `image` string, `compatibleTobaccoTypes` array of `'virginia'\|'darkblend'\|'cigarleaf'`, `isActive`, `createdAt`, `updatedAt` |
| `recommendedMixes` | `name` string, `price` number, `category` string, `mainImage` string, `flavorImages` string[], `bgColor` string, `promoText?` string, `isActive`, `createdAt`, `updatedAt` |

Queries (fallback path and admin screen): see [§3.1](#31-read-path-getmenudata). There is
also an admin-only live listener variant (`subscribeToMenuData`) with `isActive == true`
and no ordering.

### `communityMixes/{mixId}`

The public copy of an approved `userMixes` doc, **same id**. Implemented in
`src/services/userMixService.ts`, `src/services/userMixes.ts`.

| Field | Type | Req. | Bounds |
|---|---|---|---|
| `name` | string | yes | 1..40 |
| `description` | string | opt | ≤ 140 |
| `creatorName` | string | yes | 1..100 |
| `hookahId` | string | yes | ≤ 100 |
| `tobaccoType` | string | yes | ≤ 100 |
| `flavorIds` | array<string> | yes | 1..10 entries, each a string ≤ 100 with no `\n` |
| `tobaccoStrength` | number | opt | 0..20 |
| `flavorPercentages` | map<string, number> | opt | ≤ 10 entries, values numbers |
| `withIce` | boolean | opt | |
| `approvedAt` | timestamp | yes | server time |

Only these keys are allowed. There is deliberately **no `creatorUid`**.
Access: anyone reads (no auth needed). Admin creates, updates and deletes.
Queries: `getDocs(communityMixes)`, sorted by `approvedAt` desc on the client.

### `userMixes/{mixId}`

Private customer recipe submissions. Id = auto id (`addDoc`). Implemented in
`src/services/userMixService.ts`, `src/services/userMixes.ts`, `src/components/ShareMixDialog.tsx`.

| Field | Type | Req. | Bounds / meaning |
|---|---|---|---|
| `creatorUid` | string | yes | == caller |
| `creatorName` | string | yes | ≥ 1 and **exactly equal** to `profiles/{caller}.displayName` |
| `name` | string | yes | 1..40 (client trims first) |
| `description` | string | opt | ≤ 140 (client trims and omits if empty) |
| `hookahId`, `tobaccoType` | string | yes | ≤ 100 |
| `flavorIds` | array<string> | yes | 1..10, each ≤ 100 |
| `tobaccoStrength` | number | opt | 0..20 |
| `flavorPercentages` | map<string, number> | opt | ≤ 10 |
| `withIce` | boolean | opt | |
| `status` | string | yes | `'pending'` at create. An admin sets `'approved'` or `'rejected'`. |
| `createdAt` | timestamp | yes | server time |
| `reviewedAt` | timestamp | admin | server time |

Built by `userMixFromFavorite` from a **custom** favourite (must have `hookahId`,
`tobaccoType`, non-empty `flavorIds`; add-ons are excluded). `creatorName` is read from
`profiles/{uid}`, not from the auth user. With no display name the client refuses to submit.

Access:
- **Read**: creator or admin. List queries must filter `creatorUid == myUid`.
- **Create**: real account and the shape above. The `profiles/{uid}` doc must exist,
  because the rule `get()`s it.
- **Update**: admin only. Changed keys ⊆ `['status','reviewedAt']`, status in
  `approved|rejected`, `reviewedAt` = server time.
- **Delete**: admin, or the creator while `status != 'approved'` (withdraw).

Batches (admin): approve = one `writeBatch` of `set communityMixes/{id}` (projection +
`approvedAt: serverTimestamp()`) plus `update userMixes/{id}` with
`{status:'approved', reviewedAt}`. Reject or remove = one batch of `update userMixes/{id}`
with `{status:'rejected', reviewedAt}` plus `delete communityMixes/{id}`. Then republish
`menu/current`.

Queries: `where creatorUid == uid` and `where status == 'pending'`, both sorted on the
client by `createdAt` (to avoid composite indexes).

### `redirects/{auto}`

QR landing-page analytics log. Implemented in `src/services/redirectService.ts`,
`src/pages/RedirectPage.tsx`, `src/utils/redirects.ts`.

Rule: **create by anyone, even unauthenticated** (the only such write). At most 25
top-level keys, `target` a string ≤ 100. Read: admin only. No update or delete.
The web writes whatever payload it is given plus `timestamp: serverTimestamp()`,
`userAgent`, `referrer`, `pathname`. `RedirectPage` sends `eventType`
(`'page_view'|'redirect_click'`), `target`, `source`, `sessionId`, `device` (map),
`location` (map), `bot` (boolean).

### `notifications/{auto}`

Admin feed. Implemented in `src/services/firebaseService.ts`, `src/services/orderService.ts`.

| Field | Type | Meaning |
|---|---|---|
| `type` | string | `'new_order'` (customer), `'order_update'` (admin), `'system'` |
| `title` | string | |
| `message` | string | |
| `isRead` | boolean | |
| `orderId` | string | opt |
| `createdAt` | timestamp | server time (rule does not enforce it) |

Access: **create** by admin, or by any signed-in user if `type == 'new_order'`,
`isRead == false` and keys ⊆ `['type','title','message','isRead','orderId','createdAt']`.
Read, update and delete: admin only.
Query (admin): `isRead == false` orderBy `createdAt desc` (composite
`isRead ASC, createdAt DESC`, present). If that fails, the client falls back to the
`isRead == false` filter alone and sorts on the client.

### `accountClaims/{anonUid}`

Proof-of-device for the guest claim flow ([§1](#guest--account-claim-flow)). Id = the
anonymous uid. Implemented in `src/services/accountClaimService.ts`.

| Field | Type | Writer | Bounds |
|---|---|---|---|
| `secretHash` | string | guest (create) | exactly 64 chars, matching `^[0-9a-f]+$` (lower-case SHA-256 hex) |
| `createdAt` | timestamp | guest (create) | **required**, server time |
| `claimedBy` | string | claimer (update) | == claimer uid |
| `secret` | string | claimer (update) | ≤ 200, and `sha256(secret)` lower-case hex must equal `secretHash` |

Access: **no client may get or list** (rules use `get()` internally). **Create**:
signed in, `anonUid == caller`, keys ⊆ `['secretHash','createdAt']`. Only one per uid,
because a second create is an update. **Update** (take): `claimedBy` currently
unset/empty, changed keys ⊆ `['claimedBy','secret']`, `claimedBy == caller`, hash
matches. This can happen only once. **Delete**: only by the uid in `claimedBy`. An
untaken claim can never be deleted.

### `admins/{document}`

Legacy, sealed: all reads and writes are denied. Do not use. Admin identity is the
`admin` token claim.

### `profiles/{uid}`

Public subset of an account, readable by friends. Id = uid. Implemented in
`src/services/profileService.ts`.

| Field | Type | Req. | Bounds |
|---|---|---|---|
| `displayName` | string \| null | opt | ≤ 100 |
| `photoURL` | string \| null | opt | ≤ 500 and must match `https://.*` |
| `updatedAt` | timestamp | opt | server time if present |

Only these keys are allowed. The web writes with `merge: true`. On a merge the rules check
the **whole merged document**, so any stray field already present makes every later write
fail. The web passes `user.displayName ?? null` and `user.photoURL ?? null` **without
truncating**, so a display name over 100 chars is rejected (the write is non-fatal).

Access: **read** by owner or anyone who shares a friendship (pending included).
Create/update: owner with valid shape. Delete: owner. Never written for anonymous users.

### `friendships/{pairId}`

Id = `pairIdFor(a, b)` (sorted uids joined with `_`). Implemented in `src/services/friendsService.ts`.

| Field | Type | Req. | Bounds |
|---|---|---|---|
| `uids` | array<string> | yes | exactly 2, `uids[0] < uids[1]`, neither contains `_`, caller is one of them, and doc id == `friendPairId(uids[0], uids[1])` |
| `requestedBy` | string | yes | == caller at create |
| `status` | string | yes | `'pending'` at create, `'accepted'` after accept |
| `createdAt` | timestamp | opt | server time if present |
| `acceptedAt` | timestamp | opt | server time if written |

Create keys ⊆ `['uids','requestedBy','status','createdAt']`.

Access: **read** if caller ∈ `uids`. **Create**: real account and shape. **Update**: real
account, caller ∈ `uids`, caller ≠ `requestedBy`, stored status `pending`, new status
`accepted`, changed keys ⊆ `['status','acceptedAt']`. **Delete**: either participant.
Query: `where uids array-contains uid` (automatic index).

### `nowSmoking/{uid}`

Friend-readable "currently smoking" projection of the latest order. Id = uid. Implemented
in `src/services/nowSmokingService.ts`, `src/services/nowSmoking.ts`.

| Field | Type | Req. | Bounds |
|---|---|---|---|
| `items` | array<map> | yes | 1..5 items |
| `since` | timestamp | yes | server time |

Only these two keys are allowed. Each item may contain only
`['comboId','label','hookahId','tobaccoType','flavorIds']`:

| Item field | Type | Req. | Bounds |
|---|---|---|---|
| `comboId` | string | yes | ≤ 100 |
| `label` | string | yes | ≤ 200 |
| `hookahId` | string | opt | ≤ 100 |
| `tobaccoType` | string | opt | ≤ 100 |
| `flavorIds` | array<string> | opt | ≤ 10, each a string ≤ 100 without `\n` |

Access: **read** by the owner always. A friend may read if they are an accepted friend
**and** (the doc is missing **or** `since` is a timestamp within the last 2 h). A stale
status therefore gives a friend `permission-denied`, not an empty result. Create/update:
owner, shape valid. Delete: owner. The rules do not exclude anonymous users, but the web
never writes this document for them.

### `inviteCodes/{code}`

Code → uid lookup. Id = the 8-char code ([§4.1](#41-invite-codes)). Implemented in
`src/services/friendsService.ts`.

| Field | Type | Req. | Bounds |
|---|---|---|---|
| `uid` | string | yes | == creator |
| `displayName` | string \| null | opt | ≤ 100 |
| `createdAt` | timestamp | opt | server time if present |

Access: **get** by any signed-in user. **List**: denied. **Create**: real account,
`uid == caller`, keys ⊆ `['uid','displayName','createdAt']`. **Update**: owner, changed
keys ⊆ `['displayName']`. **Delete**: owner.

### `discoverable/{emailHash}`

Email-hash → uid lookup. Id = lower-case hex SHA-256 of the caller's own lower-cased email
([§4.2](#42-email-discovery-opt-in-default-off)). Implemented in `src/services/friendsService.ts`.

| Field | Type | Req. | Bounds |
|---|---|---|---|
| `uid` | string | yes | == caller |
| `displayName` | string \| null | opt | ≤ 100 |

Only these two keys are allowed. There is no timestamp.

Access: **get** by any signed-in user. **List**: denied. **Create/update**: token has a
non-empty `email` claim, doc id == `sha256(token.email.lower())` hex, `uid == caller`,
shape valid. **Delete**: the uid stored in the doc.

---

## 6. Composite indexes

From `firestore.indexes.json`:

| Collection | Fields | Used by |
|---|---|---|
| `hookahs` | `isActive ASC, price DESC` | `getHookahs` (menu fallback, admin) |
| `notifications` | `isRead ASC, createdAt DESC` | `getUnreadNotifications` (admin) |
| `orders` | `customerInfo.uid ASC, createdAt DESC` | `getOrdersForUser` |
| `recommendedMixes` | `isActive ASC, createdAt DESC` | `getRecommendedMixes` |

Every other query uses automatic single-field indexes. The web code avoids `where` +
`orderBy` pairs elsewhere on purpose, sorting on the client instead (`userMixService.ts`,
`friendsService.listFriendships`, `accountClaimService.listOwnOrderIds`). Native clients
should run the same queries, or they may need indexes that do not exist.

---

## 7. Cross-platform pitfalls

### comboId algorithms

Source: `src/services/comboId.ts`.

- `comboIdForMix(mixId)` = `"mix:" + mixId`.
- `comboIdForCustom(hookahId, tobaccoType, flavorIds)` =
  `"custom:" + fnv1a64(hookahId + "|" + tobaccoType + "|" + sortedFlavorIds.join(","))`.
  `sortedFlavorIds` uses JavaScript's default `Array.prototype.sort()`, which compares
  **UTF-16 code units**. Uppercase sorts before lowercase, and digits before both.
  - Kotlin `String.compareTo` is UTF-16 code-unit order (matches). Swift `String <` is
    **not**. Compare `Array(s.utf16)` lexicographically.
  - Strength, percentages, ice and add-ons are **not** part of the id.
- `fnv1a64(input)`: offset `0xcbf29ce484222325`, prime `0x100000001b3`, 64-bit wrapping
  multiply. For each **UTF-16 code unit** `c` (not each byte, not each code point):
  `hash ^= c; hash = hash * prime mod 2^64`. Output is lower-case hex, zero-padded to 16
  digits. An emoji therefore counts as two units. Iterate `s.utf16` in Swift and `s[i].code`
  (`Char`) in Kotlin. Use unsigned 64-bit arithmetic.
- Hookah of the day: `hotd:` + `fnv1a64(hookahId + "|" + (promoText ?? ""))`.
- `flavorIds` entries are `{flavorDocId}:{variantType}`. They are never the UI's
  `variantId` (`{id}` or `{id}-{type}`), whose shape changes when an admin edits a flavour.

### Strings and lengths

- `truncateLabel`: if `label.length` (UTF-16 units) ≤ 200 keep it, else first **199 UTF-16
  units** + `"…"` (U+2026, one unit) = 200 units. It can split a surrogate pair at the cut.
  Reproduce it exactly (vectors cover it). Applies to favourite labels, rating labels,
  nowSmoking labels and HOTD `comboLabel`.
- `shortName` (display names on `inviteCodes` / `discoverable`): first 100 UTF-16 units,
  no ellipsis, `null` when empty.
- `clampPromoText`: JS `trim()`, then first 140 UTF-16 units, no ellipsis, `undefined`
  (absent) when empty.
- User mix `name` / `description`: trimmed, then 40 / 140 UTF-16 units (`validateUserMixInput`).
- The rules' `size()` bounds (100, 140, 200, 500, …) are what is actually enforced. See the
  open question about how rules measure length.
- Email hash: own entry `toLowerCase()` **without** trim. Search `trim()` then `toLowerCase()`.
  SHA-256 over UTF-8, lower-case hex.
- Claim secret: 64 lower-case hex chars. `secretHash` = SHA-256 of those 64 ASCII
  characters, lower-case hex. Upper-case hex is a claim no one can ever take.
- `pairId`: sort with the same ordering as the rules' string `<`. Firebase uids are ASCII,
  where byte, UTF-16 and code-point order agree. `uids` must be stored already sorted.

### Server timestamps

Must be `serverTimestamp()` (any client-side date is denied): favourites `createdAt`,
ratings `ratedAt`, orders `ratedAt`, profiles `updatedAt`, friendships `createdAt` /
`acceptedAt`, pokes `at` / `seenAt`, nowSmoking `since`, userMixes `createdAt` /
`reviewedAt`, communityMixes `approvedAt`, accountClaims `createdAt` (required),
inviteCodes `createdAt`. The web also uses server time (not rule-enforced) for orders
`createdAt` / `updatedAt`, notifications `createdAt`, users `createdAt` / `lastOrderAt`,
menu `publishedAt` / `createdAt` / `updatedAt`, redirects `timestamp`.

When reading your own fresh writes from the local cache, these fields can be `null` until
the server confirms them. The web reads pokes with `serverTimestamps: 'estimate'` and
ignores pokes without a timestamp.

### Integer vs double

The rules require `is int` for: `users/{uid}/counters/favorites.count`,
`users/{uid}/ratings/*.score`, `orders/*.rating`. The JS SDK sends whole numbers as
`integerValue`. A native client must send `Int` / `Int64` / `Long`, **never** `Double`
(`5.0` is denied). Fields checked with `is number` (`total`, `tobaccoStrength`,
`flavorPercentages` values) accept either. When reading, accept both integer and double
for every numeric field (`price`, `total`, `tobaccoStrength`, percentages, `count`),
because which one is stored depends on the writer.

### Absent, not null

- `hasOnly` allow-lists reject **any** extra key: favourites, counter, ratings, pokes
  (create), notifications (customer), accountClaims, profiles, friendships (create),
  nowSmoking (and each item), userMixes, communityMixes, inviteCodes, discoverable.
  Do not add debug or analytics fields. Do not let a serializer add an `id` or a type
  discriminator.
- Optional fields guarded by `!('x' in d) || d.x is <type>` reject `null`. That covers
  favourites (`mixId`, `hookahId`, `tobaccoType`, `flavorIds`, `flavorPercentages`,
  `tobaccoStrength`, the booleans), nowSmoking items, userMixes / communityMixes
  (`description`, `tobaccoStrength`, `flavorPercentages`, `withIce`). Omit the key instead.
  Do not rely on a platform object serializer to omit nil/null optionals. Build these
  maps explicitly.
- `null` **is** allowed for `profiles.displayName` / `photoURL`, `inviteCodes.displayName`
  and `discoverable.displayName`. The web writes `null` there.
- `menu/featured.promoText` and `menu/current.hookahOfTheDay` are absent when unset.
- Order docs: the web strips undefined keys. Mirror that, so an item has no `mixId: null`.

### Write mechanics that matter

- Favourite add/remove: **transaction** with the counter, never a separate write.
- Order: a **single create** that includes `orderId`.
- Rating: **batch** of order update plus ratings set.
- Order reassignment: update the field path `customerInfo.uid`, never the whole map.
- Pokes: **merge** set of `{at}`.
- Profiles: merge, and only the three allowed keys may ever exist on the doc.
- Discoverable / nowSmoking opt-out: delete the lookup doc **before** clearing the flag.
- Invite rotation: create new → repoint user → delete old.
- `users/{uid}.orderCount`: `FieldValue.increment(1)`.

### Ids and local keys

- Order ids are client-generated auto ids, also stored in `orderId`.
- Combo ids contain `:` and are used directly as document ids (legal in Firestore).
- Web local storage keys: `turbo-table`, `turboActiveOrders`, `turbo-guest-claim`. These
  are not shared with native, so a claim started on the web cannot be finished in an app.

---

## 8. Contract vectors

`contract/vectors/*.json`, generated by `tests/contractVectors.test.ts` (regenerate with
`UPDATE_VECTORS=1 npx vitest run tests/contractVectors.test.ts`). Each file is
`{ description, functions: { <name>: [{ name, input, expected }] } }`. Dates are epoch
milliseconds in fields ending `Ms`. `undefined` is an absent key, and `null` is null.

| File | Functions covered (source) |
|---|---|
| `constants.json` | `MAX_LABEL_LENGTH` (200), `MAX_FAVORITES` (20), `POKE_COOLDOWN_MS` (600000), `NOW_SMOKING_MAX_ITEMS` (5), `NOW_SMOKING_TTL_MS` (7200000), `MAX_PROMO_TEXT_LENGTH` (140), `ADDON_PRICES` |
| `comboId.json` | `fnv1a64`, `comboIdForMix`, `comboIdForCustom`, `truncateLabel` (`src/services/comboId.ts`) |
| `favoriteLimit.json` | `hasRoomForFavorite`, `formatFavoriteCount`, `describeFavoritesThatDidNotFit`, `favoritesThatFit` (`src/services/favoriteLimit.ts`) |
| `pokes.json` | `pokeCooldownRemainingMs`, `isPokeUnseen` (`src/services/pokes.ts`) |
| `nowSmoking.json` | `buildNowSmokingItems`, `isNowSmokingFresh`, `nowSmokingItemToFavorite` (`src/services/nowSmoking.ts`) |
| `comboDisplay.json` | `buildFlavorDisplayNames`, `buildComboLabel` (`src/services/comboDisplay.ts`) |
| `reorder.json` | `resolveReorder` (`src/services/reorderService.ts`); custom item ids appear as `"custom-<now>"` |
| `hookahOfTheDay.json` | `clampPromoText`, `resolveHookahOfTheDay`, `hookahOfTheDayCartItem` (`src/services/hookahOfTheDay.ts`) |
| `misc.json` | `isValidTableId` (`tableValidation.ts`), `pairIdFor` (`friendsService.ts`), `convertCartItemToDbItem` (`orderItem.ts`) |
| `fixtures.json` | Shared menu fixture used by `reorder.json` and `hookahOfTheDay.json` (no functions) |

Not covered by vectors, so port from source: the claim secret/hash procedure, the email
hash normalisation, `generateCode` (random), `userMixFromFavorite` / `userMixToFavorite` /
`toCommunityMix` / `validateUserMixInput` (`userMixes.ts`), and `getHookahTobaccoType` (`Index.tsx`).

---

## Open questions / inconsistencies

1. **Orders have no `timestamp` field.** `DatabaseOrder.timestamp` is declared, and
   `submitOrder` has the comment "timestamp will be set by serverTimestamp() in
   createOrderRecord", but `createOrderRecord` writes only `createdAt`/`updatedAt`. Every
   reader runs `safeConvertTimestamp(data.timestamp)`, which returns "now" for a missing
   value. As a result `OrderTrackingContext` resets each tracked order's `timestamp` to
   the snapshot time, so the "drop `completed` orders after 2 minutes" filter never fires
   from a snapshot (the user must dismiss them), and `getOrdersInRange` reports read time
   as `timestamp`. Native clients should use `createdAt`. Which behaviour is intended is
   undecided.
2. **The order create rule checks almost nothing.** Only `status == 'pending'`, `total`
   number ≥ 0, and `customerInfo.uid` (absent or caller) are checked. `items`, `table`,
   prices and extra keys are unchecked, and `total` is client-computed and trusted. A
   missing `customerInfo.uid` is still accepted (legacy tolerance, "tighten once the old
   bundle is out of circulation"). Such an order is then unreadable by its creator, so
   native clients must always send `customerInfo.uid`.
3. **Table id is loosely defined.** `Index.tsx` stores `location.pathname` (e.g.
   `/table-5`, leading slash included). `TableContext` stores the raw `?table=` value
   under the same key. `isValidTableId` only checks for the substrings `table-` or `bar`
   (so `/barbecue` passes). `Cart.tsx` writes `localStorage['turbo-table'] || ''` without
   re-validating. No canonical table-id format is defined for native QR parsing.
4. **One rating per order.** The rules allow a single `rating` per order document, so
   `MyOrders.tsx` files the rating under the first item's `comboId`. Other items on a
   multi-item order cannot be rated.
5. **Length units in rules vs client.** Client bounds count UTF-16 code units
   (`String.length`). The sources do not establish whether the rules' `string.size()`
   counts UTF-16 units, code points or bytes. For text outside the BMP or non-ASCII text,
   a client-truncated 200-unit label might not match the rule's 200 bound. `truncateLabel`
   can also split a surrogate pair. The vectors pin the client behaviour only.
6. **Favourite shape rule is looser than the others.** `favoriteShapeOk` checks
   `flavorIds` only as a list of ≤ 10 entries (element types not checked) and
   `flavorPercentages` as a map of ≤ 10 entries (value types not checked). This differs
   from `stringListOk` / `numberMapOk` used for nowSmoking and mixes. The `comboId` field
   is not compared with the document id on favourites or ratings.
7. **Guest permissions in rules are broader than client behaviour.** The rules let
   anonymous users write `users/{uid}`, `profiles/{uid}` and `nowSmoking/{uid}`. Only
   client code stops it. The `profiles` comment says "Anonymous guests never get a
   profiles document", but the rule does not enforce this.
8. **`firestore.indexes.json` may not match production.** `userMixService.ts` says so
   explicitly ("firestore.indexes.json is out of sync with production"). Also,
   `getOrdersByStatus(status)` and `subscribeToOrders(..., status)` would need
   `orders(status ASC, createdAt DESC)`, which is not declared. No caller passes a status today.
9. **`profiles` display names are not truncated.** `friendsService.shortName` caps names
   at 100 for `inviteCodes`/`discoverable`, but `upsertPublicProfile` writes
   `user.displayName` as is. A name over 100 chars makes the (non-fatal) profile write
   fail, and with no profile name the user cannot submit community mixes.
10. **`redirects` payload may carry `undefined`.** `RedirectPage.sendAnalytics('redirect_click')`
    passes `location: undefined` (and `source` may be undefined). `src/lib/firebase.ts`
    does not enable `ignoreUndefinedProperties`, so the JS SDK would likely reject that
    write. The error is swallowed. The payload also sets `timestamp: Date.now()`, which
    `logRedirectEvent` overwrites with `serverTimestamp()`. This has not been verified
    against a running app.
11. **Menu snapshot size.** `menu/current` copies whole menu documents, including `image`
    / `mainImage` / `flavorImages`. `orderItem.ts` says menu images are base64 data URIs of
    about 900 KB. If that holds for the stored menu, the snapshot is at risk of the 1 MiB
    document limit, and `publishMenuSnapshot` would fail. The current image sizes are not
    known from the sources.
12. **Email lower-casing.** The own-entry hash uses JS `toLowerCase()`, and the rule uses
    rules `lower()`. For non-ASCII emails the two may differ. The sources do not establish
    this. Native clients must also choose a lower-casing that matches both (locale-
    independent).
13. **Admin status values are not constrained.** `updateOrderStatus` casts any string, and
    the admin update rule allows any value. Readers should handle unknown statuses (the
    web shows "Unknown").
14. **Order item `table` declared but never written.** `DatabaseOrderItem.table` exists in
    the type, but `convertCartItemToDbItem` omits it on purpose (the vectors pin this).
    `customerInfo` in the type also lists `id`, `name`, `phone`, which current clients do
    not write.
