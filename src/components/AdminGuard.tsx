import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";

interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { loggedIn, hasAdminRights } = useAuth();

  if (!loggedIn || !hasAdminRights) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};