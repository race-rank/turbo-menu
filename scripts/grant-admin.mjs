/**
 * One-off: grant the admin custom claim.
 *
 *   node scripts/grant-admin.mjs admin@example.com
 *
 * Requires serviceAccountKey.json in the repo root, downloaded from
 * Firebase console -> Project settings -> Service accounts.
 * That file is gitignored and must never be committed.
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/grant-admin.mjs <email>');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync('serviceAccountKey.json', 'utf8'))) });

const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { admin: true });
console.log(`Granted admin to ${email} (${user.uid}).`);
console.log('They must sign out and back in for the new token to take effect.');
