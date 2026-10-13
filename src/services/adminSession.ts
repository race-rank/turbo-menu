/**
 * Pure helpers behind the admin session banner and the live orders feed.
 *
 * No Firebase runtime import on purpose, so this stays unit testable without
 * an emulator - the same reason hookahOfTheDay.ts and comboId.ts are shaped
 * this way.
 */

/**
 * What a failure means for staff at the tablet:
 * - 'expired': the session can no longer authenticate. Only a fresh sign-in
 *   fixes it, so the banner stays until they do.
 * - 'offline': the network is the problem. The session itself is fine, so the
 *   banner clears on its own once a later check succeeds.
 * - 'unknown': anything else.
 */
export type SessionErrorKind = 'expired' | 'offline' | 'unknown';

// Auth codes come prefixed ('auth/...'); Firestore codes come bare.
const EXPIRED_CODES = new Set([
  // Refresh token expired or revoked (password change, manual revoke).
  'auth/user-token-expired',
  // Refresh token malformed or rejected. Unlike the two codes either side of
  // it, the SDK does NOT sign the user out on this one, so without the banner
  // the tablet keeps a user whose every request fails.
  'auth/invalid-user-token',
  'auth/user-disabled',
  // Account deleted.
  'auth/user-not-found',
  // Security rules rejected the read: the request no longer carries a token
  // with the admin claim.
  'permission-denied',
  'unauthenticated',
]);

const OFFLINE_CODES = new Set([
  'auth/network-request-failed',
  'auth/timeout',
  'unavailable',
  'deadline-exceeded',
]);

export const classifySessionError = (code: string | null | undefined): SessionErrorKind => {
  if (!code) return 'unknown';
  const normalised = code.startsWith('firestore/') ? code.slice('firestore/'.length) : code;
  if (EXPIRED_CODES.has(normalised)) return 'expired';
  if (OFFLINE_CODES.has(normalised)) return 'offline';
  return 'unknown';
};

/** The `code` of a FirebaseError/FirestoreError, or undefined for anything else. */
export const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
};

/**
 * Split a snapshot of the orders feed into the orders nobody has been told
 * about yet, and the ids to remember for the next snapshot.
 *
 * `known === null` means "nothing seen yet in this tab": the first snapshot is
 * the baseline, so opening the dashboard doesn't announce the whole backlog.
 * After that `known` is carried across resubscriptions, so a feed that comes
 * back after a dead session announces exactly the orders that arrived while it
 * was down - once - and stays quiet about the ones already on screen.
 */
export const diffNewOrders = <T extends { orderId: string }>(
  known: ReadonlySet<string> | null,
  orders: T[],
): { fresh: T[]; known: Set<string> } => {
  const next = new Set(orders.map((order) => order.orderId));
  if (known === null) return { fresh: [], known: next };
  return { fresh: orders.filter((order) => !known.has(order.orderId)), known: next };
};
