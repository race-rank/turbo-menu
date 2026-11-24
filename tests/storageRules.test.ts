import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const PATH = 'menu/flavors/abc.webp';
const bytes = (size = 16) => new Uint8Array(size);
const webp = { contentType: 'image/webp' };
// Every test uses its own path: the emulator does not reliably clear files
// between tests, and a leftover file would deny an upload for the wrong reason.

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-storage',
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => { await testEnv.clearStorage(); });

const admin = () => testEnv.authenticatedContext('admin-uid', { admin: true }).storage();
const customer = () => testEnv.authenticatedContext('alice-uid').storage();
const guest = () => testEnv.unauthenticatedContext().storage();

const seed = (path = PATH) => testEnv.withSecurityRulesDisabled(async (ctx) => {
  await uploadBytes(ref(ctx.storage(), path), bytes(), webp);
});

describe('storage.rules: menu pictures', () => {
  test('anyone, signed in or not, can read a menu picture', async () => {
    await seed();
    await assertSucceeds(getBytes(ref(guest(), PATH)));
    await assertSucceeds(getBytes(ref(customer(), PATH)));
  });

  test('an admin can upload a picture', async () => {
    await assertSucceeds(uploadBytes(ref(admin(), 'menu/flavors/fresh.webp'), bytes(), webp));
  });

  test('a customer or a guest cannot upload', async () => {
    await assertFails(uploadBytes(ref(customer(), 'menu/flavors/by-customer.webp'), bytes(), webp));
    await assertFails(uploadBytes(ref(guest(), 'menu/flavors/by-guest.webp'), bytes(), webp));
  });

  test('admin: false is not an admin', async () => {
    const notAdmin = testEnv.authenticatedContext('bob-uid', { admin: false }).storage();
    await assertFails(uploadBytes(ref(notAdmin, 'menu/flavors/by-not-admin.webp'), bytes(), webp));
  });

  test('an admin cannot upload something that is not an image', async () => {
    await assertFails(uploadBytes(ref(admin(), 'menu/flavors/x.html'), bytes(), { contentType: 'text/html' }));
  });

  test('an admin cannot upload 2MB or more', async () => {
    await assertFails(uploadBytes(ref(admin(), 'menu/flavors/big.webp'), bytes(2 * 1024 * 1024), webp));
    await assertSucceeds(uploadBytes(ref(admin(), 'menu/flavors/just-under.webp'), bytes(2 * 1024 * 1024 - 1), webp));
  });

  test('nobody can overwrite or delete a picture from a client', async () => {
    await seed();
    await assertFails(uploadBytes(ref(admin(), PATH), bytes(8), webp));
    await assertFails(deleteObject(ref(admin(), PATH)));
  });

  test('nothing outside menu/ is readable or writable', async () => {
    await seed('private/secret.webp');
    await assertFails(getBytes(ref(guest(), 'private/secret.webp')));
    await assertFails(getBytes(ref(admin(), 'private/secret.webp')));
    await assertFails(uploadBytes(ref(admin(), 'avatars/x.webp'), bytes(), webp));
  });
});
