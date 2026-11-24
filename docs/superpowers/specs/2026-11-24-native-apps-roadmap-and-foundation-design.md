# Native apps: roadmap and foundation

Decided 2026-11-24. turbo-menu grows from a website into three clients on one
database: the existing web app, a native iOS app (Swift) and a native Android
app (Kotlin). The apps come first; the web is aligned with them afterwards,
feature by feature.

## Decisions

- **Two separate native apps**, not a shared-code framework.
- **One production database** (`turbo-menu-30079`) for web, iOS and Android:
  the same accounts, menu, orders, friends and favourites everywhere.
- **A staging project** (`turbo-menu-staging`, Firestore in `eur3` like
  production) for development and device testing. Customers never touch it.
- **One repo.** `ios/`, `android/` and `functions/` live beside the web app, so
  rules, server code and clients change in one PR.
- **Firebase moves to the Blaze plan.** Cloud Functions need it, and both push
  notifications and prizes need a server: a push needs a secret key that cannot
  ship inside an app, and a prize decided on the phone can be rigged.
- **The first store release contains every stage below.**
- **Admin stays web-only.**
- Not building: table reservations, coal-change requests.

## Roadmap

Each stage gets its own spec and plan.

1. **Foundation** (this document).
2. **Parity apps.** Everything the web does for customers: table QR scan, menu,
   mix builder, cart, orders and order status, account and sign-in, favourites,
   ratings, friends, pokes, now smoking, community mixes, hookah of the day.
   iOS adds Sign in with Apple, which Apple requires beside Google sign-in.
3. **Push notifications.** Pokes, friend requests and acceptances, hookah of
   the day posted, rate-your-session an hour after ordering.
4. **Profiles.** Profile pictures, a richer friends list, finding friends by
   name.
5. **Call waiter.** A button at the table; staff are notified.
6. **Rewards.** Badges, referral reward, birthday reward, then the prize wheel,
   contests and mini-games. All outcomes are decided by Cloud Functions.

## Foundation

Nothing in this stage changes what customers see.

### Technology

| Part | Choice |
|---|---|
| iOS | Swift, SwiftUI, iOS 17+, Firebase iOS SDK via Swift Package Manager, in `ios/` |
| Android | Kotlin, Jetpack Compose, minSdk 26 (Android 8), Firebase Android SDK, in `android/` |
| Server | Cloud Functions (2nd gen, TypeScript, region `europe-west1`), in `functions/` |
| Look | The web's dark theme, from one shared token file (`contract/design-tokens.json`), with native controls |

### The shared contract

Three clients write the same documents, so they must agree exactly.

- **`docs/contract/data-model.md`** describes every collection: path, fields,
  types, and who may read and write, derived from `firestore.rules`. The rules
  remain the only security boundary; the apps get no access the web lacks.
- **`contract/vectors/*.json`** hold inputs and expected outputs for logic that
  must match on every platform:
  - combo ids (`comboId.ts`, including the FNV-1a 64-bit hash) and the
    hookah-of-the-day id
  - label truncation
  - cart item construction and pricing (`orderItem.ts`, `addons.ts`)
  - the favourites limit (`favoriteLimit.ts`)
  - poke cooldown (`pokes.ts`) and now-smoking expiry (`nowSmoking.ts`)
  - re-order resolution against a menu (`reorderService.ts`)
  - friendship pair ids and table-id validation
- The web's Vitest suite, the iOS test target and the Android test task each
  load the same vector files. A platform that disagrees fails its own tests.
- Vectors are generated once from the current TypeScript implementation, which
  is the reference, then committed. Changing behaviour means changing a vector,
  which every platform's tests then enforce.

### Staging and deploy targets

- `.firebaserc` names two targets: `production` and `staging`.
- `npm run rules:deploy:staging` deploys rules and indexes to staging.
  `npm run rules:deploy:production` deploys rules only.
- `firestore.indexes.json` now holds all four production indexes. Three had
  been created by hand in the console and were missing from the file, which
  made an index deploy dangerous.
- `scripts/copy-menu-to-staging.mjs` copies the menu collections (`hookahs`,
  `tobaccoTypes`, `flavors`, `recommendedMixes`, `menu`) from production to
  staging. It never copies users, orders or anything personal. It needs the
  service-account key, so the owner runs it.
- Each app has a staging build and a production build with separate Firebase
  config files and bundle ids, so both can be installed on one phone.

### Menu snapshot

Guests are meant to load the menu in one read from `menu/current`. In
production that document is missing, so every visit falls back to dozens of
reads. This stage finds out why publishing never produced it and fixes it. The
apps read the snapshot only and keep the fallback for resilience.

### Skeleton apps

Each app builds, launches, signs in anonymously against staging, and shows the
menu read from the snapshot. That proves the toolchain, the Firebase wiring and
the contract tests end to end before stage 2 fills in the screens.

### Continuous checks

GitHub Actions on every PR: web tests and build; `functions/` tests; iOS build
and tests on a macOS runner; Android build and tests.

### Testing

- Web: the existing suite plus vector tests.
- iOS and Android: vector tests plus a launch smoke test.
- Functions: emulator tests.
- Rules: unchanged in this stage.

## Owner tasks

- Enable Email/Password, Google and Anonymous sign-in on staging.
- Move both Firebase projects to Blaze before stage 3, and set a budget alert.
- Before store builds: Apple Developer and Google Play accounts, and the final
  app name and bundle ids. Placeholders (`ro.turbomenu.app`, with `.staging`
  for staging builds) are used until then.

## Risks

- **Store review.** Both stores restrict tobacco-related apps. The owner has
  experience here and will handle naming and presentation; an 18+ gate and
  in-app account deletion are built in stage 2 regardless.
- **Prizes.** Free tobacco as a prize may be restricted by promotion law; prize
  types stay configurable in admin so they can be changed without a release.
- **Three clients, one database.** A client that writes a wrong shape is
  refused by the rules; a client that computes a wrong id is not. The vectors
  exist for that second case.
