import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  signUpWithGoogle, signUpWithEmail, signInWithEmail, resetPassword, AccountExistsError,
} from '@/services/authService';
import { upsertUserProfile } from '@/services/userService';

type Mode = 'signup' | 'signin';

export const AuthForms: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleExisting = (error: unknown): boolean => {
    if (!(error instanceof AccountExistsError)) return false;
    toast({
      title: 'Signed in to your existing account',
      description: 'Orders placed as a guest on this device could not be moved over.',
    });
    onDone();
    return true;
  };

  const runGoogle = async () => {
    setBusy(true);
    try {
      const user = await signUpWithGoogle();
      await upsertUserProfile(user);
      toast({ title: 'Welcome!', description: 'Your order history is saved to this account.' });
      onDone();
    } catch (error) {
      if (!handleExisting(error)) {
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
      const user = mode === 'signup'
        ? await signUpWithEmail(email, password, displayName)
        : await signInWithEmail(email, password);
      await upsertUserProfile(user);
      toast({ title: mode === 'signup' ? 'Account created' : 'Welcome back' });
      onDone();
    } catch (error) {
      if (!handleExisting(error)) {
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
