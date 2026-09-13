import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc, doc, getDoc, serverTimestamp, setDoc,
} from 'firebase/firestore';
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

describe('friendships', () => {
  const request = (uids: string[], requestedBy: string) => ({
    uids: [...uids].sort(), requestedBy, status: 'pending',
  });

  test('a user sends a friend request', async () => {
    await assertSucceeds(setDoc(
      doc(alice(), 'friendships', ALICE_BOB), request([ALICE, BOB], ALICE),
    ));
  });

  test('a user cannot create a friendship they are not part of', async () => {
    await assertFails(setDoc(
      doc(carol(), 'friendships', ALICE_BOB), request([ALICE, BOB], ALICE),
    ));
  });

  test('a user cannot send a request in someone else name', async () => {
    await assertFails(setDoc(
      doc(alice(), 'friendships', ALICE_BOB), request([ALICE, BOB], BOB),
    ));
  });

  // Verified reachable on the emulator with synthetic uids: ("A","B_C") and
  // ("A_B","C") both hash to pairId "A_B_C", letting an outsider inherit a
  // friendship they were never part of.
  test('a uid containing the pairId separator is rejected', async () => {
    await assertFails(setDoc(doc(alice(), 'friendships', 'alice-uid_b_c'), {
      uids: ['alice-uid', 'b_c'].sort(), requestedBy: ALICE, status: 'pending',
    }));
  });

  test('the document id must match the sorted uids', async () => {
    await assertFails(setDoc(
      doc(alice(), 'friendships', 'not-the-pair-id'), request([ALICE, BOB], ALICE),
    ));
  });

  test('a request cannot be created already accepted', async () => {
    await assertFails(setDoc(doc(alice(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
    }));
  });

  test('the recipient accepts', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertSucceeds(setDoc(doc(bob(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
    }));
  });

  test('the requester cannot accept their own request', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertFails(setDoc(doc(alice(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
    }));
  });

  test('accepting cannot rewrite who the friendship is between', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertFails(setDoc(doc(bob(), 'friendships', ALICE_BOB), {
      uids: [CAROL, BOB].sort(), requestedBy: ALICE, status: 'accepted',
    }));
  });

  // Two people tapping at the same table is the likely case, not an edge case.
  // The second write lands on an existing document, so it is evaluated as an
  // update, and the update rule only permits the OTHER party accepting.
  test('a simultaneous counter-request is denied rather than overwriting', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertFails(setDoc(
      doc(bob(), 'friendships', ALICE_BOB), request([ALICE, BOB], BOB),
    ));
  });

  test('either party deletes - decline, cancel and unfriend are all a delete', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertSucceeds(deleteDoc(doc(bob(), 'friendships', ALICE_BOB)));
  });

  test('a stranger cannot delete a friendship', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(deleteDoc(doc(carol(), 'friendships', ALICE_BOB)));
  });

  test('a participant reads the friendship', async () => {
    await seedFriendship(ALICE, BOB, 'pending');
    await assertSucceeds(getDoc(doc(bob(), 'friendships', ALICE_BOB)));
  });

  test('a stranger cannot read a friendship', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(getDoc(doc(carol(), 'friendships', ALICE_BOB)));
  });

  // Verified accepted before the shape was pinned: a 10KB junk field rode along
  // on an otherwise valid pending request.
  test('a friend request cannot carry unexpected fields', async () => {
    await assertFails(setDoc(doc(alice(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'pending',
      junk: 'x'.repeat(10_000),
    }));
  });

  // friendsService writes createdAt, so it has to stay legal.
  test('a friend request may carry createdAt', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'pending',
      createdAt: serverTimestamp(),
    }));
  });

  test('accepting cannot forge acceptedAt', async () => {
    await seedFriendship(ALICE, BOB, 'pending', ALICE);
    await assertFails(setDoc(doc(bob(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
      acceptedAt: new Date('2020-01-01'),
    }));
    await assertSucceeds(setDoc(doc(bob(), 'friendships', ALICE_BOB), {
      uids: [ALICE, BOB].sort(), requestedBy: ALICE, status: 'accepted',
      acceptedAt: serverTimestamp(),
    }));
  });
});

describe('favourites and ratings', () => {
  const favPath = (uid: string) => `users/${uid}/favorites/mix:sunset`;
  const ratingPath = (uid: string) => `users/${uid}/ratings/mix:sunset`;

  test('a user reads and writes their own favourites', async () => {
    await assertSucceeds(getDoc(doc(alice(), favPath(ALICE))));
    await assertSucceeds(setDoc(doc(alice(), favPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', kind: 'mix',
    }));
  });

  test('a stranger cannot read favourites', async () => {
    await assertFails(getDoc(doc(carol(), favPath(ALICE))));
  });

  test('a stranger cannot read ratings', async () => {
    await assertFails(getDoc(doc(carol(), ratingPath(ALICE))));
  });

  // The distinction that matters: a request you have not answered grants
  // nothing beyond seeing who asked.
  test('a pending friendship grants no access to favourites or ratings', async () => {
    await seedFriendship(ALICE, BOB, 'pending');
    await assertFails(getDoc(doc(bob(), favPath(ALICE))));
    await assertFails(getDoc(doc(bob(), ratingPath(ALICE))));
  });

  test('an accepted friend reads favourites and ratings', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertSucceeds(getDoc(doc(bob(), favPath(ALICE))));
    await assertSucceeds(getDoc(doc(bob(), ratingPath(ALICE))));
  });

  test('a friend cannot write to your favourites or ratings', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(setDoc(doc(bob(), favPath(ALICE)), { comboId: 'mix:sunset' }));
    await assertFails(setDoc(doc(bob(), ratingPath(ALICE)), { comboId: 'mix:sunset', score: 1 }));
  });

  // Rules evaluate the friendship document live, so revocation is immediate.
  test('unfriending revokes access at once', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertSucceeds(getDoc(doc(bob(), favPath(ALICE))));
    await deleteDoc(doc(bob(), 'friendships', ALICE_BOB));
    await assertFails(getDoc(doc(bob(), favPath(ALICE))));
  });

  test('a rating score must be an integer from 1 to 5', async () => {
    await assertFails(setDoc(doc(alice(), ratingPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 0,
    }));
    await assertFails(setDoc(doc(alice(), ratingPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 6,
    }));
    await assertFails(setDoc(doc(alice(), ratingPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 'five',
    }));
    await assertSucceeds(setDoc(doc(alice(), ratingPath(ALICE)), {
      comboId: 'mix:sunset', label: 'Sunset Blend', score: 3,
    }));
  });

  // users/{uid} is matched non-recursively, so subcollections are NOT covered
  // by it. Proving that here because the natural assumption is the opposite.
  test('friends still cannot read the private user document', async () => {
    await seedFriendship(ALICE, BOB, 'accepted');
    await assertFails(getDoc(doc(bob(), 'users', ALICE)));
  });
});
