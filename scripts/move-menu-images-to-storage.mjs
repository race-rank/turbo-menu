/**
 * One-off: move the menu's pictures out of Firestore and into Storage.
 *
 * Menu documents used to carry each picture inline as a base64 data URI. This
 * resizes every one (longest side 900px, WebP), uploads it to
 * menu/{collection}/{content hash}.webp in the project's Storage bucket, and
 * replaces the field with the picture's URL. See src/services/menuImages.ts.
 *
 *   node scripts/move-menu-images-to-storage.mjs --dry-run      # production, read-only, no key needed
 *   node scripts/move-menu-images-to-storage.mjs                # production
 *   node scripts/move-menu-images-to-storage.mjs --staging      # staging
 *   node scripts/move-menu-images-to-storage.mjs --restore      # put the originals back
 *
 * Needs serviceAccountKey.json (production) or stagingServiceAccountKey.json
 * (with --staging) in the repo root. Both are gitignored. The script refuses a
 * key that belongs to any other project. --dry-run reads production's public
 * menu over REST and needs no key at all.
 *
 * Safe to interrupt and re-run: a document is updated only after its pictures
 * are uploaded, and one that already holds URLs is skipped.
 *
 * Before a document is changed, its original picture fields are written to
 * menu-image-backup/{project}/{collection}/{docId}.json. --restore writes
 * those back. Keep the folder until the site has been checked; it is
 * gitignored.
 *
 * Deploy storage.rules first (npm run rules:deploy:production), or the
 * pictures upload but nobody can read them.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

export const PROJECTS = {
  production: { id: 'turbo-menu-30079', key: 'serviceAccountKey.json' },
  staging: { id: 'turbo-menu-staging', key: 'stagingServiceAccountKey.json' },
};
export const COLLECTIONS = ['hookahs', 'tobaccoTypes', 'flavors', 'recommendedMixes'];
export const BACKUP_DIR = 'menu-image-backup';

// Mirrors of src/services/menuImages.ts - tests/menuImages.test.ts compares them.
export const MAX_DIMENSION = 900;
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const isInlineImage = (value) => typeof value === 'string' && value.startsWith('data:image/');
export const menuImagePath = (collection, name, extension) => `menu/${collection}/${name}.${extension}`;
export const menuImageUrl = (bucket, filePath) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;

/** The picture fields of a document: top-level strings and lists of strings. */
export const inlineImageFields = (data) => Object.fromEntries(
  Object.entries(data).filter(([, value]) =>
    isInlineImage(value) || (Array.isArray(value) && value.some(isInlineImage))),
);

export const decodeDataUrl = (dataUrl) => {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  if (comma === -1 || !header.endsWith(';base64')) {
    throw new Error(`Not a base64 data URL: ${dataUrl.slice(0, 40)}`);
  }
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
};

/** Resized WebP. Alpha is kept; EXIF rotation is applied; animation is dropped. */
export const toWebp = (input) => sharp(input)
  .rotate()
  .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 80 })
  .toBuffer();

/**
 * Moves one document's pictures. `save(path, buffer)` stores a file and
 * `bucketName` names where; returns the fields to write, or null when the
 * document holds no inline picture.
 */
export const moveDocumentImages = async (collection, data, bucketName, save) => {
  const fields = inlineImageFields(data);
  if (Object.keys(fields).length === 0) return null;

  const moveOne = async (dataUrl) => {
    const webp = await toWebp(decodeDataUrl(dataUrl));
    const name = createHash('sha256').update(webp).digest('hex').slice(0, 24);
    const filePath = menuImagePath(collection, name, 'webp');
    await save(filePath, webp);
    return { url: menuImageUrl(bucketName, filePath), before: dataUrl.length, after: webp.length };
  };

  const updates = {};
  let before = 0;
  let after = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      updates[key] = [];
      for (const entry of value) {
        if (!isInlineImage(entry)) { updates[key].push(entry); continue; }
        const moved = await moveOne(entry);
        updates[key].push(moved.url); before += moved.before; after += moved.after;
      }
    } else {
      const moved = await moveOne(value);
      updates[key] = moved.url; before += moved.before; after += moved.after;
    }
  }
  return { updates, originals: fields, before, after };
};

/** The whole move against a Firestore and a bucket (admin SDK objects). */
export const moveAll = async ({ db, bucket, projectId, backupRoot = BACKUP_DIR, log = console.log }) => {
  const totals = { documents: 0, before: 0, after: 0 };
  for (const collection of COLLECTIONS) {
    // Ids first, then one document at a time: together they are tens of MB.
    const refs = await db.collection(collection).listDocuments();
    for (const ref of refs) {
      const snapshot = await ref.get();
      if (!snapshot.exists) continue;
      const moved = await moveDocumentImages(collection, snapshot.data(), bucket.name, (filePath, buffer) =>
        bucket.file(filePath).save(buffer, {
          resumable: false,
          metadata: { contentType: 'image/webp', cacheControl: CACHE_CONTROL },
        }));
      if (!moved) continue;

      const backupFile = path.join(backupRoot, projectId, collection, `${ref.id}.json`);
      // Never overwrite a backup: after a re-run it would hold URLs, not originals.
      if (!existsSync(backupFile)) {
        mkdirSync(path.dirname(backupFile), { recursive: true });
        writeFileSync(backupFile, JSON.stringify(moved.originals));
      }
      await ref.update(moved.updates);

      totals.documents += 1; totals.before += moved.before; totals.after += moved.after;
      log(`${collection}/${ref.id}: ${kb(moved.before)} -> ${kb(moved.after)}`);
    }
  }
  return totals;
};

export const restoreAll = async ({ db, projectId, backupRoot = BACKUP_DIR, log = console.log }) => {
  let restored = 0;
  for (const collection of COLLECTIONS) {
    const dir = path.join(backupRoot, projectId, collection);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const id = file.slice(0, -'.json'.length);
      await db.collection(collection).doc(id).update(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
      restored += 1;
      log(`restored ${collection}/${id}`);
    }
  }
  return restored;
};

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

const dryRun = async () => {
  const { fromRest } = await import('./copy-menu-to-staging.mjs');
  const totals = { documents: 0, before: 0, after: 0 };
  for (const collection of COLLECTIONS) {
    let pageToken = '';
    do {
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECTS.production.id}/databases/(default)/documents/${collection}`
        + `?pageSize=5${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Reading ${collection} failed: ${response.status}`);
      const body = await response.json();
      for (const document of body.documents ?? []) {
        const data = fromRest({ mapValue: { fields: document.fields } });
        const moved = await moveDocumentImages(collection, data, 'dry-run', async () => {});
        if (!moved) continue;
        totals.documents += 1; totals.before += moved.before; totals.after += moved.after;
      }
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    console.log(`${collection}: done`);
  }
  console.log(`Dry run, nothing written. ${totals.documents} document(s) hold inline pictures: `
    + `${kb(totals.before)} now, ${kb(totals.after)} after the move.`);
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) return dryRun();

  const target = args.includes('--staging') ? PROJECTS.staging : PROJECTS.production;
  const key = JSON.parse(readFileSync(target.key, 'utf8'));
  if (key.project_id !== target.id) {
    throw new Error(`Refusing to run: ${target.key} is for "${key.project_id}", not "${target.id}".`);
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');
  initializeApp({ credential: cert(key), storageBucket: `${target.id}.firebasestorage.app` });
  const db = getFirestore();

  if (args.includes('--restore')) {
    const restored = await restoreAll({ db, projectId: target.id });
    console.log(`Restored ${restored} document(s) on ${target.id}.`);
    return;
  }
  const totals = await moveAll({ db, bucket: getStorage().bucket(), projectId: target.id });
  console.log(`Moved pictures of ${totals.documents} document(s) on ${target.id}: `
    + `${kb(totals.before)} -> ${kb(totals.after)}. Originals are in ${BACKUP_DIR}/.`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
