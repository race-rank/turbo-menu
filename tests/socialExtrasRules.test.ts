import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const CAROL = 'carol-uid';
const ADMIN = 'admin-uid';
const pair = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

const loadRules = (): string => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  if (!rules.trim()) throw new Error('firestore.rules is empty - refusing to test against allow-all');
  return rules;
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-extras',
    firestore: { rules: loadRules() },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), path), data); });
};

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed(`profiles/${ALICE}`, { displayName: 'Alice', photoURL: null });
  await seed(`profiles/${BOB}`, { displayName: 'Bob', photoURL: null });
  await seed(`profiles/${CAROL}`, { displayName: null, photoURL: null });
});

const alice = () => testEnv.authenticatedContext(ALICE, { email: 'alice@example.com' }).firestore();
const bob = () => testEnv.authenticatedContext(BOB, { email: 'bob@example.com' }).firestore();
const carol = () => testEnv.authenticatedContext(CAROL, { email: 'carol@example.com' }).firestore();
const admin = () => testEnv.authenticatedContext(ADMIN, { admin: true }).firestore();
const guest = (uid: string) => testEnv.authenticatedContext(uid, {
  firebase: { sign_in_provider: 'anonymous', identities: {} },
}).firestore();
const nobody = () => testEnv.unauthenticatedContext().firestore();

const befriend = (a: string, b: string, status: 'pending' | 'accepted' = 'accepted') =>
  seed(`friendships/${pair(a, b)}`, { uids: [a, b].sort(), requestedBy: a, status });

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);

// ------------------------------------------------------------------ pokes

describe('pokes', () => {
  const poke = (db = alice(), to = BOB, from = ALICE) =>
    setDoc(doc(db, 'users', to, 'pokes', from), { at: serverTimestamp() }, { merge: true });

  test('an accepted friend can poke', async () => {
    await befriend(ALICE, BOB);
    await assertSucceeds(poke());
  });

  test('a pending friend or a stranger cannot', async () => {
    await befriend(ALICE, BOB, 'pending');
    await assertFails(poke());
    await assertFails(poke(carol(), BOB, CAROL));
  });

  test('nobody can poke in someone else\'s name', async () => {
    await befriend(ALICE, BOB);
    await assertFails(poke(alice(), BOB, CAROL));
  });

  test('a guest cannot poke', async () => {
    await befriend(ALICE, BOB);
    await assertFails(setDoc(doc(guest(ALICE), 'users', BOB, 'pokes', ALICE), { at: serverTimestamp() }));
  });

  test('the time cannot be forged and nothing else can be written', async () => {
    await befriend(ALICE, BOB);
    await assertFails(setDoc(doc(alice(), 'users', BOB, 'pokes', ALICE), { at: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(doc(alice(), 'users', BOB, 'pokes', ALICE), { at: serverTimestamp(), msg: 'hi' }));
  });

  test('a second poke inside ten minutes is denied', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(3) });
    await assertFails(poke());
  });

  test('a poke after ten minutes is allowed, and keeps the seen marker', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(11), seenAt: minutesAgo(10) });
    await assertSucceeds(poke());
  });

  test('the recipient marks a poke seen, and can change nothing else', async () => {
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertSucceeds(updateDoc(doc(bob(), 'users', BOB, 'pokes', ALICE), { seenAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(bob(), 'users', BOB, 'pokes', ALICE), { at: serverTimestamp() }));
  });

  test('the poker cannot mark their own poke seen', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertFails(updateDoc(doc(alice(), 'users', BOB, 'pokes', ALICE), { seenAt: serverTimestamp() }));
  });

  test('reads: the recipient lists, the poker gets their own, others nothing', async () => {
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertSucceeds(getDocs(collection(bob(), 'users', BOB, 'pokes')));
    await assertSucceeds(getDoc(doc(alice(), 'users', BOB, 'pokes', ALICE)));
    await assertFails(getDocs(collection(alice(), 'users', BOB, 'pokes')));
    await assertFails(getDoc(doc(carol(), 'users', BOB, 'pokes', ALICE)));
  });

  test('only the recipient deletes', async () => {
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertFails(deleteDoc(doc(alice(), 'users', BOB, 'pokes', ALICE)));
    await assertSucceeds(deleteDoc(doc(bob(), 'users', BOB, 'pokes', ALICE)));
  });
});

// ------------------------------------------------------------ now smoking

describe('now smoking', () => {
  const item = { comboId: 'mix:sunset', label: 'Sunset Blend' };
  const write = (data: Record<string, unknown>, db = alice(), uid = ALICE) =>
    setDoc(doc(db, 'nowSmoking', uid), data);

  test('the owner shares mixes and custom builds', async () => {
    await assertSucceeds(write({
      items: [item, {
        comboId: 'custom:abc', label: 'Khalil · Mint',
        hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia'],
      }],
      since: serverTimestamp(),
    }));
  });

  test('an accepted friend reads it; a pending friend and a stranger do not', async () => {
    await seed(`nowSmoking/${ALICE}`, { items: [item], since: minutesAgo(1) });
    await befriend(ALICE, BOB);
    await assertSucceeds(getDoc(doc(bob(), 'nowSmoking', ALICE)));
    await assertFails(getDoc(doc(carol(), 'nowSmoking', ALICE)));
    await befriend(ALICE, CAROL, 'pending');
    await assertFails(getDoc(doc(carol(), 'nowSmoking', ALICE)));
  });

  test('a friend still cannot read the order behind it', async () => {
    await befriend(ALICE, BOB);
    await seed('orders/o1', { customerInfo: { uid: ALICE }, status: 'pending', total: 100, items: [] });
    await assertFails(getDoc(doc(bob(), 'orders', 'o1')));
  });

  test('nobody writes another customer\'s status', async () => {
    await assertFails(write({ items: [item], since: serverTimestamp() }, bob(), ALICE));
  });

  test('shape and bounds are enforced', async () => {
    await assertFails(write({ items: [item], since: Timestamp.fromMillis(0) }));
    await assertFails(write({ items: [], since: serverTimestamp() }));
    await assertFails(write({ items: Array(6).fill(item), since: serverTimestamp() }));
    await assertFails(write({ items: [{ ...item, label: 'x'.repeat(201) }], since: serverTimestamp() }));
    await assertFails(write({ items: [{ ...item, tobaccoStrength: 7 }], since: serverTimestamp() }));
    await assertFails(write({ items: [item], since: serverTimestamp(), orderId: 'o1' }));
    await assertFails(write({
      items: [{ ...item, flavorIds: Array(11).fill('a:virginia') }], since: serverTimestamp(),
    }));
  });

  test('the owner deletes it', async () => {
    await seed(`nowSmoking/${ALICE}`, { items: [item], since: minutesAgo(1) });
    await assertSucceeds(deleteDoc(doc(alice(), 'nowSmoking', ALICE)));
  });
});

// ------------------------------------------------------------ user mixes

describe('user mixes', () => {
  const submission = (overrides: Record<string, unknown> = {}) => ({
    creatorUid: ALICE, creatorName: 'Alice', name: 'Lemon Storm',
    hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
    status: 'pending', createdAt: serverTimestamp(),
    ...overrides,
  });
  const submit = (data: Record<string, unknown>, db = alice()) => setDoc(doc(db, 'userMixes', 'new'), data);

  test('a customer submits a pending mix', async () => {
    await assertSucceeds(submit(submission({
      description: 'Zesty', tobaccoStrength: 4, withIce: true,
      flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 },
    })));
  });

  test('it cannot be submitted already approved', async () => {
    await assertFails(submit(submission({ status: 'approved' })));
  });

  test('it cannot be credited to someone else', async () => {
    await assertFails(submit(submission({ creatorName: 'Bob' })));
    await assertFails(submit(submission({ creatorUid: BOB, creatorName: 'Bob' })));
  });

  test('a customer with no display name cannot submit', async () => {
    await assertFails(submit(submission({ creatorUid: CAROL, creatorName: null }), carol()));
  });

  test('a guest cannot submit', async () => {
    await assertFails(submit(submission(), guest(ALICE)));
  });

  test('bounds are enforced', async () => {
    await assertFails(submit(submission({ name: '' })));
    await assertFails(submit(submission({ name: 'x'.repeat(41) })));
    await assertFails(submit(submission({ description: 'x'.repeat(141) })));
    await assertFails(submit(submission({ flavorIds: [] })));
    await assertFails(submit(submission({ flavorIds: Array(11).fill('a:virginia') })));
    await assertFails(submit(submission({ createdAt: Timestamp.fromMillis(0) })));
    await assertFails(submit(submission({ hasLED: true })));
  });

  describe('reading', () => {
    beforeEach(async () => {
      await seed('userMixes/approved', { ...submission(), createdAt: minutesAgo(5), status: 'approved' });
      await seed('userMixes/pending', { ...submission(), createdAt: minutesAgo(5) });
    });

    test('anyone, even signed out, reads an approved mix', async () => {
      await assertSucceeds(getDoc(doc(nobody(), 'userMixes', 'approved')));
      await assertSucceeds(getDocs(query(collection(nobody(), 'userMixes'), where('status', '==', 'approved'))));
    });

    test('a pending mix is visible to its creator and admins only', async () => {
      await assertFails(getDoc(doc(bob(), 'userMixes', 'pending')));
      await assertSucceeds(getDoc(doc(alice(), 'userMixes', 'pending')));
      await assertSucceeds(getDoc(doc(admin(), 'userMixes', 'pending')));
    });

    test('only admins can list the queue', async () => {
      const pendingQuery = (db: ReturnType<typeof bob>) =>
        getDocs(query(collection(db, 'userMixes'), where('status', '==', 'pending')));
      await assertFails(pendingQuery(bob()));
      await assertSucceeds(pendingQuery(admin()));
    });

    test('a creator lists their own submissions', async () => {
      await assertSucceeds(getDocs(query(collection(alice(), 'userMixes'), where('creatorUid', '==', ALICE))));
    });
  });

  describe('reviewing', () => {
    beforeEach(async () => {
      await seed('userMixes/m1', { ...submission(), createdAt: minutesAgo(5) });
    });

    test('an admin approves or rejects', async () => {
      await assertSucceeds(updateDoc(doc(admin(), 'userMixes', 'm1'), {
        status: 'approved', reviewedAt: serverTimestamp(),
      }));
      await assertSucceeds(updateDoc(doc(admin(), 'userMixes', 'm1'), {
        status: 'rejected', reviewedAt: serverTimestamp(),
      }));
    });

    test('a creator cannot approve their own', async () => {
      await assertFails(updateDoc(doc(alice(), 'userMixes', 'm1'), {
        status: 'approved', reviewedAt: serverTimestamp(),
      }));
    });

    test('a review changes nothing but the verdict', async () => {
      await assertFails(updateDoc(doc(admin(), 'userMixes', 'm1'), {
        status: 'approved', reviewedAt: serverTimestamp(), name: 'Renamed',
      }));
      await assertFails(updateDoc(doc(admin(), 'userMixes', 'm1'), {
        status: 'featured', reviewedAt: serverTimestamp(),
      }));
    });

    test('the creator or an admin deletes; nobody else', async () => {
      await assertFails(deleteDoc(doc(bob(), 'userMixes', 'm1')));
      await assertSucceeds(deleteDoc(doc(alice(), 'userMixes', 'm1')));
      await seed('userMixes/m2', { ...submission(), createdAt: minutesAgo(5) });
      await assertSucceeds(deleteDoc(doc(admin(), 'userMixes', 'm2')));
    });
  });
});

// ------------------------------------------------------- adversarial cases
// Attacks on the rules above, beyond the happy path each block was written
// for. Each one names the hole it would be if it passed.

describe('pokes: attacks', () => {
  const poke = (db = alice(), to = BOB, from = ALICE) =>
    setDoc(doc(db, 'users', to, 'pokes', from), { at: serverTimestamp() }, { merge: true });

  test('the poker cannot reset the cooldown by deleting and re-poking', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertFails(deleteDoc(doc(alice(), 'users', BOB, 'pokes', ALICE)));
    await assertFails(poke());
  });

  test('the recipient\'s seen marker cannot carry a forged poke time or a forged seen time', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertFails(updateDoc(doc(bob(), 'users', BOB, 'pokes', ALICE), {
      seenAt: serverTimestamp(), at: Timestamp.fromMillis(0),
    }));
    await assertFails(updateDoc(doc(bob(), 'users', BOB, 'pokes', ALICE), { seenAt: Timestamp.fromMillis(0) }));
  });

  test('the recipient cannot fabricate a poke from a friend', async () => {
    await befriend(ALICE, BOB);
    await assertFails(setDoc(doc(bob(), 'users', BOB, 'pokes', ALICE), { at: serverTimestamp() }));
    await assertFails(setDoc(doc(bob(), 'users', BOB, 'pokes', ALICE), { seenAt: serverTimestamp() }));
  });

  test('nobody can poke themselves, even with a self-friendship planted', async () => {
    await seed(`friendships/${ALICE}_${ALICE}`, { uids: [ALICE, ALICE], requestedBy: ALICE, status: 'accepted' });
    await assertFails(poke(alice(), ALICE, ALICE));
  });

  test('a re-poke after the cooldown cannot add fields or wipe the seen marker', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(11), seenAt: minutesAgo(10) });
    await assertFails(setDoc(doc(alice(), 'users', BOB, 'pokes', ALICE),
      { at: serverTimestamp(), msg: 'hi' }, { merge: true }));
    // Without merge the write drops seenAt, which puts it in affectedKeys.
    await assertFails(setDoc(doc(alice(), 'users', BOB, 'pokes', ALICE), { at: serverTimestamp() }));
  });

  test('an unfriended poker cannot poke again once the cooldown passes', async () => {
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(11) });
    await assertFails(poke());
  });

  test('a stranger cannot list or delete someone\'s pokes', async () => {
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertFails(getDocs(collection(carol(), 'users', BOB, 'pokes')));
    await assertFails(deleteDoc(doc(carol(), 'users', BOB, 'pokes', ALICE)));
  });
});

describe('now smoking: attacks', () => {
  const item = { comboId: 'mix:sunset', label: 'Sunset Blend' };

  test('an accepted friend cannot write, overwrite or clear the status', async () => {
    await befriend(ALICE, BOB);
    await assertFails(setDoc(doc(bob(), 'nowSmoking', ALICE), { items: [item], since: serverTimestamp() }));
    await seed(`nowSmoking/${ALICE}`, { items: [item], since: minutesAgo(1) });
    await assertFails(setDoc(doc(bob(), 'nowSmoking', ALICE), { items: [item], since: serverTimestamp() }));
    await assertFails(deleteDoc(doc(bob(), 'nowSmoking', ALICE)));
  });

  test('five items pass; a sixth is refused even when it carries an extra field', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'nowSmoking', ALICE), {
      items: Array(5).fill(item), since: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(alice(), 'nowSmoking', ALICE), {
      items: [...Array(5).fill(item), { ...item, orderId: 'o1' }], since: serverTimestamp(),
    }));
  });

  test('the last checked slot is really checked', async () => {
    await assertFails(setDoc(doc(alice(), 'nowSmoking', ALICE), {
      items: [...Array(4).fill(item), { ...item, total: 120 }], since: serverTimestamp(),
    }));
  });

  test('an item must be a map with a comboId', async () => {
    await assertFails(setDoc(doc(alice(), 'nowSmoking', ALICE), { items: ['Sunset'], since: serverTimestamp() }));
    await assertFails(setDoc(doc(alice(), 'nowSmoking', ALICE), {
      items: [{ label: 'Sunset' }], since: serverTimestamp(),
    }));
  });

  test('nobody lists the collection, signed in or not, friend or not', async () => {
    await befriend(ALICE, BOB);
    await seed(`nowSmoking/${ALICE}`, { items: [item], since: minutesAgo(1) });
    await assertFails(getDocs(collection(carol(), 'nowSmoking')));
    await assertFails(getDocs(collection(bob(), 'nowSmoking')));
    await assertFails(getDocs(collection(nobody(), 'nowSmoking')));
  });
});

describe('user mixes: attacks', () => {
  const submission = (overrides: Record<string, unknown> = {}) => ({
    creatorUid: ALICE, creatorName: 'Alice', name: 'Lemon Storm',
    hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
    status: 'pending', createdAt: serverTimestamp(),
    ...overrides,
  });

  beforeEach(async () => {
    await seed('userMixes/m1', { ...submission(), createdAt: minutesAgo(5) });
  });

  test('a creator cannot approve by overwriting the whole document', async () => {
    await assertFails(setDoc(doc(alice(), 'userMixes', 'm1'), submission({ status: 'approved' })));
    await assertFails(setDoc(doc(alice(), 'userMixes', 'm1'), { status: 'approved' }, { merge: true }));
  });

  test('an admin review cannot rewrite the build or backdate itself', async () => {
    await assertFails(updateDoc(doc(admin(), 'userMixes', 'm1'), {
      status: 'approved', reviewedAt: serverTimestamp(), flavorIds: ['tobacco:dark'],
    }));
    await assertFails(updateDoc(doc(admin(), 'userMixes', 'm1'), {
      status: 'approved', reviewedAt: serverTimestamp(), creatorName: 'The Bar',
    }));
    await assertFails(updateDoc(doc(admin(), 'userMixes', 'm1'), {
      status: 'approved', reviewedAt: Timestamp.fromMillis(0),
    }));
  });

  test('a non-admin cannot list without a constraint that proves access', async () => {
    await seed('userMixes/a1', { ...submission(), createdAt: minutesAgo(5), status: 'approved' });
    await assertFails(getDocs(collection(bob(), 'userMixes')));
    await assertFails(getDocs(collection(nobody(), 'userMixes')));
    await assertFails(getDocs(query(collection(bob(), 'userMixes'), where('creatorUid', '==', ALICE))));
    await assertFails(getDocs(query(collection(bob(), 'userMixes'),
      where('status', 'in', ['approved', 'pending']))));
    await assertFails(getDoc(doc(nobody(), 'userMixes', 'm1')));
  });

  test('the credited name cannot be spoofed when the profile has none', async () => {
    await assertFails(setDoc(doc(carol(), 'userMixes', 'c1'), submission({ creatorUid: CAROL, creatorName: 'Carol' })));
    await assertFails(setDoc(doc(carol(), 'userMixes', 'c1'), submission({ creatorUid: CAROL, creatorName: '' })));
    // No profile document at all.
    const dave = testEnv.authenticatedContext('dave-uid', { email: 'dave@example.com' }).firestore();
    await assertFails(setDoc(doc(dave, 'userMixes', 'd1'), submission({ creatorUid: 'dave-uid', creatorName: 'Dave' })));
  });

  test('an empty profile name cannot be used to credit a mix to nobody', async () => {
    await seed(`profiles/${CAROL}`, { displayName: '', photoURL: null });
    await assertFails(setDoc(doc(carol(), 'userMixes', 'c1'), submission({ creatorUid: CAROL, creatorName: '' })));
  });
});

describe('orders stay owner-only', () => {
  beforeEach(async () => {
    await befriend(ALICE, BOB);
    await seed('orders/o1', { customerInfo: { uid: ALICE }, status: 'pending', total: 100, items: [] });
    await seed(`nowSmoking/${ALICE}`, { items: [{ comboId: 'mix:sunset', label: 'Sunset' }], since: minutesAgo(1) });
  });

  test('an accepted friend can neither get nor list another customer\'s orders', async () => {
    await assertFails(getDoc(doc(bob(), 'orders', 'o1')));
    await assertFails(getDocs(collection(bob(), 'orders')));
    await assertFails(getDocs(query(collection(bob(), 'orders'), where('customerInfo.uid', '==', ALICE))));
  });

  test('the owner still reads their own order', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'orders', 'o1')));
  });
});
