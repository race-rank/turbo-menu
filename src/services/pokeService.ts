import {
  collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc,
  type FirestoreError, type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import type { Poke } from './pokes';

/**
 * merge: true is load-bearing. The recipient may have stamped seenAt; a plain
 * set would delete it, putting seenAt in affectedKeys, and the rule - which
 * lets the poker touch only `at` - would deny the poke.
 */
export const pokeFriend = (me: string, friendUid: string): Promise<void> =>
  setDoc(doc(firestore, 'users', friendUid, 'pokes', me), { at: serverTimestamp() }, { merge: true });

export const getMyLastPokeAt = async (me: string, friendUid: string): Promise<Date | null> => {
  const snapshot = await getDoc(doc(firestore, 'users', friendUid, 'pokes', me));
  return snapshot.exists() ? snapshot.data().at?.toDate?.() ?? null : null;
};

export const subscribeToPokes = (
  uid: string,
  onChange: (pokes: Poke[]) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe => onSnapshot(
  collection(firestore, 'users', uid, 'pokes'),
  (snapshot) => {
    const pokes = snapshot.docs.map((docSnap): Partial<Poke> & { fromUid: string } => {
      // 'estimate' so a just-written serverTimestamp reads as "now" locally
      // instead of null until the server confirms it.
      const data = docSnap.data({ serverTimestamps: 'estimate' });
      return { fromUid: docSnap.id, at: data.at?.toDate?.(), seenAt: data.seenAt?.toDate?.() };
    });
    onChange(pokes.filter((poke): poke is Poke => poke.at instanceof Date));
  },
  onError,
);

export const markPokesSeen = (uid: string, fromUids: string[]): Promise<unknown> =>
  Promise.all(fromUids.map((from) =>
    updateDoc(doc(firestore, 'users', uid, 'pokes', from), { seenAt: serverTimestamp() })));
