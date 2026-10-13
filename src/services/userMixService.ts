import {
  addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import type { UserMix, UserMixStatus, UserMixSubmission } from './userMixes';

const userMixes = () => collection(firestore, 'userMixes');

const toUserMix = (id: string, data: Record<string, any>): UserMix => ({
  ...(data as Omit<UserMix, 'id'>),
  id,
  createdAt: data.createdAt?.toDate?.() ?? undefined,
  reviewedAt: data.reviewedAt?.toDate?.() ?? undefined,
});

// Single-field queries, sorted here. A where + orderBy pair would need a
// composite index, and firestore.indexes.json is out of sync with
// production, so every index deploy is a risk. These lists are small.
const byCreatedAt = (direction: 1 | -1) => (a: UserMix, b: UserMix) =>
  direction * ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

const listWhere = async (field: string, value: string): Promise<UserMix[]> => {
  const snapshot = await getDocs(query(userMixes(), where(field, '==', value)));
  return snapshot.docs.map((d) => toUserMix(d.id, d.data()));
};

export const submitUserMix = async (submission: UserMixSubmission): Promise<string> => {
  const ref = await addDoc(userMixes(), { ...submission, status: 'pending', createdAt: serverTimestamp() });
  return ref.id;
};

export const listMyUserMixes = async (uid: string): Promise<UserMix[]> =>
  (await listWhere('creatorUid', uid)).sort(byCreatedAt(-1));

export const listPendingUserMixes = async (): Promise<UserMix[]> =>
  (await listWhere('status', 'pending')).sort(byCreatedAt(1));

export const listApprovedUserMixes = async (): Promise<UserMix[]> =>
  (await listWhere('status', 'approved')).sort(byCreatedAt(-1));

export const withdrawUserMix = (id: string): Promise<void> => deleteDoc(doc(firestore, 'userMixes', id));

/** Callers must republish the menu snapshot afterwards, like every menu mutation. */
export const reviewUserMix = (id: string, status: Exclude<UserMixStatus, 'pending'>): Promise<void> =>
  updateDoc(doc(firestore, 'userMixes', id), { status, reviewedAt: serverTimestamp() });
