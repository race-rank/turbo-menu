import {
  GoogleAuthProvider,
  EmailAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  linkWithPopup,
  linkWithCredential,
  updateProfile,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export class AccountExistsError extends Error {
  constructor() {
    super('An account already exists for those credentials.');
    this.name = 'AccountExistsError';
  }
}

const isAlreadyInUse = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error &&
  (error as { code: string }).code === 'auth/credential-already-in-use';

export const ensureSignedIn = async (): Promise<User> => {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
};

/**
 * Upgrade the current anonymous user to a Google account, keeping the same uid
 * so orders placed as a guest become this account's history.
 *
 * When the Google account already exists we cannot merge - reassigning order
 * documents requires admin rights - so we sign into the existing account and
 * surface AccountExistsError for the caller to explain.
 */
export const signUpWithGoogle = async (): Promise<User> => {
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      const result = await linkWithPopup(current, new GoogleAuthProvider());
      return result.user;
    } catch (error) {
      if (!isAlreadyInUse(error)) throw error;
      const fallback = await signInWithPopup(auth, new GoogleAuthProvider());
      throw Object.assign(new AccountExistsError(), { user: fallback.user });
    }
  }
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
};

export const signUpWithEmail = async (
  email: string, password: string, displayName: string,
): Promise<User> => {
  const current = auth.currentUser;
  let user: User;

  if (current?.isAnonymous) {
    try {
      const result = await linkWithCredential(
        current, EmailAuthProvider.credential(email, password),
      );
      user = result.user;
    } catch (error) {
      if (!isAlreadyInUse(error)) throw error;
      const fallback = await signInWithEmailAndPassword(auth, email, password);
      throw Object.assign(new AccountExistsError(), { user: fallback.user });
    }
  } else {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    user = result.user;
  }

  if (displayName) await updateProfile(user, { displayName });
  // Sent, but deliberately not gated on - see the spec.
  await sendEmailVerification(user).catch(() => undefined);
  return user;
};

export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const resetPassword = (email: string): Promise<void> =>
  sendPasswordResetEmail(auth, email);

/** Signing out returns the visitor to a fresh anonymous session, not to nothing. */
export const logout = async (): Promise<void> => {
  await signOut(auth);
  await signInAnonymously(auth);
};
