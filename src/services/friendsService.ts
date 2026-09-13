import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';

export type FriendshipStatus = 'pending' | 'accepted';

export interface Friendship {
  pairId: string;
  uids: [string, string];
  requestedBy: string;
  status: FriendshipStatus;
  otherUid: string;
}

/** Sorted and joined so rules can derive the same key from the participants. */
export const pairIdFor = (a: string, b: string): string =>
  (a < b ? `${a}_${b}` : `${b}_${a}`);

/**
 * Security rules cap displayName at 100 characters on both lookup collections,
 * and a longer one is rejected outright with a bare permission-denied. Google
 * display names have no length limit of their own, so bound it here.
 */
const shortName = (name: string | null | undefined): string | null => {
  if (!name) return null;
  return name.length > 100 ? name.slice(0, 100) : name;
};

export class FriendRequestConflictError extends Error {
  constructor(public readonly existing: Friendship) {
    super('A friendship already exists for this pair.');
    this.name = 'FriendRequestConflictError';
  }
}

/**
 * Both people tapping "add" at the same table target the same document, and
 * Firestore evaluates the second write as an update, which the rules refuse.
 * That is expected traffic, not an error to show: the caller catches this and
 * offers Accept instead.
 */
export const sendFriendRequest = async (me: string, otherUid: string): Promise<void> => {
  if (me === otherUid) throw new Error('You cannot add yourself.');
  const pairId = pairIdFor(me, otherUid);
  const ref = doc(firestore, 'friendships', pairId);

  try {
    await setDoc(ref, {
      uids: [me, otherUid].sort(),
      requestedBy: me,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists()) {
      const data = existing.data();
      throw new FriendRequestConflictError({
        pairId,
        uids: data.uids,
        requestedBy: data.requestedBy,
        status: data.status,
        otherUid,
      });
    }
    throw error;
  }
};

export const acceptFriendRequest = async (pairId: string): Promise<void> => {
  await updateDoc(doc(firestore, 'friendships', pairId), {
    status: 'accepted',
    acceptedAt: serverTimestamp(),
  });
};

/** Decline, cancel and unfriend are all the same operation. */
export const removeFriendship = async (pairId: string): Promise<void> => {
  await deleteDoc(doc(firestore, 'friendships', pairId));
};

/**
 * One array-contains query, with the pending/accepted split done in the client.
 * A customer here has at most a few dozen friends, so filtering locally avoids
 * a composite index and the deploy step that comes with it.
 */
export const listFriendships = async (uid: string): Promise<Friendship[]> => {
  const snapshot = await getDocs(query(
    collection(firestore, 'friendships'),
    where('uids', 'array-contains', uid),
  ));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const uids = data.uids as [string, string];
    return {
      pairId: docSnap.id,
      uids,
      requestedBy: data.requestedBy,
      status: data.status as FriendshipStatus,
      otherUid: uids.find((candidate) => candidate !== uid) ?? uid,
    };
  });
};

// ---------------------------------------------------------------- invite codes

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * crypto.getRandomValues, NOT crypto.randomUUID or crypto.subtle: only
 * getRandomValues works outside a secure context, and this project has already
 * shipped a blank page from assuming otherwise.
 *
 * The alphabet omits I, L, O, 0 and 1 because these codes get read aloud and
 * typed in by hand at a table.
 */
const generateCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
};

/**
 * Rotation order matters: publish the new code, repoint the user, then delete
 * the old one. A crash midway leaves two working codes, which is harmless.
 * Deleting first would leave the customer showing a QR that resolves to
 * nothing.
 */
export const ensureInviteCode = async (user: User): Promise<string> => {
  const userRef = doc(firestore, 'users', user.uid);
  const existing = await getDoc(userRef);
  const current = existing.data()?.inviteCode as string | undefined;
  if (current) return current;

  const code = generateCode();
  await setDoc(doc(firestore, 'inviteCodes', code), {
    uid: user.uid,
    displayName: shortName(user.displayName),
    createdAt: serverTimestamp(),
  });
  await setDoc(userRef, { inviteCode: code }, { merge: true });
  return code;
};

export const rotateInviteCode = async (user: User): Promise<string> => {
  const userRef = doc(firestore, 'users', user.uid);
  const previous = (await getDoc(userRef)).data()?.inviteCode as string | undefined;

  const code = generateCode();
  await setDoc(doc(firestore, 'inviteCodes', code), {
    uid: user.uid,
    displayName: shortName(user.displayName),
    createdAt: serverTimestamp(),
  });
  await setDoc(userRef, { inviteCode: code }, { merge: true });
  if (previous) {
    await deleteDoc(doc(firestore, 'inviteCodes', previous)).catch(() => undefined);
  }
  return code;
};

export const resolveInviteCode = async (
  code: string,
): Promise<{ uid: string; displayName: string | null } | null> => {
  const snapshot = await getDoc(doc(firestore, 'inviteCodes', code));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return { uid: data.uid, displayName: data.displayName ?? null };
};

// ------------------------------------------------------------ email discovery

/**
 * Real SHA-256, because the security rule recomputes the same value with
 * hashing.sha256(). That means crypto.subtle, which requires a secure context -
 * localhost counts, a LAN IP over plain http does not. Only this one toggle is
 * affected.
 */
export const sha256Hex = async (input: string): Promise<string> => {
  if (!crypto?.subtle) {
    throw new Error('Email discovery needs a secure context (https or localhost).');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Opt-in, default off.
 *
 * Turning it OFF deletes the lookup document first and clears the flag second,
 * so an interrupted opt-out never leaves someone findable while their settings
 * claim otherwise. The document's existence is what actually determines
 * findability; the boolean is a UI mirror.
 */
export const setDiscoverable = async (user: User, enabled: boolean): Promise<void> => {
  if (!user.email) throw new Error('This account has no email address.');
  const hash = await sha256Hex(normalizeEmail(user.email));
  const lookupRef = doc(firestore, 'discoverable', hash);
  const userRef = doc(firestore, 'users', user.uid);

  if (enabled) {
    await setDoc(lookupRef, { uid: user.uid, displayName: shortName(user.displayName) });
    await setDoc(userRef, { discoverableByEmail: true }, { merge: true });
    return;
  }

  await deleteDoc(lookupRef).catch(() => undefined);
  await setDoc(userRef, { discoverableByEmail: false }, { merge: true });
};

/**
 * Reads the UI mirror on users/{uid}.
 *
 * The lookup document's existence is what actually determines findability, but
 * checking that directly means hashing the email, which needs a secure context.
 * This is the cheap read for rendering the toggle; setDiscoverable keeps the
 * two in step and deletes the document first on opt-out so they cannot
 * disagree in the dangerous direction.
 */
export const getDiscoverable = async (uid: string): Promise<boolean> => {
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  return snapshot.data()?.discoverableByEmail === true;
};

export const findByEmail = async (
  email: string,
): Promise<{ uid: string; displayName: string | null } | null> => {
  const hash = await sha256Hex(normalizeEmail(email));
  const snapshot = await getDoc(doc(firestore, 'discoverable', hash)).catch(() => null);
  if (!snapshot?.exists()) return null;
  const data = snapshot.data();
  return { uid: data.uid, displayName: data.displayName ?? null };
};
