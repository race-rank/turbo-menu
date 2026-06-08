import React, { createContext, useContext, useState, ReactNode } from 'react';
import { validateAdminCredentials } from '@/services/firebaseService';

const AUTH_KEY = 'turbo-admin-auth';

interface AuthContextType {
  loggedIn: boolean;
  hasAdminRights: boolean;
  logout: () => void;
  login: (username: string, password: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const readPersistedAuth = () => {
  try {
    return sessionStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return false;
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const initial = readPersistedAuth();
  const [loggedIn, setLoggedIn] = useState(initial);
  const [hasAdminRights, setHasAdminRights] = useState(initial);

  const login = async (username: string, password: string): Promise<boolean> => {
    const valid = await validateAdminCredentials(username, password);
    if (valid) {
      setLoggedIn(true);
      setHasAdminRights(true);
      try { sessionStorage.setItem(AUTH_KEY, '1'); } catch {}
      return true;
    }
    return false;
  };

  const logout = () => {
    setLoggedIn(false);
    setHasAdminRights(false);
    try { sessionStorage.removeItem(AUTH_KEY); } catch {}
  };

  return (
    <AuthContext.Provider value={{ loggedIn, hasAdminRights, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
