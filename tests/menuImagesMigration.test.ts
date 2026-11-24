/**
 * The picture move, end to end, against the Firestore and Storage emulators
 * with the admin SDK - the same objects the real run uses.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error - a plain .mjs script with no type declarations.
import { moveAll, restoreAll, CACHE_CONTROL } from '../scripts/move-menu-images-to-storage.mjs';

const PROJECT = 'demo-turbo-menu-images';
const BUCKET = `${PROJECT}.firebasestorage.app`;

let app: App;
let db: Firestore;
let backupRoot: string;
const bucket = () => getStorage(app).bucket();
const silent = () => {};

const png = async (width: number, height: number, alpha = 1) => {
  const buffer = await sharp({
    create: { width, height, channels: 4, background: { r: 30, g: 200, b: 220, alpha } },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
};

const fetchImage = async (url: string) => {
  // The emulator serves the production URL shape on its own host.
  const local = url.replace('https://firebasestorage.googleapis.com', `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);
  const file = bucket().file(decodeURIComponent(new URL(local).pathname.split('/o/')[1]));
  const [contents] = await file.download();
  const [metadata] = await file.getMetadata();
  return { contents, metadata };
};

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error('Run through `npm test`: the Firestore and Storage emulators are required.');
  }
  app = initializeApp({ projectId: PROJECT, storageBucket: BUCKET }, 'menu-images-migration');
  db = getFirestore(app);
});

afterAll(async () => { await deleteApp(app); });

beforeEach(async () => {
  backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-image-backup-'));
  for (const name of ['hookahs', 'tobaccoTypes', 'flavors', 'recommendedMixes', 'orders']) {
    const docs = await db.collection(name).listDocuments();
    await Promise.all(docs.map((ref) => ref.delete()));
  }
});

const run = () => moveAll({ db, bucket: bucket(), projectId: PROJECT, backupRoot, log: silent });

describe('moving menu pictures to Storage', () => {
  it('replaces an inline picture with a URL to a resized WebP, and keeps every other field', async () => {
    const original = await png(1800, 600);
    await db.doc('flavors/mint').set({ name: 'Mint', isActive: true, compatibleTobaccoTypes: ['virginia'], image: original });

    const totals = await run();
    expect(totals.documents).toBe(1);

    const data = (await db.doc('flavors/mint').get()).data()!;
    expect(data).toMatchObject({ name: 'Mint', isActive: true, compatibleTobaccoTypes: ['virginia'] });
    expect(data.image).toMatch(new RegExp(`^https://firebasestorage\\.googleapis\\.com/v0/b/${BUCKET.replace(/\./g, '\\.')}/o/menu%2Fflavors%2F[0-9a-f]{24}\\.webp\\?alt=media$`));

    const { contents, metadata } = await fetchImage(data.image);
    const info = await sharp(contents).metadata();
    expect(info.format).toBe('webp');
    expect({ width: info.width, height: info.height }).toEqual({ width: 900, height: 300 });
    expect(metadata.contentType).toBe('image/webp');
    expect(metadata.cacheControl).toBe(CACHE_CONTROL);
  });

  it('keeps transparency', async () => {
    await db.doc('flavors/clear').set({ image: await png(100, 100, 0) });
    await run();
    const { contents } = await fetchImage((await db.doc('flavors/clear').get()).data()!.image);
    expect((await sharp(contents).metadata()).hasAlpha).toBe(true);
  });

  it('does not enlarge a small picture', async () => {
    await db.doc('hookahs/small').set({ image: await png(120, 80) });
    await run();
    const { contents } = await fetchImage((await db.doc('hookahs/small').get()).data()!.image);
    const info = await sharp(contents).metadata();
    expect({ width: info.width, height: info.height }).toEqual({ width: 120, height: 80 });
  });

  it('moves every inline entry of a list and leaves URLs in it alone', async () => {
    const kept = 'https://example.com/already.webp';
    await db.doc('recommendedMixes/turbo').set({
      mainImage: await png(50, 50), flavorImages: [await png(40, 40), kept, await png(30, 30)],
    });
    await run();
    const data = (await db.doc('recommendedMixes/turbo').get()).data()!;
    expect(data.mainImage).toMatch(/^https:\/\/firebasestorage/);
    expect(data.flavorImages).toHaveLength(3);
    expect(data.flavorImages[0]).toMatch(/^https:\/\/firebasestorage/);
    expect(data.flavorImages[1]).toBe(kept);
    expect(data.flavorImages[2]).toMatch(/^https:\/\/firebasestorage/);
  });

  it('gives identical pictures one file', async () => {
    const same = await png(64, 64);
    await db.doc('flavors/a').set({ image: same });
    await db.doc('flavors/b').set({ image: same });
    await run();
    const a = (await db.doc('flavors/a').get()).data()!.image;
    const b = (await db.doc('flavors/b').get()).data()!.image;
    expect(a).toBe(b);
  });

  it('is a no-op the second time, and never overwrites the backup', async () => {
    const original = await png(64, 64);
    await db.doc('flavors/mint').set({ image: original });
    await run();
    const afterFirst = (await db.doc('flavors/mint').get()).data()!.image;
    const backupFile = path.join(backupRoot, PROJECT, 'flavors', 'mint.json');
    const backup = fs.readFileSync(backupFile, 'utf8');

    const second = await run();
    expect(second.documents).toBe(0);
    expect((await db.doc('flavors/mint').get()).data()!.image).toBe(afterFirst);
    expect(fs.readFileSync(backupFile, 'utf8')).toBe(backup);
    expect(JSON.parse(backup)).toEqual({ image: original });
  });

  it('touches only the menu collections and only documents with inline pictures', async () => {
    const inline = await png(10, 10);
    await db.doc('orders/o1').set({ image: inline });
    await db.doc('tobaccoTypes/virginia').set({ name: 'Virginia', image: '/img/virginia.webp' });
    const totals = await run();
    expect(totals.documents).toBe(0);
    expect((await db.doc('orders/o1').get()).data()!.image).toBe(inline);
    expect((await db.doc('tobaccoTypes/virginia').get()).data()!.image).toBe('/img/virginia.webp');
    expect(fs.existsSync(path.join(backupRoot, PROJECT))).toBe(false);
  });

  it('restore puts the originals back and leaves later edits to other fields', async () => {
    const original = await png(64, 64);
    const list = [await png(20, 20)];
    await db.doc('recommendedMixes/turbo').set({ name: 'Turbo Mix', mainImage: original, flavorImages: list });
    await run();
    await db.doc('recommendedMixes/turbo').update({ name: 'Turbo Mix 2' });

    const restored = await restoreAll({ db, projectId: PROJECT, backupRoot, log: silent });
    expect(restored).toBe(1);
    expect((await db.doc('recommendedMixes/turbo').get()).data()).toEqual({
      name: 'Turbo Mix 2', mainImage: original, flavorImages: list,
    });
  });
});
