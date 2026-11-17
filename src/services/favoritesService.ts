import {
  collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { truncateLabel } from '@/services/comboId';
import { FavoritesFullError, hasRoomForFavorite } from '@/services/favoriteLimit';

export interface FavoriteCombo {
  comboId: string;
  /**
   * Display text, denormalised on purpose. A friend viewing this list would
   * otherwise have to resolve menu ids to names and hope each one still
   * exists; a mix can be deactivated or renamed. This is what was favourited,
   * frozen at the time. Never used as a key.
   */
  label: string;
  kind: 'mix' | 'custom';
  mixId?: string;
  hookahId?: string;
  tobaccoType?: string;
  flavorIds?: string[];
  // Personalisation. Excluded from comboId, stored here so "order again"
  // restores the customer's exact build.
  tobaccoStrength?: number;
  flavorPercentages?: Record<string, number>;
  withIce?: boolean;
  hasLED?: boolean;
  hasColoredWater?: boolean;
  hasAlcohol?: boolean;
  hasFruits?: boolean;
  createdAt?: Date;
}

const favoritesRef = (uid: string) => collection(firestore, 'users', uid, 'favorites');

/** See the favourites-limit section of firestore.rules. */
const counterRef = (uid: string) => doc(firestore, 'users', uid, 'counters', 'favorites');

const readCount = (data: { count?: unknown } | undefined): number =>
  (typeof data?.count === 'number' ? data.count : 0);

/**
 * Deliberately stores ids and never prices. Re-ordering re-prices from the live
 * menu; a stored price would let a saved favourite quietly undercharge after a
 * price rise.
 *
 * A transaction, so the favourite and its counter move together; the rules
 * refuse either without the other. Overwriting an existing favourite leaves the
 * count alone. Throws FavoritesFullError, without writing, when a NEW favourite
 * would go past the limit - read inside the transaction, so a list filled up on
 * another device is caught here too.
 *
 * Needs a connection: a transaction is not queued offline the way setDoc was.
 */
export const addFavorite = async (uid: string, favorite: FavoriteCombo): Promise<void> => {
  const { createdAt, ...rest } = favorite;
  const payload = {
    ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
    label: truncateLabel(favorite.label),
    createdAt: serverTimestamp(),
  };
  const favoriteRef = doc(favoritesRef(uid), favorite.comboId);

  await runTransaction(firestore, async (tx) => {
    const existing = await tx.get(favoriteRef);
    const counter = await tx.get(counterRef(uid));
    if (existing.exists()) {
      tx.set(favoriteRef, payload);
      return;
    }
    const count = readCount(counter.data());
    if (!hasRoomForFavorite(count)) throw new FavoritesFullError();
    tx.set(favoriteRef, payload);
    tx.set(counterRef(uid), { count: count + 1, changed: favorite.comboId });
  });
};

/** Deletes the favourite and, when it existed, gives its slot back. */
export const removeFavorite = async (uid: string, comboId: string): Promise<void> => {
  const favoriteRef = doc(favoritesRef(uid), comboId);
  await runTransaction(firestore, async (tx) => {
    const existing = await tx.get(favoriteRef);
    const counter = await tx.get(counterRef(uid));
    if (!existing.exists()) return;
    tx.delete(favoriteRef);
    const count = readCount(counter.data());
    if (counter.exists() && count > 0) {
      tx.set(counterRef(uid), { count: count - 1, changed: comboId });
    }
  });
};

/**
 * For the guest transfer only. The claimer may delete a guest's favourites but
 * not write the guest's counter, and the guest uid is abandoned anyway.
 */
export const deleteGuestFavorite = async (anonUid: string, comboId: string): Promise<void> => {
  await deleteDoc(doc(favoritesRef(anonUid), comboId));
};

/** The stored count; 0 before a customer's first favourite. */
export const getFavoriteCount = async (uid: string): Promise<number> => {
  const snapshot = await getDoc(counterRef(uid));
  return readCount(snapshot.data());
};

export const listFavorites = async (uid: string): Promise<FavoriteCombo[]> => {
  const snapshot = await getDocs(favoritesRef(uid));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      ...data,
      comboId: docSnap.id,
      createdAt: data.createdAt?.toDate?.() ?? undefined,
    } as FavoriteCombo;
  });
};
