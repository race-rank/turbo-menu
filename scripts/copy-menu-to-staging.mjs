/**
 * Copies the menu from production to the staging project, so the native apps
 * have something real to show while they are developed.
 *
 *   node scripts/copy-menu-to-staging.mjs --dry-run   # report only
 *   node scripts/copy-menu-to-staging.mjs             # write to staging
 *
 * Production is read through the public REST API with NO credentials: the menu
 * collections are world-readable, so this script cannot reach anything a guest
 * cannot, and can never write to production. Customers, orders, friendships
 * and every other collection are not copied.
 *
 * Staging is written with stagingServiceAccountKey.json in the repo root
 * (Firebase console -> turbo-menu-staging -> Project settings -> Service
 * accounts -> Generate new private key). That file is gitignored. The script
 * refuses any key that does not belong to the staging project.
 *
 * Idempotent: documents keep their production ids and are overwritten.
 * Documents deleted in production are not removed from staging.
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';

const PRODUCTION = 'turbo-menu-30079';
const STAGING = 'turbo-menu-staging';
const COLLECTIONS = ['hookahs', 'tobaccoTypes', 'flavors', 'recommendedMixes', 'menu'];
const dryRun = process.argv.includes('--dry-run');

/** Firestore REST typed value -> plain value the admin SDK accepts. */
export const fromRest = (value) => {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return Timestamp.fromDate(new Date(value.timestampValue));
  if ('geoPointValue' in value) return new GeoPoint(value.geoPointValue.latitude ?? 0, value.geoPointValue.longitude ?? 0);
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromRest);
  if ('mapValue' in value) return fieldsFromRest(value.mapValue.fields);
  throw new Error(`Unsupported Firestore value: ${Object.keys(value).join(', ')}`);
};

const fieldsFromRest = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromRest(value)]));

const readCollection = async (name) => {
  const docs = [];
  let pageToken = '';
  do {
    // Small pages: menu documents carry inline images of up to ~1MB each.
    const url = `https://firestore.googleapis.com/v1/projects/${PRODUCTION}/databases/(default)/documents/${name}`
      + `?pageSize=5${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Reading ${name} failed: ${response.status} ${await response.text()}`);
    const body = await response.json();
    for (const document of body.documents ?? []) {
      docs.push({ id: document.name.split('/').pop(), data: fieldsFromRest(document.fields) });
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return docs;
};

const main = async () => {
  let db = null;
  if (!dryRun) {
    const key = JSON.parse(readFileSync('stagingServiceAccountKey.json', 'utf8'));
    if (key.project_id !== STAGING) {
      throw new Error(`Refusing to run: the key is for "${key.project_id}", not "${STAGING}".`);
    }
    initializeApp({ credential: cert(key) });
    db = getFirestore();
  }

  for (const name of COLLECTIONS) {
    const docs = await readCollection(name);
    console.log(`${name}: ${docs.length} document(s)${dryRun ? ' (dry run, nothing written)' : ''}`);
    if (!db) continue;
    // One write per document: a batch is capped at 10MB and images are large.
    for (const { id, data } of docs) {
      await db.collection(name).doc(id).set(data);
    }
  }
  console.log(dryRun ? 'Dry run complete.' : `Copied to ${STAGING}.`);
};

// Only when run directly, so the converter can be imported by its test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
