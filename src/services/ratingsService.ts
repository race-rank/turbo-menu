import {
  collection, doc, getDocs, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

export interface ComboRating {
  comboId: string;
  label: string;
  score: number;
  ratedAt?: Date;
}

const ratingsRef = (uid: string) => collection(firestore, 'users', uid, 'ratings');

/**
 * Writes the rating twice, in one batch.
 *
 * The copy on the order is what makes the rating verified: security rules
 * already establish that the caller owns that order, so a score there is by
 * construction tied to a real purchase, and it answers "have I rated this?".
 *
 * The copy under the rater is what friends read. Orders carry table, total and
 * timestamp - effectively who was at the bar, when, and what they spent - so
 * they stay owner-only and the shareable projection holds nothing but the
 * score and a label.
 */
export const rateOrder = async (
  uid: string,
  orderId: string,
  comboId: string,
  label: string,
  score: number,
): Promise<void> => {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error(`Rating must be an integer from 1 to 5, got ${score}`);
  }

  const batch = writeBatch(firestore);
  batch.update(doc(firestore, 'orders', orderId), {
    rating: score,
    ratedAt: serverTimestamp(),
  });
  batch.set(doc(ratingsRef(uid), comboId), {
    comboId,
    label,
    score,
    ratedAt: serverTimestamp(),
  });
  await batch.commit();
};

export const listRatings = async (uid: string): Promise<ComboRating[]> => {
  const snapshot = await getDocs(ratingsRef(uid));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      comboId: docSnap.id,
      label: data.label ?? '',
      score: data.score ?? 0,
      ratedAt: data.ratedAt?.toDate?.() ?? undefined,
    };
  });
};
