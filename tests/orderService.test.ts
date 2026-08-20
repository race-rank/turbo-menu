import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, test } from 'vitest';

let testEnv: RulesTestEnvironment;
const ALICE = 'alice-uid';

const loadRules = (): string => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  // initializeTestEnvironment skips BOTH the rules upload and its own emulator
  // liveness check when the rules string is falsy - a blank file would silently
  // run the whole suite against the emulator's default allow-all ruleset.
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
