import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { beforeAll, beforeEach, afterAll, test } from 'vitest';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Resolve relative to this file, not the CWD, so the suite works from any directory.
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  // initializeTestEnvironment skips both the rules upload and its own
  // "is the emulator running?" check when the rules string is falsy, which
  // would silently run the whole suite against the emulator's allow-all default.
  if (!rules.trim()) {
    throw new Error('firestore.rules is empty - refusing to test against default allow-all rules');
  }
  // No host/port: emulators:exec exports FIRESTORE_EMULATOR_HOST, so firebase.json
  // stays the single source of truth for the port and the library can still emit
  // its actionable "wrap this in firebase emulators:exec" error.
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-test',
    firestore: { rules },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

test('emulator harness works', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(db, 'menu/current')));
});
