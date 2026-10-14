import {
  addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { toCommunityMix, type CommunityMix, type UserMix, type UserMixSubmission } from './userMixes';

// Private submissions (creator and admins only) ...
const userMixes = () => collection(firestore, 'userMixes');
// ... and the public copy of each approved one, same id, no creatorUid.
const communityMixes = () => collection(firestore, 'communityMixes');

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

/** What the menu shows. Readable by anyone, signed in or not. */
export const listCommunityMixes = async (): Promise<CommunityMix[]> => {
  const snapshot = await getDocs(communityMixes());
  return snapshot.docs
    .map((d): CommunityMix => {
      const data = d.data();
      return { ...(data as Omit<CommunityMix, 'id'>), id: d.id, approvedAt: data.approvedAt?.toDate?.() ?? undefined };
    })
    .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0));
};

/** Pending or rejected only - the rules refuse an approved one; the bar removes those. */
export const withdrawUserMix = (id: string): Promise<void> => deleteDoc(doc(firestore, 'userMixes', id));

/**
 * Publishes the public copy and records the verdict in one batch, so the
 * menu and the moderation queue can never disagree. Callers must republish
 * the menu snapshot afterwards, like every menu mutation.
 */
export const approveUserMix = (mix: UserMix): Promise<void> => {
  const { id, ...projection } = toCommunityMix(mix);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'communityMixes', id), { ...projection, approvedAt: serverTimestamp() });
  batch.update(doc(firestore, 'userMixes', id), { status: 'approved', reviewedAt: serverTimestamp() });
  return batch.commit();
};

/**
 * Rejects a pending mix or takes an approved one off the menu: the verdict
 * and the removal of any public copy, in one batch. Callers must republish
 * the menu snapshot afterwards.
 */
export const rejectUserMix = (id: string): Promise<void> => {
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, 'userMixes', id), { status: 'rejected', reviewedAt: serverTimestamp() });
  batch.delete(doc(firestore, 'communityMixes', id));
  return batch.commit();
};
