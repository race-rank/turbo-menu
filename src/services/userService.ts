import { doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';
import { getOrdersForUser } from '@/services/orderService';

export interface UserProfile {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/** Written only for real accounts; anonymous visitors get no document. */
export const upsertUserProfile = async (user: User): Promise<void> => {
  if (user.isAnonymous) return;
  const ref = doc(firestore, 'users', user.uid);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      // First write only. With merge:true an unconditional serverTimestamp()
      // rewrote this on every sign-in, so "member since" tracked the latest
      // sign-in rather than the day the account was created.
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
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

const toDateOrNull = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
};

export interface AccountSummary {
  memberSince: Date | null;
  orderCount: number;
  totalSpent: number;
}

/**
 * Derives the profile counters from the orders collection rather than the
 * users document. recordOrderPlaced only increments for signed-in customers,
 * so its orderCount silently omits everything ordered as a guest before the
 * upgrade - and those orders do carry the same uid.
 */
export const getAccountSummary = async (uid: string): Promise<AccountSummary> => {
  const [profile, orders] = await Promise.all([
    getUserProfile(uid),
    getOrdersForUser(uid),
  ]);

  return {
    // Not safeConvertTimestamp: that returns "now" for a missing value, which
    // would render a confident but invented join date on older accounts whose
    // createdAt predates this field.
    memberSince: toDateOrNull((profile as { createdAt?: unknown } | null)?.createdAt),
    orderCount: orders.length,
    totalSpent: orders.reduce((sum, order) => sum + (order.total ?? 0), 0),
  };
};
