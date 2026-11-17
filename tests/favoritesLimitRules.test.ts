import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc, doc, getDoc, runTransaction, setDoc, writeBatch, type Firestore,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const CAROL = 'carol-uid';
const GUEST = 'guest-uid';

const favPath = (uid: string, comboId: string) => `users/${uid}/favorites/${comboId}`;
const counterPath = (uid: string) => `users/${uid}/counters/favorites`;
const fav = (comboId: string) => ({ comboId, label: `Combo ${comboId}`, kind: 'mix' });

beforeAll(async () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  if (!rules.trim()) throw new Error('firestore.rules is empty');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-favourites-limit',
    firestore: { rules },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

const alice = () => testEnv.authenticatedContext(ALICE, { email: 'alice@example.com' }).firestore();
const bob = () => testEnv.authenticatedContext(BOB, { email: 'bob@example.com' }).firestore();
const carol = () => testEnv.authenticatedContext(CAROL, { email: 'carol@example.com' }).firestore();

/** `count` favourites mix:0..mix:{count-1}, plus a matching counter unless told not to. */
const seed = async (uid: string, count: number, withCounter = true) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (let i = 0; i < count; i += 1) {
      await setDoc(doc(db, favPath(uid, `mix:${i}`)), fav(`mix:${i}`));
    }
    if (withCounter) await setDoc(doc(db, counterPath(uid)), { count, changed: '' });
  });
};

const add = (db: Firestore, uid: string, comboId: string, count: number) => {
  const batch = writeBatch(db);
  batch.set(doc(db, favPath(uid, comboId)), fav(comboId));
  batch.set(doc(db, counterPath(uid)), { count, changed: comboId });
  return batch.commit();
};

const remove = (db: Firestore, uid: string, comboId: string, count: number) => {
  const batch = writeBatch(db);
  batch.delete(doc(db, favPath(uid, comboId)));
  batch.set(doc(db, counterPath(uid)), { count, changed: comboId });
  return batch.commit();
};

describe('creating favourites', () => {
  test('the first favourite creates the counter at 1', async () => {
    await assertSucceeds(add(alice(), ALICE, 'mix:new', 1));
  });

  test('the 20th favourite is accepted', async () => {
    await seed(ALICE, 19);
    await assertSucceeds(add(alice(), ALICE, 'mix:new', 20));
  });

  test('the 21st favourite is refused', async () => {
    await seed(ALICE, 20);
    await assertFails(add(alice(), ALICE, 'mix:new', 21));
  });

  test('a favourite created without moving the counter is refused', async () => {
    await seed(ALICE, 3);
    await assertFails(setDoc(doc(alice(), favPath(ALICE, 'mix:new')), fav('mix:new')));
  });

  test('a first favourite without creating the counter is refused', async () => {
    await assertFails(setDoc(doc(alice(), favPath(ALICE, 'mix:new')), fav('mix:new')));
  });

  test('the counter cannot skip ahead', async () => {
    await seed(ALICE, 3);
    await assertFails(add(alice(), ALICE, 'mix:new', 5));
  });

  test('a new counter must start at 1', async () => {
    await assertFails(add(alice(), ALICE, 'mix:new', 0));
    await assertFails(add(alice(), ALICE, 'mix:new', 2));
  });

  test('the same transaction the app runs is accepted', async () => {
    await seed(ALICE, 3);
    const db = alice();
    await assertSucceeds(runTransaction(db, async (tx) => {
      const favRef = doc(db, favPath(ALICE, 'mix:new'));
      const counterRef = doc(db, counterPath(ALICE));
      await tx.get(favRef);
      const counter = await tx.get(counterRef);
      tx.set(favRef, fav('mix:new'));
      tx.set(counterRef, { count: (counter.data()?.count ?? 0) + 1, changed: 'mix:new' });
    }));
  });
});

describe('overwriting and deleting favourites', () => {
  test('overwriting an existing favourite needs no counter change', async () => {
    await seed(ALICE, 3);
    await assertSucceeds(setDoc(doc(alice(), favPath(ALICE, 'mix:0')), {
      ...fav('mix:0'), tobaccoType: 'darkblend',
    }));
  });

  test('a favourite can always be deleted, counter or not', async () => {
    await seed(ALICE, 3);
    await assertSucceeds(deleteDoc(doc(alice(), favPath(ALICE, 'mix:0'))));
    await seed(BOB, 2, false);
    await assertSucceeds(deleteDoc(doc(bob(), favPath(BOB, 'mix:0'))));
  });

  test('deleting with the matching decrement is accepted', async () => {
    await seed(ALICE, 3);
    await assertSucceeds(remove(alice(), ALICE, 'mix:0', 2));
  });

  test('a customer over the limit can remove but not add', async () => {
    await seed(ALICE, 23);
    await assertFails(add(alice(), ALICE, 'mix:new', 24));
    await assertSucceeds(remove(alice(), ALICE, 'mix:0', 22));
    await assertFails(add(alice(), ALICE, 'mix:new', 23));
  });

  test('back under the limit, adding works again', async () => {
    await seed(ALICE, 20);
    await assertSucceeds(remove(alice(), ALICE, 'mix:0', 19));
    await assertSucceeds(add(alice(), ALICE, 'mix:new', 20));
  });
});

describe('the counter itself', () => {
  // Before the backfill runs, a customer can have favourites and no counter.
  // Creating one at 1 with no favourite behind it would buy them 19 extra slots.
  test('cannot be created without a favourite appearing', async () => {
    await seed(ALICE, 20, false);
    await assertFails(setDoc(doc(alice(), counterPath(ALICE)), { count: 1, changed: 'mix:0' }));
    await assertFails(setDoc(doc(alice(), counterPath(ALICE)), { count: 1, changed: 'mix:new' }));
  });

  test('cannot go up without a favourite appearing', async () => {
    await seed(ALICE, 3);
    await assertFails(setDoc(doc(alice(), counterPath(ALICE)), { count: 4, changed: 'mix:new' }));
  });

  test('cannot go up by naming a favourite that already existed', async () => {
    await seed(ALICE, 3);
    const db = alice();
    const batch = writeBatch(db);
    batch.set(doc(db, favPath(ALICE, 'mix:0')), fav('mix:0'));
    batch.set(doc(db, counterPath(ALICE)), { count: 4, changed: 'mix:0' });
    await assertFails(batch.commit());
  });

  test('cannot go down without a favourite disappearing', async () => {
    await seed(ALICE, 3);
    await assertFails(setDoc(doc(alice(), counterPath(ALICE)), { count: 2, changed: 'mix:0' }));
  });

  test('cannot be set to an arbitrary value', async () => {
    await seed(ALICE, 3);
    await assertFails(setDoc(doc(alice(), counterPath(ALICE)), { count: 0, changed: 'mix:0' }));
  });

  test('cannot carry extra fields', async () => {
    const db = alice();
    const batch = writeBatch(db);
    batch.set(doc(db, favPath(ALICE, 'mix:new')), fav('mix:new'));
    batch.set(doc(db, counterPath(ALICE)), { count: 1, changed: 'mix:new', junk: true });
    await assertFails(batch.commit());
  });

  test('cannot be deleted', async () => {
    await seed(ALICE, 3);
    await assertFails(deleteDoc(doc(alice(), counterPath(ALICE))));
  });

  test('is readable by its owner only', async () => {
    await seed(ALICE, 3);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const pairId = [ALICE, BOB].sort().join('_');
      await setDoc(doc(ctx.firestore(), 'friendships', pairId), {
        uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
      });
    });
    await assertSucceeds(getDoc(doc(alice(), counterPath(ALICE))));
    await assertFails(getDoc(doc(bob(), counterPath(ALICE))));
    await assertFails(getDoc(doc(carol(), counterPath(ALICE))));
  });

  test('cannot be written for someone else', async () => {
    await assertFails(add(bob(), ALICE, 'mix:new', 1));
  });
});

describe('guest transfer', () => {
  beforeEach(async () => {
    await seed(GUEST, 2);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'accountClaims', GUEST), {
        secretHash: 'a'.repeat(64), claimedBy: ALICE,
      });
    });
  });

  test('the claimer deletes guest copies without touching the guest counter', async () => {
    await assertSucceeds(deleteDoc(doc(alice(), favPath(GUEST, 'mix:0'))));
  });

  test('the claimer cannot write the guest counter', async () => {
    await assertFails(setDoc(doc(alice(), counterPath(GUEST)), { count: 0, changed: 'mix:0' }));
  });

  test('copies into a full account are refused', async () => {
    await seed(ALICE, 20);
    await assertFails(add(alice(), ALICE, 'mix:copied', 21));
  });
});
