import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';
import type { CartItem } from '@/contexts/CartContext';
import { buildNowSmokingItems, type NowSmoking, type NowSmokingItem } from './nowSmoking';

/** The opt-in lives on the owner-only users/{uid} doc, beside discoverableByEmail. */
export const getShareNowSmoking = async (uid: string): Promise<boolean> => {
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  return snapshot.exists() && snapshot.data().shareNowSmoking === true;
};

/**
 * Turning it off deletes the live status first, so friends stop seeing it
 * immediately rather than when it expires. If that delete fails, this throws
 * and the flag is left as it was - never "off" while a status is still live.
 */
export const setShareNowSmoking = async (uid: string, enabled: boolean): Promise<void> => {
  if (!enabled) await deleteDoc(doc(firestore, 'nowSmoking', uid));
  await setDoc(doc(firestore, 'users', uid), { shareNowSmoking: enabled }, { merge: true });
};

export const getNowSmoking = async (uid: string): Promise<NowSmoking | null> => {
  const snapshot = await getDoc(doc(firestore, 'nowSmoking', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const since = data.since?.toDate?.();
  if (!since || !Array.isArray(data.items)) return null;
  return { items: data.items as NowSmokingItem[], since };
};

/**
 * Called after an order is placed. Never throws, never blocks: checkout is
 * the bar's revenue path, and sharing a status is a nicety on top of it.
 * Guests are skipped - friends need a real account.
 */
export const shareWhatImSmoking = async (user: User, items: CartItem[]): Promise<void> => {
  try {
    if (user.isAnonymous) return;
    const shared = buildNowSmokingItems(items);
    if (shared.length === 0) return;
    if (!(await getShareNowSmoking(user.uid))) return;
    await setDoc(doc(firestore, 'nowSmoking', user.uid), { items: shared, since: serverTimestamp() });
  } catch (error) {
    console.error('Sharing what you are smoking failed:', error);
  }
};
