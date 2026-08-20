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
