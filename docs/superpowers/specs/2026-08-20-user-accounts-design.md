# User Accounts — Slice 1: Identity and Order History

**Date:** 2026-08-20
**Status:** Approved, ready for implementation planning

## Context

The app is a QR-code hookah menu: a guest scans a table code, builds a hookah, and
orders. There is no concept of a user. The requested end state is an account system
with order history, friends, and special offers, to improve retention.

That request spans four independent subsystems. This spec covers **slice 1 only**:
identity and order history. Friends and special offers are deliberately excluded and
will each get their own spec, because both are meaningless without identity and their
requirements are not yet defined.

### Starting conditions

- **No Firebase Auth anywhere.** No `firebase/auth` import exists.
- **Admin login is a client-side bcrypt compare** against a world-readable `admins`
  collection, so every admin password hash is currently public.
- **Firestore rules are `allow read, write: if true`** for all documents via a
  `match /{document=**}` wildcard, expiring 31 Dec 2026.
- **`customerInfo.id` is a fresh random string per order** (`Cart.tsx`), so there is
  no stable identity. Existing orders cannot be attributed to any account.
- **`subscribeToOrders` streams every order in the database to every guest**, because
  `OrderTrackingContext` uses it to track a single order. This is a live privacy leak.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Slice scope | Auth + order history + rules lockdown | Identity is a hard dependency of friends and offers |
| Sign-in methods | Google + email/password | Google is near-frictionless on a phone; email covers everyone else |
| Guest identity | Firebase **anonymous auth**, upgraded via `linkWithCredential` | Retroactively converts prior orders into history on signup; lets rules require auth on every order |
| Admin auth | Migrate to Firebase Auth with an `{admin: true}` custom claim | Rules cannot recognise the current bcrypt admin; also removes the public hash exposure |

## Architecture

### Auth layer

`src/lib/firebase.ts` exports `auth` alongside `firestore`.

Split into two units so neither grows unbounded:

- **`src/services/authService.ts`** — Firebase calls only: `signInWithGoogle`,
  `signUpWithEmail`, `signInWithEmail`, `resetPassword`, `linkAnonymousToGoogle`,
  `linkAnonymousToEmail`, `logout`.
- **`src/contexts/AuthContext.tsx`** — provider and state only: `user`, `isAnonymous`,
  `isAdmin`, `loading`. Replaces the existing admin-only context.

Bootstrap: subscribe with `onAuthStateChanged`; when no user is present, call
`signInAnonymously()`. `isAdmin` is read from `getIdTokenResult()` custom claims, never
from a Firestore document.

### Data model

**`users/{uid}`** — created only when an anonymous account is upgraded to a real one.
Anonymous visitors get no document, so the collection does not accumulate one row per
passer-by.

```
{ displayName, email, photoURL, createdAt, orderCount, lastOrderAt }
```

**Orders** gain `customerInfo.uid`, set at submit time from `auth.currentUser.uid`. The
random `customer-xxxx` id is removed. Pre-existing orders retain their random ids and
belong to no one; they are not backfilled.

**Order history** is a query against the flat `orders` collection:

```
where('customerInfo.uid', '==', uid), orderBy('createdAt', 'desc')
```

This requires one composite index. History is deliberately **not** denormalized into a
`users/{uid}/orders` subcollection: unlike the menu (read constantly, written rarely),
history is written once and read occasionally, so duplication would add a sync failure
mode for no gain.

### Decisions an implementer would otherwise have to guess

- **Email verification is not required to order.** Blocking on a verification email at a
  bar table would defeat the point. `sendEmailVerification` is called on signup, but
  nothing gates on it in this slice.
- **Password reset** lives on the email/password sign-in form as a "Forgot password?"
  link calling `resetPassword`. No separate route.
- **`orderCount` and `lastOrderAt`** are updated by the client on successful order
  submit, in the same call site that writes the order. Rules permit it because a user
  may write their own `users/{uid}` document. They are display counters, not a source
  of truth; the orders collection remains authoritative.

### Known limitation: upgrading into an existing account

If an anonymous user signs up with a Google account or email that **already exists**,
`linkWithCredential` fails with `auth/credential-already-in-use`. This happens whenever
someone already has an account and returns on a second device.

Behaviour for this slice: sign the user in to the existing account, discard the
anonymous one, and tell them plainly that guest orders from this device could not be
merged.

Merging would mean reassigning order documents from the anonymous uid to the real one.
Rules allow order updates only by an admin, so a correct merge needs a server-side
function with a service account. That is out of scope here and should be revisited if
it turns out to happen often.

### Order tracking

`subscribeToOrders` (all orders) becomes admin-only. A new `subscribeToOrder(orderId, cb)`
single-document listener serves guests, and `OrderTrackingContext` switches to it. This
closes the existing leak and is a prerequisite for restricted read rules — a query for
all orders would be rejected outright once rules are enforced.

### My Orders page

Route `/my-orders`, lazy-loaded to stay consistent with the existing code-splitting.
Shows date, item summary, total and status per order.

Anonymous users see their own orders with a persistent **"Sign up to keep your history"**
prompt. This is the retention mechanism, and it only works because of the anonymous
upgrade path.

### Admin migration

- `AdminLogin` becomes Firebase email/password sign-in.
- `AdminGuard` checks the `isAdmin` claim.
- `scripts/grant-admin.mjs` grants the claim, run locally with a service account.
  **The service account is never committed** and must be gitignored.
- `validateAdminCredentials`, the `admins` collection, and the `bcryptjs` dependency
  are all deleted.

### Security rules

`firestore.rules` and `firebase.json` are committed to the repo and deployed with
`firebase deploy --only firestore:rules`.

```
// isSignedIn() is true for anonymous users too - request.auth is non-null for them.
// This is load-bearing: it is what lets guests create and track orders under rules
// that never allow a fully unauthenticated write.
function isAdmin()    { return request.auth != null && request.auth.token.admin == true; }
function isSignedIn() { return request.auth != null; }

match /users/{uid}   { allow read, write: if isSignedIn() && request.auth.uid == uid;
                       allow read: if isAdmin(); }
match /orders/{id}   { allow create: if isSignedIn()
                         && request.resource.data.customerInfo.uid == request.auth.uid;
                       allow read:   if isAdmin()
                         || (isSignedIn() && resource.data.customerInfo.uid == request.auth.uid);
                       allow update, delete: if isAdmin(); }
// One block each - rules have no comma-separated match paths:
// menu, hookahs, tobaccoTypes, flavors, recommendedMixes
match /menu/{d}      { allow read: if true; allow write: if isAdmin(); }
match /redirects/{d} { allow create: if true; allow read: if isAdmin(); }
match /notifications/{d} { allow read, write: if isAdmin(); }
match /admins/{d}    { allow read, write: if false; }
```

The `match /{document=**}` wildcard and its 31 Dec 2026 expiry are removed.

## Testing

The repository has no test framework. Rules are the highest-value surface to cover,
because a mistake there silently exposes every user's order history, so this slice adds
`@firebase/rules-unit-testing` running against the Firestore emulator.

Rules tests must cover, at minimum:

- A signed-in user can read their own order and cannot read another user's order.
- An anonymous user can create an order carrying their own uid, and cannot create one
  carrying a different uid.
- A non-admin cannot write to any menu collection.
- An admin can read all orders and write menu collections.
- Nobody can read `admins`.

## Rollout

Order matters, and getting it wrong breaks ordering for every customer:

1. Deploy the application code that writes `customerInfo.uid`.
2. Grant the admin custom claim and confirm admin sign-in works.
3. Only then deploy the tightened rules.

At cutover, any order placed before step 1 has no `uid` and therefore loses live status
tracking, since the guest's listener can no longer read it. The blast radius is limited
to orders in flight during the deploy; deploying outside service hours avoids it entirely.

## Out of scope

- **Friends** — separate spec.
- **Special offers** — separate spec.
- Backfilling historical orders to accounts. Not possible: the pre-existing
  `customer-xxxx` ids are random per order and identify nobody.
- Moving admin writes behind Vercel serverless functions. Considered and rejected for
  this slice as too large; the custom-claim approach makes rules enforceable, which is
  the actual requirement.
