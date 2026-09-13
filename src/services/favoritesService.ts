import {
  collection, deleteDoc, doc, getDocs, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { truncateLabel } from '@/services/comboId';

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

/**
 * Deliberately stores ids and never prices. Re-ordering re-prices from the live
 * menu; a stored price would let a saved favourite quietly undercharge after a
 * price rise.
 */
export const addFavorite = async (uid: string, favorite: FavoriteCombo): Promise<void> => {
  const { createdAt, ...rest } = favorite;
  const payload = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  await setDoc(doc(favoritesRef(uid), favorite.comboId), {
    ...payload,
    label: truncateLabel(favorite.label),
    createdAt: serverTimestamp(),
  });
};

export const removeFavorite = async (uid: string, comboId: string): Promise<void> => {
  await deleteDoc(doc(favoritesRef(uid), comboId));
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
