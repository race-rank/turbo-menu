import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { classifySessionError, errorCode } from '@/services/adminSession';

/**
 * Health of the admin's session, as far as the back office can tell.
 *
 * Exists because a dead session used to be invisible: the orders listener
 * errored once, a toast flashed for a few seconds, and the dashboard kept
 * showing its last list - indistinguishable from a quiet night - while new
 * orders went unannounced.
 */
export type AdminSessionStatus = 'ok' | 'expired' | 'offline';

interface AdminSessionContextType {
  status: AdminSessionStatus;
  /** Feed a Firebase/Firestore failure in; it is classified here. */
  reportError: (error: unknown) => void;
  /** Re-run the token check now (the banner's "Retry now"). */
  recheck: () => void;
  /**
   * Bumps every time the session recovers from 'offline'. Listeners key their
   * subscription effect on it: a Firestore listener that errored is dead for
   * good, so recovery has to mean a fresh subscription.
   */
  retryToken: number;
}

// Outside the provider everything is a no-op, so a page rendered without
// AdminGuard degrades to the old behaviour instead of crashing.
const AdminSessionContext = createContext<AdminSessionContextType>({
  status: 'ok',
  reportError: () => undefined,
  recheck: () => undefined,
  retryToken: 0,
});

export const useAdminSession = () => useContext(AdminSessionContext);

/**
 * How often to force a token refresh while an admin page is open. The SDK's
 * own refresh runs roughly hourly and fails silently; this catches a dead
 * session within minutes even when no listener traffic would reveal it.
 */
const CHECK_INTERVAL_MS = 3 * 60 * 1000;

export const AdminSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [status, setStatusState] = useState<AdminSessionStatus>('ok');
  const [retryToken, setRetryToken] = useState(0);

  // Mirrors `status` synchronously so the async check and the stable
  // callbacks below never act on a stale closure.
  const statusRef = useRef<AdminSessionStatus>('ok');
  const setStatus = useCallback((next: AdminSessionStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const reportError = useCallback((error: unknown) => {
    const kind = classifySessionError(errorCode(error));
    if (kind === 'expired') {
      setStatus('expired');
      return;
    }
    // 'offline' and 'unknown' both mean "the feed may be dead but signing in
    // again won't help": show the connection banner and let the next good
    // check resubscribe. Never downgrade an expired session to offline.
    if (statusRef.current !== 'expired') setStatus('offline');
  }, [setStatus]);

  const userRef = useRef(user);
  userRef.current = user;
  const checking = useRef(false);

  const check = useCallback(async () => {
    const current = userRef.current;
    // Expired is sticky: only a fresh sign-in clears it, which remounts this
    // provider anyway.
    if (!current || checking.current || statusRef.current === 'expired') return;
    checking.current = true;
    try {
      // Forced refresh: a cached token would happily report a revoked session
      // as healthy for up to an hour.
      const result = await current.getIdTokenResult(true);
      if (userRef.current !== current) return;
      if (result.claims?.admin !== true) {
        // Admin revoked is session lost too. AuthContext sees the same token
        // via onIdTokenChanged and AdminGuard will redirect; this just makes
        // sure the banner is right in the meantime.
        setStatus('expired');
        return;
      }
      if (statusRef.current === 'offline') {
        setStatus('ok');
        setRetryToken((token) => token + 1);
      }
    } catch (error) {
      if (userRef.current !== current) return;
      console.error('Admin session check failed:', error);
      reportError(error);
    } finally {
      checking.current = false;
    }
  }, [reportError, setStatus]);

  const recheck = useCallback(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (!user) return;
    // Once on mount: covers a tablet reloaded onto a session the SDK kept but
    // can no longer refresh.
    void check();
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    // Tablets sleep; timers don't run while they do. Check the moment the
    // screen comes back, and the moment the network does.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onOnline = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [user, check]);

  return (
    <AdminSessionContext.Provider value={{ status, reportError, recheck, retryToken }}>
      {children}
    </AdminSessionContext.Provider>
  );
};
