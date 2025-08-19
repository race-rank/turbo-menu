import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextType {
  loggedIn: boolean;
  hasAdminRights: boolean;
  logout: () => void;
  login: (username: string, password: string) => boolean;
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

  const login = (username: string, password: string): boolean => {
    if (username === 'admin' && password === 'turbo') {
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
