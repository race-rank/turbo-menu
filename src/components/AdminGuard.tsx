import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";

interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { isAdmin, loading } = useAuth();

  // Without this the guard redirects before the token has been read.
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <p className="text-turbo-muted">Loading…</p>
    </div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
