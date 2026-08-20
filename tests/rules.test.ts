import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const GUEST = 'guest-uid';

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
    await setDoc(doc(db, 'redirects/seeded'), { target: 'google-reviews' });
    await setDoc(doc(db, 'notifications/one'), { message: 'new order' });
  });
});

const alice = () => testEnv.authenticatedContext(ALICE).firestore();
const bob = () => testEnv.authenticatedContext(BOB).firestore();
const admin = () => testEnv.authenticatedContext('admin-uid', { admin: true }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();
// authenticatedContext defaults sign_in_provider to 'custom'; guests order
// anonymously, so model that explicitly rather than letting 'custom' stand in.
const guest = () => testEnv.authenticatedContext(GUEST, {
  firebase: { sign_in_provider: 'anonymous', identities: {} },
}).firestore();

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

  test('an anonymous guest creates and reads back their own order', async () => {
    await assertSucceeds(setDoc(doc(guest(), 'orders/guest-one'), {
      total: 50, status: 'pending', customerInfo: { uid: GUEST },
    }));
    await assertSucceeds(getDoc(doc(guest(), 'orders/guest-one')));
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

  test('a user cannot seize another order by rewriting its uid', async () => {
    await assertFails(updateDoc(doc(bob(), 'orders/alice-order'), { 'customerInfo.uid': BOB }));
  });

  test('nobody but an admin deletes an order', async () => {
    await assertFails(deleteDoc(doc(bob(), 'orders/alice-order')));
    await assertFails(deleteDoc(doc(alice(), 'orders/alice-order'))); // not even the owner
    await assertSucceeds(deleteDoc(doc(admin(), 'orders/alice-order')));
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

describe('redirects', () => {
  test('anyone can log a redirect event', async () => {
    await assertSucceeds(addDoc(collection(anon(), 'redirects'), { target: 'google-reviews' }));
  });

  test('only an admin reads redirect analytics', async () => {
    await assertFails(getDoc(doc(alice(), 'redirects/seeded')));
    await assertSucceeds(getDoc(doc(admin(), 'redirects/seeded')));
  });
});

describe('notifications', () => {
  test('only an admin reads notifications', async () => {
    await assertFails(getDoc(doc(alice(), 'notifications/one')));
    await assertSucceeds(getDoc(doc(admin(), 'notifications/one')));
  });

  test('a user cannot write notifications', async () => {
    await assertFails(setDoc(doc(alice(), 'notifications/two'), { message: 'x' }));
  });
});

describe('admins collection', () => {
  test('nobody reads the legacy admins collection', async () => {
    await assertFails(getDoc(doc(alice(), 'admins/one')));
    await assertFails(getDoc(doc(anon(), 'admins/one')));
  });
});
