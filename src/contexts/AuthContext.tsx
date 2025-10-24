import React, { createContext, useContext, useState, ReactNode } from 'react';
import { validateAdminCredentials } from '@/services/firebaseService';

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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasAdminRights, setHasAdminRights] = useState(false);

  const login = async (username: string, password: string): Promise<boolean> => {
    const valid = await validateAdminCredentials(username, password);
    if (valid) {
      setLoggedIn(true);
      setHasAdminRights(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setLoggedIn(false);
    setHasAdminRights(false);
  };

  return (
    <AuthContext.Provider value={{ loggedIn, hasAdminRights, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
