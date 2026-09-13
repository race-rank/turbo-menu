import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const CAROL = 'carol-uid';

// pairId is the two uids sorted ascending and joined with '_', so that rules
// can compute it from the two participants without a lookup.
const pair = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const ALICE_BOB = pair(ALICE, BOB);

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
    projectId: 'demo-turbo-menu-social',
    firestore: { rules: loadRules() },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'profiles', ALICE), { displayName: 'Alice', photoURL: null });
    await setDoc(doc(db, 'profiles', BOB), { displayName: 'Bob', photoURL: null });
    await setDoc(doc(db, `users/${ALICE}/favorites/mix:sunset`), {
      comboId: 'mix:sunset', label: 'Sunset Blend', kind: 'mix',
    });
    await setDoc(doc(db, `users/${ALICE}/ratings/mix:sunset`), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 5,
    });
  });
});

const alice = () => testEnv.authenticatedContext(ALICE, { email: 'alice@example.com' }).firestore();
const bob = () => testEnv.authenticatedContext(BOB, { email: 'bob@example.com' }).firestore();
const carol = () => testEnv.authenticatedContext(CAROL, { email: 'carol@example.com' }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

/** Puts an accepted or pending friendship in place, bypassing the rules. */
const seedFriendship = async (a: string, b: string, status: 'pending' | 'accepted', requestedBy = a) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'friendships', pair(a, b)), {
      uids: [a, b].sort(), requestedBy, status,
    });
  });
};

describe('profiles', () => {
  test('a user reads and writes their own profile', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'profiles', ALICE)));
    await assertSucceeds(setDoc(doc(alice(), 'profiles', ALICE), {
      displayName: 'Alice A', photoURL: null,
    }));
  });

  test('a stranger cannot read a profile', async () => {
    await assertFails(getDoc(doc(carol(), 'profiles', ALICE)));
  });

  test('a user cannot write someone else profile', async () => {
    await assertFails(setDoc(doc(bob(), 'profiles', ALICE), { displayName: 'Not Alice' }));
  });

  // Pending is enough for a profile: the recipient of a request has to see who
  // is asking, and denormalising the name onto the request would let the
  // requester supply whatever name they liked.
  test('a pending friendship is enough to read a profile', async () => {
    await seedFriendship(ALICE, BOB, 'pending');
    await assertSucceeds(getDoc(doc(bob(), 'profiles', ALICE)));
  });

  test('an accepted friendship reads a profile', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertSucceeds(getDoc(doc(bob(), 'profiles', ALICE)));
  });

  test('a profile write cannot smuggle in extra fields', async () => {
    await assertFails(setDoc(doc(alice(), 'profiles', ALICE), {
      displayName: 'Alice', photoURL: null, isAdmin: true,
    }));
  });

  test('an unauthenticated client reads nothing', async () => {
    await assertFails(getDoc(doc(anon(), 'profiles', ALICE)));
  });

  // All of these were accepted before the field constraints were added.
  test('a profile rejects an oversized display name', async () => {
    await assertFails(setDoc(doc(alice(), 'profiles', ALICE), {
      displayName: 'A'.repeat(700_000), photoURL: null,
    }));
  });

  test('a profile rejects a mistyped display name', async () => {
    await assertFails(setDoc(doc(alice(), 'profiles', ALICE), { displayName: 12345 }));
    await assertFails(setDoc(doc(alice(), 'profiles', ALICE), { displayName: ['a', 'b'] }));
    await assertFails(setDoc(doc(alice(), 'profiles', ALICE), { displayName: { a: 'b' } }));
  });

  test('a profile rejects a non-https photo URL', async () => {
    await assertFails(setDoc(doc(alice(), 'profiles', ALICE), {
      photoURL: 'javascript:alert(document.cookie)',
    }));
    await assertFails(setDoc(doc(alice(), 'profiles', ALICE), {
      photoURL: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    }));
  });

  // Firebase reports a missing display name as null, and profileService writes
  // that through verbatim, so null must stay legal.
  test('a profile still accepts a null display name and a real photo URL', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'profiles', ALICE), {
      displayName: null, photoURL: 'https://lh3.googleusercontent.com/a/abc123',
    }));
  });
});
