import { useNavigate } from 'react-router-dom';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminSession } from '@/contexts/AdminSessionContext';
import { logout } from '@/services/authService';

/**
 * The red bar that says the back office has stopped being live.
 *
 * Sticky and in normal flow, so it pushes the page down rather than covering
 * the order list's controls on a tablet, and it stays until the problem is
 * gone - a toast that vanishes in seconds is what let orders go missed.
 */
export const AdminSessionBanner = () => {
  const { status, recheck } = useAdminSession();
  const navigate = useNavigate();

  if (status === 'ok') return null;

  const expired = status === 'expired';

  const signInAgain = async () => {
    // Sign out first: when the SDK still holds the dead user (it keeps it on
    // auth/invalid-user-token, and on a permission-denied listener), the login
    // page would see isAdmin === true and bounce straight back here.
    await logout().catch(() => undefined);
    navigate('/hookah-bar-admin', { replace: true, state: { reason: 'expired' } });
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 bg-red-600 px-4 py-3 text-white shadow-lg"
    >
      <div className="flex items-start gap-3">
        {expired ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div>
          <p className="font-bold">
            {expired ? 'Session expired — sign in again' : 'Connection lost — orders may be out of date'}
          </p>
          <p className="text-sm text-white/90">
            {expired
              ? 'Orders are not updating and new orders will not ring.'
              : 'Orders are not updating. Retrying automatically.'}
          </p>
        </div>
      </div>
      {expired ? (
        <Button
          onClick={signInAgain}
          className="bg-white text-red-700 hover:bg-white/90 font-semibold"
        >
          Sign in again
        </Button>
      ) : (
        <Button
          onClick={recheck}
          variant="outline"
          className="border-white bg-transparent text-white hover:bg-white/10 hover:text-white font-semibold"
        >
          Retry now
        </Button>
      )}
    </div>
  );
};
