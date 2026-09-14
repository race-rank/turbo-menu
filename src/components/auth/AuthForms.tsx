import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  signUpWithGoogle, signUpWithEmail, signInWithEmail, resetPassword, AccountExistsError,
} from '@/services/authService';
import { upsertUserProfile } from '@/services/userService';
import { useAuth } from '@/contexts/AuthContext';
import {
  claimGuestData, describeClaim, ensureGuestClaim, isGuestClaimSupported,
} from '@/services/accountClaimService';

type Mode = 'signup' | 'signin';

export const AuthForms: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  // The anonymous guest, for as long as this card is on screen. Account.tsx
  // only renders it while nobody is signed in.
  const { user: guest } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  // Publish the guest's claim now, while the anonymous session still exists.
  // Afterwards its uid is gone, and with it both the right to create the claim
  // document and the only chance to read which orders this device placed.
  //
  // On mount rather than inside the button handlers: a Firestore round trip
  // between the click and signInWithPopup spends the user activation the
  // browser needs to open a popup, which is exactly the bug authService's
  // signUpWithGoogle carries a long comment about. Mounting is early enough
  // that this has settled long before anyone finishes typing a password.
  //
  // Non-fatal. Without a claim the customer simply gets the old behaviour,
  // where guest data stays behind - never a broken sign-in card.
  useEffect(() => {
    ensureGuestClaim(guest).catch((error) => {
      console.error('Could not prepare the guest data claim:', error);
    });
  }, [guest]);

  /**
   * Runs after every successful sign-in, by whichever route.
   *
   * Deliberately non-fatal, and for the same reason upsertPublicProfile is:
   * the account IS signed in by the time this runs, and a failed follow-up
   * write reported as a failed sign-in is a bug this codebase has already
   * shipped once. A no-op when the uid survived (sign-up and link), when there
   * is no guest data, or when the claim was never taken.
   */
  const claim = (signedIn: User) =>
    claimGuestData(signedIn).catch((error) => {
      console.error('Claiming guest data failed:', error);
      return null;
    });

  // The already-exists fallback signs into the OTHER, pre-existing account
  // (see signUpWithGoogle/signUpWithEmail), and that account never runs
  // through the upsert above it - so without this call a customer hitting
  // this path stayed nameless to friends until their next explicit sign-in.
  // Non-fatal like every other upsertUserProfile call site: this is already
  // the success path (the account IS signed in), so a profile-sync failure
  // must not turn "signed in to your existing account" into an error toast.
  //
  // This is also the path where the uid genuinely changes, so it is where the
  // guest migration earns its keep - and where the toast used to apologise for
  // not having one.
  const handleExisting = async (error: unknown): Promise<boolean> => {
    if (!(error instanceof AccountExistsError)) return false;
    const existing = (error as AccountExistsError & { user?: User }).user;
    let moved: string | null = null;
    if (existing) {
      await upsertUserProfile(existing).catch((syncError) => {
        console.error('Profile sync failed for existing account:', syncError);
      });
      moved = describeClaim(await claim(existing));
    }
    toast({
      title: 'Signed in to your existing account',
      // Never the old blanket apology. Either we say what moved, or we say the
      // one other thing that is actually true here - and the two cases are not
      // the same: over plain http there is no crypto.subtle to hash a claim
      // secret with, so the migration was never on offer in the first place.
      description: moved ?? (isGuestClaimSupported()
        ? 'Nothing from this device needed moving over.'
        : 'Anything you did as a guest on this device stays with the guest session.'),
    });
    onDone();
    return true;
  };

  const runGoogle = async () => {
    setBusy(true);
    try {
      const signedIn = await signUpWithGoogle();
      await upsertUserProfile(signedIn);
      const moved = describeClaim(await claim(signedIn));
      toast({
        title: 'Welcome!',
        description: moved ?? 'Your order history is saved to this account.',
      });
      onDone();
    } catch (error) {
      if (!(await handleExisting(error))) {
        toast({ title: 'Google sign-in failed', description: String(error), variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  const runEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const signedIn = mode === 'signup'
        ? await signUpWithEmail(email, password, displayName)
        : await signInWithEmail(email, password);
      await upsertUserProfile(signedIn);
      // Plain sign-in never raises AccountExistsError - signInWithEmail just
      // lands on the other account, under a new uid - so this, not only
      // handleExisting, is an everyday route by which guest data is orphaned.
      const moved = describeClaim(await claim(signedIn));
      toast({
        title: mode === 'signup' ? 'Account created' : 'Welcome back',
        ...(moved ? { description: moved } : {}),
      });
      onDone();
    } catch (error) {
      if (!(await handleExisting(error))) {
        toast({ title: 'Could not continue', description: String(error), variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button onClick={runGoogle} disabled={busy} className="w-full">
        Continue with Google
      </Button>

      <div className="text-center text-xs text-turbo-muted">or</div>

      <form onSubmit={runEmail} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={6} value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <div className="flex justify-between text-xs">
        <button type="button" className="text-turbo-muted underline"
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
          {mode === 'signup' ? 'I already have an account' : 'Create an account'}
        </button>
        <button type="button" className="text-turbo-muted underline"
          onClick={async () => {
            if (!email) {
              toast({ title: 'Enter your email first', variant: 'destructive' });
              return;
            }
            await resetPassword(email);
            toast({ title: 'Reset email sent' });
          }}>
          Forgot password?
        </button>
      </div>
    </div>
  );
};
