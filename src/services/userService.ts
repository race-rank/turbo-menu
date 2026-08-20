import { doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';

export interface UserProfile {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/** Written only for real accounts; anonymous visitors get no document. */
export const upsertUserProfile = async (user: User): Promise<void> => {
  if (user.isAnonymous) return;
  await setDoc(
    doc(firestore, 'users', user.uid),
    {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  return snapshot.exists() ? (snapshot.data() as UserProfile) : null;
};

/** Display counters only. The orders collection stays authoritative. */
export const recordOrderPlaced = async (user: User): Promise<void> => {
  if (user.isAnonymous) return;
  await setDoc(
    doc(firestore, 'users', user.uid),
    { orderCount: increment(1), lastOrderAt: serverTimestamp() },
    { merge: true },
  );
};
