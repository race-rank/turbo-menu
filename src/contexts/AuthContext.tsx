import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (next) => {
      if (!next) {
        // No session yet: create an anonymous one. onAuthStateChanged fires again.
        setIsAdmin(false);
        setUser(null);
        await ensureSignedIn().catch(() => undefined);
        setLoading(false);
        return;
      }

      // Claims live on the token, never in a readable document.
      const token = await next.getIdTokenResult().catch(() => null);
      setIsAdmin(token?.claims?.admin === true);
      setUser(next);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAnonymous: user?.isAnonymous ?? false, isAdmin, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};
