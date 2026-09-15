import {
  collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';
import { truncateLabel } from '@/services/comboId';
// One SHA-256 implementation for the whole app. It needs crypto.subtle, and
// so a secure context - see the note in ensureGuestClaim about what that
// costs here and why there is no way around it.
import { sha256Hex } from '@/services/friendsService';
import { addFavorite, listFavorites, removeFavorite } from '@/services/favoritesService';
import { listRatings } from '@/services/ratingsService';

/**
 * Moving a guest's data onto an account that already existed.
 *
 * Signing UP as a guest keeps the uid (linkWithCredential / linkWithPopup), so
 * orders, favourites and ratings come along on their own. Signing IN to an
 * account that already exists cannot: Firebase will not merge two accounts, so
 * the customer lands on a different uid and everything they did as a guest is
 * stranded under the dead anonymous one.
 *
 * Reassigning an order is a client write to the bar's revenue record, so the
 * rule behind it cannot be "any signed-in user may change an order's owner" -
 * that is order theft by guessing a document id. Instead the guest session
 * mints a random secret S, keeps it in localStorage, and publishes only
 * sha256(S) to accountClaims/{anonUid}. Presenting S back is what proves this
 * is the same device, and firestore.rules is the only thing that decides
 * whether it worked: every step below is gated on the same claim check, so a
 * caller that never held the claim simply gets a string of denials and moves
 * nothing.
 *
 * Nothing in here may ever fail a sign-in. The account is already signed in by
 * the time this runs, and there is precedent in this codebase for a failed
 * follow-up write being reported to a customer as a failed sign-up
 * (upsertPublicProfile). Callers catch; this returns what actually moved so
 * they can say so rather than apologise.
 */

const STORAGE_KEY = 'turbo-guest-claim';

/** Under Firestore's 500-op cap, with room to spare. */
const ORDER_BATCH_LIMIT = 450;

/**
 * How many sign-ins may try to finish a migration before it is written off.
 * Without a cap, one order that can never be moved - deleted by an admin since
 * the snapshot, say - keeps the local record alive forever and costs a failed
 * write on every subsequent sign-in.
 */
const MAX_ATTEMPTS = 3;

interface StoredClaim {
  /** The anonymous uid the claim and the guest's data belong to. */
  uid: string;
  secret: string;
  /**
   * The guest's order ids, captured while the anonymous session still existed.
   * See ensureGuestClaim: this is the last moment they are readable, and the
   * claim deliberately does not widen the orders collection to make them
   * readable later.
   */
  orderIds: string[];
  /** Whether accountClaims/{uid} is known to have been written. */
  written: boolean;
  attempts: number;
}

export interface ClaimSummary {
  orders: number;
  favorites: number;
  ratings: number;
  /**
   * How much was meant to move and did not - orders, favourites and ratings
   * together. Non-zero means this run was interrupted or denied, the local
   * claim record was kept, and the next sign-in picks up where it stopped.
   * Worth surfacing: otherwise "0 moved" reads to a customer as "there was
   * nothing to move", which is the opposite of what happened.
   */
  outstanding: number;
}

const readStored = (): StoredClaim | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClaim;
    if (!parsed?.uid || !parsed?.secret) return null;
    return {
      uid: parsed.uid,
      secret: parsed.secret,
      orderIds: Array.isArray(parsed.orderIds) ? parsed.orderIds : [],
      written: parsed.written === true,
      attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0,
    };
  } catch (error) {
    console.error('Unreadable guest claim record; discarding:', error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

const writeStored = (claim: StoredClaim): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(claim));
  } catch (error) {
    console.error('Could not store the guest claim record:', error);
  }
};

const clearStored = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Could not clear the guest claim record:', error);
  }
};

/**
 * crypto.getRandomValues, NOT crypto.randomUUID: only getRandomValues works
 * outside a secure context, and this project has already shipped a blank page
 * from assuming otherwise (see comboId.ts and friendsService.ts). 32 bytes,
 * rendered as lower-case hex to match what the rule's hex bound expects.
 */
const randomSecretHex = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const claimRef = (anonUid: string) => doc(firestore, 'accountClaims', anonUid);

/**
 * Deliberately no orderBy: ordering by createdAt needs the composite index in
 * firestore.indexes.json, and all this wants is a set of document ids.
 */
const listOwnOrderIds = async (uid: string): Promise<string[]> => {
  const snapshot = await getDocs(query(
    collection(firestore, 'orders'),
    where('customerInfo.uid', '==', uid),
  ));
  return snapshot.docs.map((docSnap) => docSnap.id);
};

// --------------------------------------------------------------- the guest side

let pendingEnsure: Promise<void> | null = null;

/**
 * False once ensureGuestClaim has found there is no crypto.subtle to hash with.
 * Only so the sign-in toast can say "your guest session stays separate" instead
 * of the flatly untrue "there was nothing to move".
 */
let claimSupported = true;

export const isGuestClaimSupported = (): boolean => claimSupported;

/**
 * Prepares the claim, while the caller is still the anonymous guest.
 *
 * Must run BEFORE the auth state changes - afterwards the anonymous session is
 * gone, its uid can no longer create the claim document, and its orders can no
 * longer be read. AuthForms calls this when the sign-in card mounts rather than
 * inside the button handlers, for two reasons: a Firestore round trip between
 * the click and signInWithPopup burns the user activation the browser needs to
 * open the popup (authService.ts has the scar tissue from exactly that), and
 * mounting is early enough that the write has long settled by the time anyone
 * finishes typing a password.
 *
 * Idempotent, and it never rewrites an existing claim: the create rule allows
 * exactly one per uid, so a second write would be denied anyway.
 */
export const ensureGuestClaim = async (user: User | null | undefined): Promise<void> => {
  if (!user?.isAnonymous) return;

  // The claim's whole proof is that a security rule can recompute
  // hashing.sha256(S), which means real SHA-256, which means crypto.subtle and
  // therefore a secure context - localhost counts, a LAN IP over plain http
  // does not. Same constraint that already gates email discovery
  // (friendsService.sha256Hex). Nothing else degrades: with no claim the
  // customer simply gets today's behaviour, where guest data stays behind.
  if (!crypto?.subtle) {
    console.warn('Guest data claims need a secure context (https or localhost).');
    claimSupported = false;
    return;
  }

  const run = async (): Promise<void> => {
    const stored = readStored();
    const reuse = stored?.uid === user.uid;
    if (stored && !reuse) {
      // A record for some other uid: a previous migration that never finished,
      // on a session that has since been signed out of. It is unfinishable from
      // here (only that account may complete it), and this guest needs the slot.
      console.warn(`Replacing an unfinished guest claim record for ${stored.uid}.`);
    }

    // Re-snapshotted on every call, so a guest who opens this screen, backs out,
    // orders again and comes back still carries the full set.
    const orderIds = await listOwnOrderIds(user.uid).catch((error) => {
      console.error('Could not snapshot guest orders for the claim:', error);
      return reuse ? stored.orderIds : [];
    });

    if (reuse && stored.written) {
      writeStored({ ...stored, orderIds });
      return;
    }

    const secret = reuse ? stored.secret : randomSecretHex();
    // Hash first: a browser without crypto.subtle must not leave a half-written
    // record behind. Then store, then publish - a secret with no document is
    // merely unusable, whereas a document with no secret would strand the
    // guest's data for good, because create allows only one and no client can
    // ever read the document back to find out what it holds.
    const secretHash = await sha256Hex(secret);
    writeStored({ uid: user.uid, secret, orderIds, written: false, attempts: 0 });

    try {
      await setDoc(claimRef(user.uid), { secretHash, createdAt: serverTimestamp() });
    } catch (error) {
      // A retry whose document already exists lands here too, and there is no
      // way to tell the two apart: create allows exactly one per uid and
      // accountClaims is unreadable by design. When the secret came from
      // localStorage that existing document is still ours, so record it as
      // written instead of retrying on every visit.
      if (!reuse) throw error;
      console.warn('Guest claim already published; keeping the stored secret.');
    }
    writeStored({ uid: user.uid, secret, orderIds, written: true, attempts: 0 });
  };

  pendingEnsure = run();
  try {
    await pendingEnsure;
  } finally {
    pendingEnsure = null;
  }
};

// -------------------------------------------------------------- the account side

/**
 * Burns the claim so it can never be taken again.
 *
 * Used on the sign-up/link path, where Firebase kept the guest's uid and there
 * is nothing to migrate. Simply forgetting the secret is not enough on its own:
 * the claim document would outlive the upgrade, and anyone who had ever read S
 * off this device could later take it from another account and walk away with
 * what is now a real customer's order history. Taking it ourselves closes it
 * permanently - the rule allows exactly one take - and the delete is cleanup.
 */
const burnClaim = async (stored: StoredClaim, user: User): Promise<void> => {
  await updateDoc(claimRef(stored.uid), { claimedBy: user.uid, secret: stored.secret })
    .catch((error) => {
      console.warn('Could not take the stale guest claim:', error);
    });
  await deleteDoc(claimRef(stored.uid)).catch((error) => {
    console.warn('Could not delete the stale guest claim:', error);
  });
  clearStored();
};

/**
 * A batch is all-or-nothing, so a single order that cannot be moved - deleted
 * by an admin since the snapshot, or already reassigned by a run that died
 * between the commit and the acknowledgement - would otherwise strand every
 * other order in its chunk forever. Falling back to one write each costs a
 * round trip per order only in that rare case.
 */
const reassignOrders = async (orderIds: string[], newUid: string): Promise<number> => {
  let moved = 0;
  for (let i = 0; i < orderIds.length; i += ORDER_BATCH_LIMIT) {
    const chunk = orderIds.slice(i, i + ORDER_BATCH_LIMIT);
    const batch = writeBatch(firestore);
    // The dotted path matters: it rewrites the one field, leaving name, id and
    // table in place. Replacing the whole customerInfo map is refused by the
    // rule precisely so this cannot quietly drop the bar's own record.
    chunk.forEach((orderId) => batch.update(
      doc(firestore, 'orders', orderId), { 'customerInfo.uid': newUid },
    ));

    try {
      await batch.commit();
      moved += chunk.length;
    } catch (error) {
      console.error('Batched order reassignment failed; retrying one at a time:', error);
      for (const orderId of chunk) {
        try {
          await updateDoc(doc(firestore, 'orders', orderId), { 'customerInfo.uid': newUid });
          moved += 1;
        } catch (individual) {
          console.error(`Order ${orderId} could not be reassigned:`, individual);
        }
      }
    }
  }
  return moved;
};

interface MoveResult {
  copied: number;
  /** Non-zero keeps the claim alive so the next sign-in tries again. */
  failed: number;
}

/**
 * COLLISION RULE, for both favourites and ratings: the EXISTING account wins.
 *
 * The same combo can be favourited or rated on both sides - a customer who
 * rated Sunset Blend 5 on their account months ago and 3 as a guest tonight.
 * The entry under the account they are signing back into was made deliberately,
 * under the identity they are keeping; the guest copy is the incidental one.
 * Overwriting would silently rewrite a score they set themselves, and quietly
 * replace personalisation (strength, percentages, ice) on a saved build. So a
 * colliding guest entry is dropped, and only guest-only entries are added.
 *
 * The guest copy is deleted either way, so the dead uid is not left holding a
 * second copy of the customer's taste.
 *
 * Copy before delete, one item at a time, so an interrupted run can never lose
 * an entry: the worst it can leave behind is a guest copy that has already been
 * carried across, which the next run deletes.
 */
const copyFavorites = async (anonUid: string, newUid: string): Promise<MoveResult> => {
  let guestFavorites: Awaited<ReturnType<typeof listFavorites>>;
  let existing: Awaited<ReturnType<typeof listFavorites>>;
  try {
    [guestFavorites, existing] = await Promise.all([
      listFavorites(anonUid),
      listFavorites(newUid),
    ]);
  } catch (error) {
    // Reading the guest's list needs the claim, so this is also how "the take
    // did not work" shows up. Unknown how much is left, so report one failure
    // and let the retry find out.
    console.error('Could not read the favourites to move:', error);
    return { copied: 0, failed: 1 };
  }
  const mine = new Set(existing.map((favorite) => favorite.comboId));

  let copied = 0;
  let failed = 0;
  for (const favorite of guestFavorites) {
    try {
      if (!mine.has(favorite.comboId)) {
        // addFavorite re-stamps createdAt with serverTimestamp(), and has to:
        // the rule pins it to request.time, so the original date cannot be
        // carried over. "Saved on" becomes "moved on" for these entries.
        await addFavorite(newUid, favorite);
        copied += 1;
      }
      await removeFavorite(anonUid, favorite.comboId);
    } catch (error) {
      console.error(`Favourite ${favorite.comboId} could not be moved:`, error);
      failed += 1;
    }
  }
  return { copied, failed };
};

const copyRatings = async (anonUid: string, newUid: string): Promise<MoveResult> => {
  let guestRatings: Awaited<ReturnType<typeof listRatings>>;
  let existing: Awaited<ReturnType<typeof listRatings>>;
  try {
    [guestRatings, existing] = await Promise.all([
      listRatings(anonUid),
      listRatings(newUid),
    ]);
  } catch (error) {
    console.error('Could not read the ratings to move:', error);
    return { copied: 0, failed: 1 };
  }
  const mine = new Set(existing.map((rating) => rating.comboId));

  let copied = 0;
  let failed = 0;
  for (const rating of guestRatings) {
    try {
      // The rule takes an int from 1 to 5 and nothing else. A malformed score
      // would be a bare permission-denied that aborts nothing but itself, but
      // there is no point writing one: skip it and still clear the original.
      const valid = Number.isInteger(rating.score) && rating.score >= 1 && rating.score <= 5;
      if (valid && !mine.has(rating.comboId)) {
        await setDoc(doc(firestore, 'users', newUid, 'ratings', rating.comboId), {
          comboId: rating.comboId,
          label: truncateLabel(rating.label ?? ''),
          score: rating.score,
          // Re-stamped for the same reason favourites are: the rule pins this
          // to request.time.
          ratedAt: serverTimestamp(),
        });
        copied += 1;
      }
      await deleteDoc(doc(firestore, 'users', anonUid, 'ratings', rating.comboId));
    } catch (error) {
      console.error(`Rating ${rating.comboId} could not be moved:`, error);
      failed += 1;
    }
  }
  return { copied, failed };
};

const runClaim = async (newUser: User): Promise<ClaimSummary | null> => {
  // Whatever ensureGuestClaim is still doing has to land first, or this reads a
  // localStorage record that is not there yet.
  await pendingEnsure?.catch(() => undefined);

  const stored = readStored();
  if (!stored) return null;

  if (stored.uid === newUser.uid) {
    // The sign-up/link path: Firebase kept the guest's uid, so the data is
    // already on this account and there is nothing to move.
    await burnClaim(stored, newUser);
    return null;
  }

  if (stored.attempts >= MAX_ATTEMPTS) {
    console.error('Giving up on an unfinishable guest claim record.');
    clearStored();
    return null;
  }

  const anonUid = stored.uid;

  // Take the claim. On a resumed run this is DENIED, because claimedBy is
  // already set and a claim is single use - which is the point, and not a
  // reason to stop. The rules are the only judge of whether this account holds
  // the claim, and every step below is gated on that same check, so carrying on
  // after a failure here is safe: if we never held it, nothing moves.
  await updateDoc(claimRef(anonUid), { claimedBy: newUser.uid, secret: stored.secret })
    .catch((error) => {
      console.warn('Could not take the guest claim (already taken?):', error);
    });

  // Which orders still need moving. Read against the NEW uid, never the guest
  // one: the claim grants no read access to the orders collection, and the ones
  // a previous run already moved are this account's own now. That is what makes
  // a second run finish the job instead of re-writing what is already done -
  // and re-writing would not merely be wasteful, it would be DENIED, because a
  // moved order no longer points at a claim this account holds.
  //
  // If that read fails there is no way to tell moved from unmoved, so nothing
  // is attempted and everything stays outstanding. Treating a failed read as
  // "nothing left to do" would retire the claim over orders still sitting under
  // the dead uid, with the secret thrown away - unrecoverable.
  let alreadyMine: Set<string> | null = null;
  try {
    alreadyMine = new Set(await listOwnOrderIds(newUser.uid));
  } catch (error) {
    console.error('Could not list this account orders; leaving the claim in place:', error);
  }
  const pending = alreadyMine
    ? stored.orderIds.filter((orderId) => !alreadyMine.has(orderId))
    : stored.orderIds;
  const orders = alreadyMine && pending.length
    ? await reassignOrders(pending, newUser.uid)
    : 0;

  const favorites = await copyFavorites(anonUid, newUser.uid);
  const ratings = await copyRatings(anonUid, newUser.uid);

  const outstanding = (pending.length - orders) + favorites.failed + ratings.failed;

  // Local state goes last, and only once nothing is outstanding: while the
  // record survives the secret survives, and the next sign-in resumes from
  // here. Deleting the claim first and clearing localStorage after means an
  // interruption between the two leaves a dead secret and nothing worse.
  if (outstanding === 0) {
    await deleteDoc(claimRef(anonUid)).catch((error) => {
      console.warn('Could not delete the spent guest claim:', error);
    });
    clearStored();
  } else {
    console.error(`${outstanding} item(s) still to move; will retry on the next sign-in.`);
    // Counted only on a run that left something behind, so a clean migration
    // never spends an attempt, and a genuinely unmovable item cannot keep this
    // record (and its failed writes) alive forever.
    writeStored({ ...stored, attempts: stored.attempts + 1 });
  }

  return {
    orders,
    favorites: favorites.copied,
    ratings: ratings.copied,
    outstanding,
  };
};

let inFlight: { uid: string; promise: Promise<ClaimSummary | null> } | null = null;

/**
 * What the migration for this uid ended up doing, kept for the rest of the
 * session. AuthForms and AuthContext both ask, and whichever asks second would
 * otherwise re-read a localStorage record the first one has already cleared and
 * conclude there was nothing to move - reporting a successful migration to the
 * customer as "nothing needed moving". It also stops a run that left something
 * outstanding from immediately spending a second retry on the same page load;
 * resuming is for the NEXT one.
 */
let lastResult: { uid: string; summary: ClaimSummary | null } | null = null;

/**
 * Moves everything the guest left behind onto `newUser`, and reports what
 * actually moved. Returns null when there is nothing to claim.
 *
 * Safe to call after any successful sign-in: with no stored claim it costs
 * nothing, and when the uid did not change (the sign-up/link path) it burns the
 * stale claim rather than running a migration.
 *
 * Deduplicated by uid, the same way ensureSignedIn deduplicates the anonymous
 * bootstrap: AuthForms calls this on its success path and AuthContext calls it
 * again on the auth-state settle that follows, and they must not race each
 * other into a double migration.
 */
export const claimGuestData = (newUser: User): Promise<ClaimSummary | null> => {
  if (inFlight?.uid === newUser.uid) return inFlight.promise;
  if (lastResult?.uid === newUser.uid) return Promise.resolve(lastResult.summary);

  const promise = runClaim(newUser);
  inFlight = { uid: newUser.uid, promise };
  promise.then(
    (summary) => { lastResult = { uid: newUser.uid, summary }; },
    () => undefined,
  ).then(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  return promise;
};

/**
 * "3 orders, 2 favourites and 1 rating moved to your account." Null when there
 * is genuinely nothing to report, so the caller can fall back to its own copy.
 */
export const describeClaim = (summary: ClaimSummary | null): string | null => {
  if (!summary) return null;

  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;
  const parts: string[] = [];
  if (summary.orders) parts.push(plural(summary.orders, 'order'));
  if (summary.favorites) parts.push(plural(summary.favorites, 'favourite'));
  if (summary.ratings) parts.push(plural(summary.ratings, 'rating'));

  if (!parts.length) {
    return summary.outstanding
      ? 'We could not move your guest data over just now - we will try again next time you sign in.'
      : null;
  }

  const list = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return summary.outstanding
    ? `${list} from this device moved to your account; the rest will follow next time you sign in.`
    : `${list} from this device moved to your account.`;
};
