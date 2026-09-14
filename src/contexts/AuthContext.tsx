import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ensureSignedIn } from '@/services/authService';
import { upsertPublicProfile } from '@/services/profileService';

interface AuthContextType {
  user: User | null;
  isAnonymous: boolean;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // Held as its own state, never derived from `user`: linking an anonymous
  // account mutates the SAME UserImpl instance in place, so setUser(next) is
  // Object.is-equal to the current state and React bails out of re-rendering.
  // A false/true flip is a real value change, so it forces the render.
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // uids that have already had a profiles/{uid} backfill attempted this
  // session. onIdTokenChanged also fires on the hourly token refresh, and a
  // customer base of mostly-persistent anonymous/real sessions means an
  // unconditional write here would bill a setDoc on every single app load
  // for every real customer, forever. One attempt per uid per session is
  // enough - the explicit upsert on sign-in/sign-up/rename covers the rest.
  const profileBackfillAttempted = useRef(new Set<string>());

  useEffect(() => {
    // onIdTokenChanged, NOT onAuthStateChanged: the SDK's notifyAuthListeners
    // only pushes to auth-state listeners when the uid changes, and linking a
    // guest to a real account deliberately keeps the uid, so the upgrade would
    // never reach the UI. Id-token listeners are notified unconditionally.
    const unsubscribe = onIdTokenChanged(auth, async (next) => {
      if (!next) {
        // No session yet: create an anonymous one. The listener fires again.
        setIsAdmin(false);
        setIsAnonymous(false);
        setUser(null);
        await ensureSignedIn().catch(() => undefined);
        setLoading(false);
        return;
      }

      // Claims live on the token, never in a readable document.
      const token = await next.getIdTokenResult().catch(() => null);
      setIsAdmin(token?.claims?.admin === true);
      setIsAnonymous(next.isAnonymous);
      setUser(next);
      setLoading(false);

      // Backfill for every real account that predates profiles/{uid}, or
      // that hit the AccountExistsError/upsert-failure edge cases: without
      // this, a customer who signed up once and never signs in again stays
      // nameless to friends forever, since the explicit upsert only runs on
      // an explicit sign-in, sign-up or rename. Never for guests - that
      // would hand every anonymous visitor a profile document that friends
      // (a real-account-only feature) should never see. Fire-and-forget and
      // non-fatal: this must never delay or fail an auth-state settle, the
      // same reasoning upsertUserProfile documents for its own internal
      // call to this function.
      if (!next.isAnonymous && !profileBackfillAttempted.current.has(next.uid)) {
        profileBackfillAttempted.current.add(next.uid);
        upsertPublicProfile(next).catch((error) => {
          console.error('Public profile backfill failed:', error);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAnonymous, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
