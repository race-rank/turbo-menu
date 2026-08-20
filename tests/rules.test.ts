import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { beforeAll, afterAll, test } from 'vitest';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'turbo-menu-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

test('emulator harness works', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(db, 'menu/current')));
});
