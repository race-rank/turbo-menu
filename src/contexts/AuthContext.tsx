import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ensureSignedIn } from '@/services/authService';

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
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAnonymous, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
