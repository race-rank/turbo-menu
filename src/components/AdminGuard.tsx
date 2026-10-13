import React, { useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";
import { AdminSessionProvider } from "@/contexts/AdminSessionContext";
import { AdminSessionBanner } from "@/components/AdminSessionBanner";

interface AdminGuardProps {
  children: React.ReactNode;
}

/** Router state AdminLogin reads to explain why staff landed there. */
export type AdminLoginReason = 'expired' | 'required';

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { isAdmin, loading } = useAuth();
  // Whether this page was ever open as admin. Losing the claim after that is
  // a session that died under staff's hands, not a stranger typing /admin.
  const wasAdmin = useRef(false);
  if (isAdmin) wasAdmin.current = true;

  // Without this the guard redirects before the token has been read.
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <p className="text-turbo-muted">Loading…</p>
    </div>;
  }

  if (!isAdmin) {
    // To the admin login, never the customer menu: a dead session used to
    // drop staff onto '/' with a fresh anonymous session and no explanation.
    const reason: AdminLoginReason = wasAdmin.current ? 'expired' : 'required';
    return <Navigate to="/hookah-bar-admin" replace state={{ reason }} />;
  }

  return (
    <AdminSessionProvider>
      <AdminSessionBanner />
      {children}
    </AdminSessionProvider>
  );
};
