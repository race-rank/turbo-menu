/**
 * One-off: set users/{uid}/counters/favorites to each customer's real number of
 * favourites. Run straight after deploying the rules that introduce the counter
 * (see docs/superpowers/specs/2026-11-13-favourites-manual-add-and-limit-design.md,
 * "Release order").
 *
 *   node scripts/backfill-favorite-counts.mjs           # write
 *   node scripts/backfill-favorite-counts.mjs --dry-run # report only
 *
 * Requires serviceAccountKey.json in the repo root, downloaded from
 * Firebase console -> Project settings -> Service accounts.
 * That file is gitignored and must never be committed.
 *
 * Idempotent: it always overwrites with the real count, so it can be re-run to
 * correct drift. Covers anonymous guests too - their favourites live under the
 * same path.
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');
const MAX_FAVORITES = 20; // src/services/favoriteLimit.ts

initializeApp({ credential: cert(JSON.parse(readFileSync('serviceAccountKey.json', 'utf8'))) });
const db = getFirestore();

// favorites subcollections exist under user ids that may have no users/{uid}
// document (guests), so walk the collection group, not the users collection.
const counts = new Map();
const snapshot = await db.collectionGroup('favorites').select().get();
for (const favorite of snapshot.docs) {
  const userDoc = favorite.ref.parent.parent;
  if (!userDoc || userDoc.parent.id !== 'users') continue;
  counts.set(userDoc.id, (counts.get(userDoc.id) ?? 0) + 1);
}

let over = 0;
for (const [uid, count] of counts) {
  if (count > MAX_FAVORITES) over += 1;
  if (!dryRun) {
    await db.doc(`users/${uid}/counters/favorites`).set({ count, changed: '' });
  }
}

console.log(`${dryRun ? 'Would update' : 'Updated'} ${counts.size} customer(s).`);
console.log(`${over} customer(s) are over ${MAX_FAVORITES} and keep everything.`);
