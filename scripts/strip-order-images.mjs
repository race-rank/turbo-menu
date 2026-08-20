/**
 * One-off migration: remove base64 image data from existing order documents.
 *
 *   node scripts/strip-order-images.mjs            # dry run, writes nothing
 *   node scripts/strip-order-images.mjs --apply    # actually strip
 *
 * Every order item carried a copy of its menu photo as a base64 data URI of
 * roughly 900KB, putting order documents at ~91% of Firestore's 1MiB limit and
 * making the admin dashboard stream hundreds of megabytes per load. Nothing in
 * the app renders these - the cart thumbnail comes from client state - so they
 * are dead weight.
 *
 * Requires serviceAccountKey.json in the repo root. Run from the repo root.
 * That file bypasses security rules entirely and must never be committed.
 *
 * Safe to re-run: documents with no image field are skipped.
 *
 * Run this AFTER deploying the code that stops writing images. Orders placed by
 * an older deploy still carry them, so migrating first leaves a tail of new
 * fat documents behind.
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

// Each unmigrated document is close to 1MiB, so pull a small window at a time
// rather than the whole collection.
const PAGE_SIZE = 25;

initializeApp({ credential: cert(JSON.parse(readFileSync('serviceAccountKey.json', 'utf8'))) });
const db = getFirestore();

const stripImages = (items) => {
  let removedBytes = 0;
  const stripped = items.map((item) => {
    if (!item || typeof item !== 'object' || !('image' in item)) return item;
    const { image, ...rest } = item;
    removedBytes += Buffer.byteLength(String(image ?? ''), 'utf8');
    return rest;
  });
  return { stripped, removedBytes };
};

let cursor = null;
let scanned = 0;
let changed = 0;
let skipped = 0;
let totalBytes = 0;

console.log(APPLY ? 'Applying changes.' : 'Dry run - pass --apply to write.');

for (;;) {
  let q = db.collection('orders').orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.get();
  if (snap.empty) break;

  const batch = db.batch();
  let batchWrites = 0;

  for (const docSnap of snap.docs) {
    scanned += 1;
    const items = docSnap.get('items');

    if (!Array.isArray(items)) {
      console.warn(`  ${docSnap.id}: no items array, skipping`);
      skipped += 1;
      continue;
    }

    const { stripped, removedBytes } = stripImages(items);
    if (removedBytes === 0) {
      skipped += 1;
      continue;
    }

    changed += 1;
    totalBytes += removedBytes;
    if (APPLY) {
      batch.update(docSnap.ref, { items: stripped });
      batchWrites += 1;
    }
  }

  if (batchWrites > 0) await batch.commit();

  cursor = snap.docs[snap.docs.length - 1];
  console.log(`  scanned ${scanned}, stripped ${changed}, ${(totalBytes / 1e6).toFixed(1)} MB reclaimed`);

  if (snap.size < PAGE_SIZE) break;
}

console.log('---');
console.log(`Scanned:        ${scanned} orders`);
console.log(`Stripped:       ${changed}`);
console.log(`Already clean:  ${skipped}`);
console.log(`Reclaimed:      ${(totalBytes / 1e6).toFixed(1)} MB`);
if (!APPLY && changed > 0) console.log('\nNothing was written. Re-run with --apply.');
