import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';

export interface PublicProfile {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * The shareable subset of an account.
 *
 * Separate from users/{uid} because Firestore has no field-level read
 * security: granting a friend read access to the user document would hand
 * over the email address, order count and total spend along with the name.
 *
 * Note on merge: for a merge write, request.resource.data is the WHOLE merged
 * document, not just the incoming fields, so the rule's keys().hasOnly() sees
 * any field already on the document. Nothing else writes profiles/{uid} today,
 * but if anything ever leaves a stray field there, every later sign-in for that
 * user starts failing permission-denied. Keep this the only writer.
 */
export const upsertPublicProfile = async (user: User): Promise<void> => {
  if (user.isAnonymous) return;
  await setDoc(
    doc(firestore, 'profiles', user.uid),
    {
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const getPublicProfile = async (uid: string): Promise<PublicProfile | null> => {
  const snapshot = await getDoc(doc(firestore, 'profiles', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    uid,
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
  };
};
