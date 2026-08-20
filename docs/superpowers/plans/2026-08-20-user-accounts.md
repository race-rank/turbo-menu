# User Accounts (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give guests a real identity, turn their orders into a personal order history, and lock down a Firestore database that is currently readable and writable by anyone.

**Architecture:** Every visitor is silently signed in with Firebase **anonymous auth** on first load, so orders always carry a real `uid`. Signing up calls `linkWithCredential`/`linkWithPopup`, which upgrades that same uid in place — so orders placed as a guest become the new account's history retroactively. Admin moves from a client-side bcrypt check to a Firebase custom claim, which is what finally makes security rules enforceable. Rules are then tightened and committed to the repo.

**Tech Stack:** Vite + React 18 + TypeScript, Firebase 12.2.1 (Auth + Firestore), Vitest + `@firebase/rules-unit-testing` against the Firestore emulator, deployed on Vercel.

**Spec:** `docs/superpowers/specs/2026-08-20-user-accounts-design.md`

---

## File Structure

**Created**
- `firestore.rules` — all security rules, version controlled
- `firebase.json` — emulator + rules deploy config
- `firestore.indexes.json` — composite index for the history query
- `src/services/authService.ts` — Firebase Auth calls only, no React
- `src/services/userService.ts` — `users/{uid}` document reads/writes
- `src/pages/MyOrders.tsx` — order history page
- `src/pages/Account.tsx` — sign up / sign in / account screen
- `src/components/auth/AuthForms.tsx` — email + Google form UI shared by Account
- `scripts/grant-admin.mjs` — one-off custom claim grant
- `tests/rules.test.ts` — security rules tests
- `tests/orderService.test.ts` — history query test against the emulator
- `vitest.config.ts`

**Modified**
- `src/lib/firebase.ts` — export `auth`
- `src/contexts/AuthContext.tsx` — full rewrite onto Firebase Auth
- `src/services/firebaseService.ts` — add `subscribeToOrder`, delete `validateAdminCredentials`
- `src/services/orderService.ts` — add `getOrdersForUser`, `subscribeToOrder`
- `src/pages/Cart.tsx:56` — attach `uid` instead of a random id
- `src/contexts/OrderTrackingContext.tsx:95` — per-order listeners
- `src/components/AdminGuard.tsx` — check the `isAdmin` claim
- `src/pages/AdminLogin.tsx` — Firebase email/password
- `src/components/NavigationSidebar.tsx` — account + my orders links
- `src/components/LoginDialog.tsx` — delete or repoint (audit in Task 11)
- `src/App.tsx` — lazy routes for `/account`, `/my-orders`
- `.gitignore` — exclude the service account key
- `package.json` — test scripts, drop `bcryptjs`

**Note on test coverage:** rules and service-layer queries are tested against the Firestore emulator, which is where a mistake would silently expose user data. The repo has no component-test setup and this plan does not add one; UI tasks carry explicit manual browser verification steps instead.

---

### Task 1: Test harness and emulator

**Files:**
- Create: `vitest.config.ts`, `firebase.json`, `firestore.rules`, `tests/rules.test.ts`
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Install dev dependencies**

```bash
npm i -D vitest@^2 @firebase/rules-unit-testing@^5 firebase-tools@^13
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 3: Create `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "firestore": { "port": 8085 },
    "singleProjectMode": false,
    "ui": { "enabled": false }
  }
}
```

- [ ] **Step 4: Create `firestore.indexes.json`**

```json
{
  "indexes": [
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "customerInfo.uid", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 5: Create `firestore.rules` reproducing today's permissive behaviour**

This is deliberately the *current* wide-open state, so Task 2's tests fail for the right reason.

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

- [ ] **Step 6: Add scripts to `package.json`**

```json
"test": "firebase emulators:exec --only firestore --project demo-turbo-menu \"vitest run\"",
"test:watch": "firebase emulators:exec --only firestore --project demo-turbo-menu \"vitest\"",
"rules:deploy": "firebase deploy --only firestore:rules,firestore:indexes --project turbo-menu-30079"
```

- [ ] **Step 7: Add the service account key to `.gitignore`**

Append:

```
# Firebase service account - never commit
serviceAccountKey.json
```

- [ ] **Step 8: Create a smoke test at `tests/rules.test.ts`**

```ts
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { beforeAll, afterAll, test } from 'vitest';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-test',
    // No host/port: firebase.json is the single source of truth, and omitting
    // them keeps the library's "emulator not running" guard active.
    firestore: { rules: loadRules() },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

test('emulator harness works', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(db, 'menu/current')));
});
```

- [ ] **Step 9: Run the test**

Run: `npm test`
Expected: PASS, 1 test. If the emulator cannot start, install the Java runtime it requires and retry.

- [ ] **Step 10: Commit**

```bash
git add vitest.config.ts firebase.json firestore.rules firestore.indexes.json tests/ package.json package-lock.json .gitignore
git commit -m "test: add firestore emulator harness and current rules"
```

---

### Task 2: Rules tests describing the target state

These tests fail against the permissive rules from Task 1. That is the point — they define what "locked down" means before any rule is written.

**Files:**
- Modify: `tests/rules.test.ts`

- [ ] **Step 1: Replace `tests/rules.test.ts` with the full suite**

```ts
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';

const loadRules = (): string => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  if (!rules.trim()) {
    throw new Error('firestore.rules is empty - refusing to test against default allow-all rules');
  }
  return rules;
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-test',
    // No host/port: firebase.json is the single source of truth, and omitting
    // them keeps the library's "emulator not running" guard active.
    firestore: { rules: loadRules() },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'orders/alice-order'), {
      total: 100, status: 'pending', customerInfo: { uid: ALICE },
    });
    await setDoc(doc(db, 'admins/one'), { username: 'root', password: 'hash' });
    await setDoc(doc(db, 'menu/current'), { hookahs: [] });
  });
});

const alice = () => testEnv.authenticatedContext(ALICE).firestore();
const bob = () => testEnv.authenticatedContext(BOB).firestore();
const admin = () => testEnv.authenticatedContext('admin-uid', { admin: true }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

describe('orders', () => {
  test('a user reads their own order', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'orders/alice-order')));
  });

  test('a user cannot read someone else order', async () => {
    await assertFails(getDoc(doc(bob(), 'orders/alice-order')));
  });

  test('an admin reads any order', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'orders/alice-order')));
  });

  test('a signed-in user creates an order carrying their own uid', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'orders/new-one'), {
      total: 50, status: 'pending', customerInfo: { uid: ALICE },
    }));
  });

  test('a user cannot create an order carrying another uid', async () => {
    await assertFails(setDoc(doc(alice(), 'orders/spoofed'), {
      total: 50, status: 'pending', customerInfo: { uid: BOB },
    }));
  });

  test('a fully unauthenticated client cannot create an order', async () => {
    await assertFails(setDoc(doc(anon(), 'orders/anon-one'), {
      total: 50, status: 'pending', customerInfo: { uid: 'whoever' },
    }));
  });

  test('only an admin changes order status', async () => {
    await assertFails(updateDoc(doc(alice(), 'orders/alice-order'), { status: 'ready' }));
    await assertSucceeds(updateDoc(doc(admin(), 'orders/alice-order'), { status: 'ready' }));
  });
});

describe('users', () => {
  test('a user writes and reads their own profile', async () => {
    await assertSucceeds(setDoc(doc(alice(), `users/${ALICE}`), { displayName: 'Alice' }));
    await assertSucceeds(getDoc(doc(alice(), `users/${ALICE}`)));
  });

  test('a user cannot read another profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${BOB}`), { displayName: 'Bob' });
    });
    await assertFails(getDoc(doc(alice(), `users/${BOB}`)));
  });
});

describe('menu', () => {
  test('anyone reads the menu', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'menu/current')));
  });

  test('a non-admin cannot write the menu', async () => {
    await assertFails(setDoc(doc(alice(), 'menu/current'), { hookahs: [] }));
  });

  test('an admin writes the menu', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'menu/current'), { hookahs: [] }));
  });
});

describe('admins collection', () => {
  test('nobody reads the legacy admins collection', async () => {
    await assertFails(getDoc(doc(alice(), 'admins/one')));
    await assertFails(getDoc(doc(anon(), 'admins/one')));
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test`
Expected: FAIL. The `assertFails` cases fail because the permissive rules allow everything. Roughly 7 failures; the `assertSucceeds` cases pass.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/rules.test.ts
git commit -m "test: define target security rules behaviour"
```

---

### Task 3: Write the real rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Replace `firestore.rules` entirely**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // isSignedIn() is TRUE for anonymous users - request.auth is non-null for them.
    // This is load-bearing: it lets guests create and track orders under rules that
    // never allow a fully unauthenticated write.
    function isSignedIn() { return request.auth != null; }
    function isAdmin()    { return request.auth != null && request.auth.token.admin == true; }
    function ownsOrder()  { return resource.data.customerInfo.uid == request.auth.uid; }

    match /users/{uid} {
      allow read, write: if isSignedIn() && request.auth.uid == uid;
      allow read: if isAdmin();
    }

    match /orders/{orderId} {
      allow create: if isSignedIn()
        && request.resource.data.customerInfo.uid == request.auth.uid;
      allow read: if isAdmin() || (isSignedIn() && ownsOrder());
      allow update, delete: if isAdmin();
    }

    match /menu/{document}             { allow read: if true; allow write: if isAdmin(); }
    match /hookahs/{document}          { allow read: if true; allow write: if isAdmin(); }
    match /tobaccoTypes/{document}     { allow read: if true; allow write: if isAdmin(); }
    match /flavors/{document}          { allow read: if true; allow write: if isAdmin(); }
    match /recommendedMixes/{document} { allow read: if true; allow write: if isAdmin(); }

    match /redirects/{document}     { allow create: if true; allow read: if isAdmin(); }
    match /notifications/{document} { allow read, write: if isAdmin(); }

    // Legacy bcrypt admin store. Sealed; removed once Task 11 lands.
    match /admins/{document} { allow read, write: if false; }
  }
}
```

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: PASS, all tests in `tests/rules.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: enforce per-user access in firestore rules"
```

**Do not deploy these rules yet.** They will break production until Task 7 ships the code that writes `customerInfo.uid`. Deployment happens in Task 12.

---

### Task 4: Expose Firebase Auth

**Files:**
- Modify: `src/lib/firebase.ts`

- [ ] **Step 1: Add the auth export**

Replace the last two lines of `src/lib/firebase.ts`:

```ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const auth = getAuth(app);

export { app, firestore, auth };
```

- [ ] **Step 2: Enable providers in the Firebase console**

At https://console.firebase.google.com/project/turbo-menu-30079/authentication/providers enable **Anonymous**, **Google**, and **Email/Password**. Add the Vercel production domain and `localhost` under Authentication → Settings → Authorized domains.

- [ ] **Step 3: Verify the build still compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: only the 4 pre-existing `firebaseService.ts` errors at lines 207-226. No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/firebase.ts
git commit -m "feat: expose firebase auth instance"
```

---

### Task 5: authService

**Files:**
- Create: `src/services/authService.ts`

- [ ] **Step 1: Write `src/services/authService.ts`**

```ts
import {
  GoogleAuthProvider,
  EmailAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  linkWithPopup,
  linkWithCredential,
  updateProfile,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export class AccountExistsError extends Error {
  constructor() {
    super('An account already exists for those credentials.');
    this.name = 'AccountExistsError';
  }
}

const isAlreadyInUse = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error &&
  (error as { code: string }).code === 'auth/credential-already-in-use';

export const ensureSignedIn = async (): Promise<User> => {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
};

/**
 * Upgrade the current anonymous user to a Google account, keeping the same uid
 * so orders placed as a guest become this account's history.
 *
 * When the Google account already exists we cannot merge - reassigning order
 * documents requires admin rights - so we sign into the existing account and
 * surface AccountExistsError for the caller to explain.
 */
export const signUpWithGoogle = async (): Promise<User> => {
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      const result = await linkWithPopup(current, new GoogleAuthProvider());
      return result.user;
    } catch (error) {
      if (!isAlreadyInUse(error)) throw error;
      const fallback = await signInWithPopup(auth, new GoogleAuthProvider());
      throw Object.assign(new AccountExistsError(), { user: fallback.user });
    }
  }
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
};

export const signUpWithEmail = async (
  email: string, password: string, displayName: string,
): Promise<User> => {
  const current = auth.currentUser;
  let user: User;

  if (current?.isAnonymous) {
    try {
      const result = await linkWithCredential(
        current, EmailAuthProvider.credential(email, password),
      );
      user = result.user;
    } catch (error) {
      if (!isAlreadyInUse(error)) throw error;
      const fallback = await signInWithEmailAndPassword(auth, email, password);
      throw Object.assign(new AccountExistsError(), { user: fallback.user });
    }
  } else {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    user = result.user;
  }

  if (displayName) await updateProfile(user, { displayName });
  // Sent, but deliberately not gated on - see the spec.
  await sendEmailVerification(user).catch(() => undefined);
  return user;
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const resetPassword = (email: string): Promise<void> =>
  sendPasswordResetEmail(auth, email);

/** Signing out returns the visitor to a fresh anonymous session, not to nothing. */
export const logout = async (): Promise<void> => {
  await signOut(auth);
  await signInAnonymously(auth);
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: only the 4 pre-existing errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/authService.ts
git commit -m "feat: add auth service with anonymous upgrade path"
```

---

### Task 6: AuthContext rewrite

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

The current context exposes `loggedIn`, `hasAdminRights`, `login`, `logout`. Consumers are `AdminGuard`, `AdminLogin`, `LoginDialog`, `NavigationSidebar`. This task changes the shape; Tasks 9-11 update the consumers.

- [ ] **Step 1: Replace `src/contexts/AuthContext.tsx` entirely**

```tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ensureSignedIn } from '@/services/authService';

interface AuthContextType {
  user: User | null;
  isAnonymous: boolean;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (next) => {
      if (!next) {
        // No session yet: create an anonymous one. onAuthStateChanged fires again.
        setIsAdmin(false);
        setUser(null);
        await ensureSignedIn().catch(() => undefined);
        setLoading(false);
        return;
      }

      // Claims live on the token, never in a readable document.
      const token = await next.getIdTokenResult().catch(() => null);
      setIsAdmin(token?.claims?.admin === true);
      setUser(next);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAnonymous: user?.isAnonymous ?? false, isAdmin, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};
```

- [ ] **Step 2: Typecheck and expect consumer breakage**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: new errors in `AdminGuard.tsx`, `AdminLogin.tsx`, `LoginDialog.tsx`, `NavigationSidebar.tsx` about missing `loggedIn`/`hasAdminRights`/`login`. Tasks 9-11 fix each.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: back AuthContext with firebase auth and anonymous bootstrap"
```

---

### Task 7: Attach the uid to orders

**Files:**
- Modify: `src/pages/Cart.tsx:56`, `src/services/orderService.ts`, `src/types/database.ts`

- [ ] **Step 1: Add `uid` to the order types**

In `src/types/database.ts`, change the `customerInfo` block (around line 7) to:

```ts
  customerInfo: {
    uid: string;
    id?: string;
    name?: string;
    phone?: string;
  };
```

In `src/services/orderService.ts`, change the `customerInfo` block inside `OrderDetails` to:

```ts
  customerInfo: {
    uid: string;
    id?: string;
    name?: string;
    table?: string;
  };
```

- [ ] **Step 2: Use the real uid in `src/pages/Cart.tsx`**

Replace lines 56-65 (`const customerId = ...` through the end of `orderData`) with:

```ts
      const user = await ensureSignedIn();
      const tableId = localStorage.getItem('turbo-table') || '';

      const orderData = {
        items: state.items,
        total: state.total,
        table: tableId,
        customerInfo: {
          uid: user.uid
        }
      };
```

Add the import at the top of `src/pages/Cart.tsx`:

```ts
import { ensureSignedIn } from '@/services/authService';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no new errors beyond the known consumer breakage from Task 6.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `http://localhost:8080/table-1`, place an order. In the Firebase console confirm the new `orders` document has `customerInfo.uid` set to a uid, and that Authentication shows an anonymous user.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Cart.tsx src/services/orderService.ts src/types/database.ts
git commit -m "feat: attach firebase uid to every order"
```

---

### Task 8: Per-order subscriptions and the history query

Closes the leak where every guest streams the venue's entire order book.

**Files:**
- Modify: `src/services/firebaseService.ts`, `src/services/orderService.ts`, `src/contexts/OrderTrackingContext.tsx:95`
- Create: `tests/orderService.test.ts`

- [ ] **Step 1: Write the failing test at `tests/orderService.test.ts`**

```ts
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, test } from 'vitest';

let testEnv: RulesTestEnvironment;
const ALICE = 'alice-uid';

const loadRules = (): string => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  if (!rules.trim()) {
    throw new Error('firestore.rules is empty - refusing to test against default allow-all rules');
  }
  return rules;
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-history',
    firestore: { rules: loadRules() },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'orders/a1'), { total: 10, customerInfo: { uid: ALICE } });
    await setDoc(doc(db, 'orders/b1'), { total: 20, customerInfo: { uid: 'bob-uid' } });
  });
});

test('a uid-filtered history query is permitted', async () => {
  const db = testEnv.authenticatedContext(ALICE).firestore();
  await assertSucceeds(
    getDocs(query(collection(db, 'orders'), where('customerInfo.uid', '==', ALICE))),
  );
});

test('an unfiltered read of all orders is rejected', async () => {
  const db = testEnv.authenticatedContext(ALICE).firestore();
  await assertFails(getDocs(collection(db, 'orders')));
});
```

- [ ] **Step 2: Run it**

Run: `npm test`
Expected: PASS. This documents *why* `subscribeToOrders` must not be used by guests — an unfiltered read is now rejected outright.

- [ ] **Step 3: Add `subscribeToOrder` to `src/services/firebaseService.ts`**

Append:

```ts
/**
 * Watch a single order. Guests must use this rather than subscribeToOrders,
 * which reads the whole collection and is rejected by security rules.
 */
export const subscribeToOrder = (
  orderId: string,
  callback: (order: DatabaseOrder | null) => void,
) => {
  return onSnapshot(doc(firestore, COLLECTIONS.ORDERS, orderId), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const data = snapshot.data();
    callback({
      ...data,
      timestamp: safeConvertTimestamp(data.timestamp),
      createdAt: safeConvertTimestamp(data.createdAt),
      updatedAt: safeConvertTimestamp(data.updatedAt),
    } as DatabaseOrder);
  });
};
```

- [ ] **Step 4: Add `getOrdersForUser` to `src/services/orderService.ts`**

Append, adding `collection`, `getDocs`, `query`, `where`, `orderBy` to the `firebase/firestore`
imports, `firestore` from `@/lib/firebase`, and `safeConvertTimestamp` from `./firebaseService`:

```ts
export const getOrdersForUser = async (uid: string): Promise<OrderDetails[]> => {
  const ordersQuery = query(
    collection(firestore, 'orders'),
    where('customerInfo.uid', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snapshot = await getDocs(ordersQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      ...data,
      orderId: data.orderId ?? docSnap.id,
      // Without this the value stays a Firestore Timestamp and MyOrders
      // renders "Invalid Date".
      createdAt: safeConvertTimestamp(data.createdAt),
    } as OrderDetails;
  });
};
```

- [ ] **Step 5: Switch `OrderTrackingContext` to per-order listeners**

In `src/contexts/OrderTrackingContext.tsx`, change the import on line 3 to:

```ts
import { subscribeToOrder } from '@/services/firebaseService';
```

Replace the effect beginning at line 92 (`useEffect(() => { if (activeOrders.length === 0) return;`) with:

```tsx
  useEffect(() => {
    if (activeOrders.length === 0) return;

    // One listener per tracked order. A collection-wide listener would leak
    // every customer's order and is rejected by security rules.
    const unsubscribes = activeOrders.map((tracked) =>
      subscribeToOrder(tracked.orderId, (updated) => {
        if (!updated) return;
        setActiveOrders((prev) =>
          prev
            .map((order) =>
              order.orderId === updated.orderId
                ? {
                    orderId: updated.orderId,
                    status: updated.status,
                    timestamp: safeToEpochTime(updated.timestamp),
                    items: updated.items as CartItem[],
                    total: updated.total,
                    customerInfo: updated.customerInfo,
                  }
                : order,
            )
            .filter((order) => {
              if (order.status === 'completed') {
                return Date.now() - order.timestamp <= 2 * 60 * 1000;
              }
              return true;
            }),
        );
      }),
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [activeOrders.map((o) => o.orderId).join(',')]);
```

- [ ] **Step 6: Typecheck and verify**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Then `npm run dev`, place an order at `/table-1`, and confirm the tracker still updates when an admin changes the order status.

- [ ] **Step 7: Commit**

```bash
git add src/services/firebaseService.ts src/services/orderService.ts src/contexts/OrderTrackingContext.tsx tests/orderService.test.ts
git commit -m "fix: subscribe per order instead of streaming every order to guests"
```

---

### Task 9: userService and the account screen

**Files:**
- Create: `src/services/userService.ts`, `src/components/auth/AuthForms.tsx`, `src/pages/Account.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/services/userService.ts`**

```ts
import { doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';

export interface UserProfile {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/** Written only for real accounts; anonymous visitors get no document. */
export const upsertUserProfile = async (user: User): Promise<void> => {
  if (user.isAnonymous) return;
  await setDoc(
    doc(firestore, 'users', user.uid),
    {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  return snapshot.exists() ? (snapshot.data() as UserProfile) : null;
};

/** Display counters only. The orders collection stays authoritative. */
export const recordOrderPlaced = async (user: User): Promise<void> => {
  if (user.isAnonymous) return;
  await setDoc(
    doc(firestore, 'users', user.uid),
    { orderCount: increment(1), lastOrderAt: serverTimestamp() },
    { merge: true },
  );
};
```

- [ ] **Step 2: Create `src/components/auth/AuthForms.tsx`**

```tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  signUpWithGoogle, signUpWithEmail, signInWithEmail, resetPassword, AccountExistsError,
} from '@/services/authService';
import { upsertUserProfile } from '@/services/userService';

type Mode = 'signup' | 'signin';

export const AuthForms: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleExisting = (error: unknown): boolean => {
    if (!(error instanceof AccountExistsError)) return false;
    toast({
      title: 'Signed in to your existing account',
      description: 'Orders placed as a guest on this device could not be moved over.',
    });
    onDone();
    return true;
  };

  const runGoogle = async () => {
    setBusy(true);
    try {
      const user = await signUpWithGoogle();
      await upsertUserProfile(user);
      toast({ title: 'Welcome!', description: 'Your order history is saved to this account.' });
      onDone();
    } catch (error) {
      if (!handleExisting(error)) {
        toast({ title: 'Google sign-in failed', description: String(error), variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  const runEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = mode === 'signup'
        ? await signUpWithEmail(email, password, displayName)
        : await signInWithEmail(email, password);
      await upsertUserProfile(user);
      toast({ title: mode === 'signup' ? 'Account created' : 'Welcome back' });
      onDone();
    } catch (error) {
      if (!handleExisting(error)) {
        toast({ title: 'Could not continue', description: String(error), variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button onClick={runGoogle} disabled={busy} className="w-full">
        Continue with Google
      </Button>

      <div className="text-center text-xs text-turbo-muted">or</div>

      <form onSubmit={runEmail} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={6} value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <div className="flex justify-between text-xs">
        <button type="button" className="text-turbo-muted underline"
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
          {mode === 'signup' ? 'I already have an account' : 'Create an account'}
        </button>
        <button type="button" className="text-turbo-muted underline"
          onClick={async () => {
            if (!email) {
              toast({ title: 'Enter your email first', variant: 'destructive' });
              return;
            }
            await resetPassword(email);
            toast({ title: 'Reset email sent' });
          }}>
          Forgot password?
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Create `src/pages/Account.tsx`**

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForms } from '@/components/auth/AuthForms';
import { logout } from '@/services/authService';

const Account: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <p className="text-turbo-muted">Loading…</p>
    </div>;
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <Card className="w-full max-w-md mx-auto bg-turbo-card border-border">
        <CardContent className="p-8">
          {isAnonymous || !user ? (
            <>
              <h1 className="text-2xl font-bold mb-2 text-center">Create your account</h1>
              <p className="text-sm text-turbo-muted mb-6 text-center">
                Keep your order history and get offers. Orders you already placed on this
                device come with you.
              </p>
              <AuthForms onDone={() => navigate('/my-orders')} />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2 text-center">
                {user.displayName || user.email}
              </h1>
              <p className="text-sm text-turbo-muted mb-6 text-center">{user.email}</p>
              <Button className="w-full mb-3" onClick={() => navigate('/my-orders')}>
                My orders
              </Button>
              <Button variant="outline" className="w-full"
                onClick={async () => { await logout(); navigate('/'); }}>
                Sign out
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Account;
```

- [ ] **Step 4: Add the lazy route in `src/App.tsx`**

Add alongside the other `lazy()` declarations:

```tsx
const Account = lazy(() => import("./pages/Account"));
```

And inside `<Routes>`, above the catch-all:

```tsx
                      <Route path="/account" element={<Account />} />
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open `http://localhost:8080/account`, create an account with email/password. Confirm in the Firebase console that Authentication shows the user is no longer anonymous **and the uid is unchanged**, and that a `users/{uid}` document now exists.

- [ ] **Step 6: Commit**

```bash
git add src/services/userService.ts src/components/auth/AuthForms.tsx src/pages/Account.tsx src/App.tsx
git commit -m "feat: add account screen with google and email signup"
```

---

### Task 10: My Orders page

**Files:**
- Create: `src/pages/MyOrders.tsx`
- Modify: `src/App.tsx`, `src/components/NavigationSidebar.tsx`, `src/pages/Cart.tsx`

- [ ] **Step 1: Create `src/pages/MyOrders.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { getOrdersForUser } from '@/services/orderService';
import type { OrderDetails } from '@/services/orderService';

const MyOrders: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    getOrdersForUser(user.uid)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setBusy(false));
  }, [user, loading]);

  return (
    <div className="min-h-screen px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold mb-6">My orders</h1>

      {isAnonymous && (
        <Card className="bg-turbo-card border-primary mb-6">
          <CardContent className="p-4">
            <p className="text-sm mb-3">
              You're browsing as a guest. Create an account to keep this history on any device.
            </p>
            <Button className="w-full" onClick={() => navigate('/account')}>
              Sign up to keep your history
            </Button>
          </CardContent>
        </Card>
      )}

      {busy && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!busy && orders.length === 0 && (
        <p className="text-turbo-muted">No orders yet.</p>
      )}

      <div className="space-y-3">
        {orders.map((order) => (
          <Card key={order.orderId} className="bg-turbo-card border-border">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-turbo-muted">
                  {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-muted">{order.status}</span>
              </div>
              <p className="text-sm mb-2">
                {order.items.map((item) => item.name).join(', ')}
              </p>
              <p className="text-lg font-bold text-amber-400">{order.total} Lei</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default MyOrders;
```

- [ ] **Step 2: Add the lazy route in `src/App.tsx`**

```tsx
const MyOrders = lazy(() => import("./pages/MyOrders"));
```

```tsx
                      <Route path="/my-orders" element={<MyOrders />} />
```

- [ ] **Step 3: Record the counter on order submit**

In `src/pages/Cart.tsx`, immediately after `const result = await submitOrder(orderData);` add:

```ts
      await recordOrderPlaced(user).catch(() => undefined);
```

And add the import:

```ts
import { recordOrderPlaced } from '@/services/userService';
```

- [ ] **Step 4: Link both pages from the sidebar**

In `src/components/NavigationSidebar.tsx`, add navigation entries pointing at `/my-orders` ("My orders") and `/account` ("Account"), following the existing link markup in that file.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`. As a guest place an order at `/table-1`, then open `/my-orders` and confirm the order is listed with the signup prompt above it. Sign up at `/account`, return to `/my-orders`, and confirm **the same order is still listed** — this proves the anonymous upgrade preserved the uid.

- [ ] **Step 6: Commit**

```bash
git add src/pages/MyOrders.tsx src/App.tsx src/pages/Cart.tsx src/components/NavigationSidebar.tsx
git commit -m "feat: add my orders history page"
```

---

### Task 11: Migrate admin to a custom claim

**Files:**
- Create: `scripts/grant-admin.mjs`
- Modify: `src/components/AdminGuard.tsx`, `src/pages/AdminLogin.tsx`, `src/components/LoginDialog.tsx`, `src/services/firebaseService.ts`, `package.json`

- [ ] **Step 1: Create `scripts/grant-admin.mjs`**

```js
/**
 * One-off: grant the admin custom claim.
 *
 *   node scripts/grant-admin.mjs admin@example.com
 *
 * Requires serviceAccountKey.json in the repo root, downloaded from
 * Firebase console -> Project settings -> Service accounts.
 * That file is gitignored and must never be committed.
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/grant-admin.mjs <email>');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync('serviceAccountKey.json', 'utf8'))) });

const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { admin: true });
console.log(`Granted admin to ${email} (${user.uid}).`);
console.log('They must sign out and back in for the new token to take effect.');
```

- [ ] **Step 2: Install firebase-admin as a dev dependency**

```bash
npm i -D firebase-admin@^13
```

- [ ] **Step 3: Rewrite `src/components/AdminGuard.tsx`**

```tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";

interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { isAdmin, loading } = useAuth();

  // Without this the guard redirects before the token has been read.
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <p className="text-turbo-muted">Loading…</p>
    </div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
```

- [ ] **Step 4: Rewrite the login handler in `src/pages/AdminLogin.tsx`**

Replace the `useAuth` destructure and `handleLogin` with:

```tsx
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [isAdmin, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signInWithEmail(userInput, passInput);
      toast.success('Access granted!');
      navigate('/admin', { replace: true });
    } catch {
      toast.error('Access denied - check credentials');
    } finally {
      setSubmitting(false);
    }
  };
```

Add the import:

```tsx
import { signInWithEmail } from '@/services/authService';
```

Change the username field label and `type` to `email` so browsers autofill correctly.

- [ ] **Step 5: Delete the bcrypt admin path**

In `src/services/firebaseService.ts`, delete the entire `validateAdminCredentials` function and the comment above it left from the earlier bcrypt work.

Audit `src/components/LoginDialog.tsx`: if it calls the removed `login`, either delete the component (if unreferenced — check with `grep -rn "LoginDialog" src/`) or repoint it at `/account`.

- [ ] **Step 6: Remove bcryptjs**

```bash
npm uninstall bcryptjs
```

- [ ] **Step 7: Grant the claim and verify**

Create the admin user at `/hookah-bar-admin` (or in the console), then:

```bash
node scripts/grant-admin.mjs admin@example.com
```

Run `npm run dev`, sign in at `/hookah-bar-admin`, and confirm `/admin` and `/menu-management` load.

- [ ] **Step 8: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: only the 4 pre-existing errors. All Task 6 consumer breakage is now resolved.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: move admin auth to a firebase custom claim"
```

---

### Task 12: Deploy rules and verify end to end

Order matters. Deploying rules before the code is live breaks ordering for every customer.

- [ ] **Step 1: Confirm the full suite passes**

Run: `npm test`
Expected: PASS, all tests in `tests/rules.test.ts` and `tests/orderService.test.ts`.

- [ ] **Step 2: Confirm the production build works**

Run: `npm run build`
Expected: builds with no errors. Check that `Account` and `MyOrders` appear as their own chunks, confirming they stayed lazy.

- [ ] **Step 3: Merge and deploy the application first**

Open a PR, merge to `main`, and let Vercel deploy. Confirm on production that placing an order still works and writes `customerInfo.uid`.

- [ ] **Step 4: Confirm admin sign-in works on production**

Sign in at `/hookah-bar-admin` on the deployed site and open `/admin`. If this fails, **stop** — deploying rules now would lock the admin out of their own database.

- [ ] **Step 5: Deploy the rules**

```bash
npm run rules:deploy
```

- [ ] **Step 6: Verify production behaviour**

- Place an order as a guest; it succeeds and appears in `/my-orders`.
- The admin sees the order in `/admin` and can change its status.
- In a different browser profile, `/my-orders` shows no orders.
- The browser console shows no `permission-denied` errors on the menu page.

- [ ] **Step 7: Deploy the composite index**

If `/my-orders` reports a missing index, Firestore logs a direct creation URL in the console error; the `rules:deploy` script already ships `firestore.indexes.json`, so this should be in place.

---

## Post-slice cleanup

Once this is stable in production:

- Delete the `admins` collection in the Firebase console; nothing reads it and rules seal it.
- Remove the `match /admins/{document}` block from `firestore.rules`.

## Deferred

- **Friends** — its own spec.
- **Special offers** — its own spec.
- **Merging guest orders into an existing account** — needs a server-side function with a service account, since rules permit order updates only by an admin. Revisit if `AccountExistsError` proves common.
