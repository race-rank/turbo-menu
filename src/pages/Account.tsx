import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForms } from '@/components/auth/AuthForms';
import { logout, updateDisplayName } from '@/services/authService';
import { getAccountSummary, upsertUserProfile, type AccountSummary } from '@/services/userService';
import { toast } from '@/hooks/use-toast';

const Account: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();

  const signedIn = !!user && !isAnonymous;

  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  // Mirrored locally because updateProfile mutates the User in place without
  // firing an auth-state event, so the context value never changes identity.
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!signedIn || !user) return;
    setName(user.displayName ?? '');
    setLoadingSummary(true);
    getAccountSummary(user.uid)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false));
  }, [signedIn, user]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: 'Name cannot be empty', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateDisplayName(trimmed);
      await upsertUserProfile(updated);
      setEditing(false);
      toast({ title: 'Name updated' });
    } catch (error) {
      toast({ title: 'Could not save your name', description: String(error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const memberSince = summary?.memberSince
    ? summary.memberSince.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    // pb-24 clears the OrderStatusTracker, which App.tsx pins to the bottom of
    // every page while an order is live.
    <div className="min-h-screen pb-24">
      {/* Outside the loading branch on purpose: an early return here used to
          take the navigation menu with it while auth resolved. */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <NavigationSidebar />
        <h1 className="text-2xl font-bold tracking-wider">
          {signedIn ? 'PROFILE' : 'ACCOUNT'}
        </h1>
        {/* Balances the menu button so the title stays centred. */}
        <div className="w-10" />
      </header>

      <div className="px-4 py-8">
        {loading ? (
          <p className="text-turbo-muted text-center">Loading…</p>
        ) : signedIn ? (
          <div className="w-full max-w-md mx-auto space-y-4">
            <Card className="bg-turbo-card border-border">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                    {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <div className="flex gap-2">
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          aria-label="Display name"
                          autoFocus
                        />
                        <Button size="sm" onClick={saveName} disabled={saving}>
                          Save
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-lg font-bold">
                          {user.displayName || 'No name set'}
                        </p>
                        <p className="truncate text-sm text-turbo-muted">{user.email}</p>
                      </>
                    )}
                  </div>
                  {!editing && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <div>
                    <p className="text-xs uppercase text-turbo-muted">Orders</p>
                    {loadingSummary
                      ? <Skeleton className="mt-1 h-6 w-10" />
                      : <p className="text-xl font-bold">{summary?.orderCount ?? 0}</p>}
                  </div>
                  <div>
                    <p className="text-xs uppercase text-turbo-muted">Total spent</p>
                    {loadingSummary
                      ? <Skeleton className="mt-1 h-6 w-20" />
                      : <p className="text-xl font-bold text-amber-400">
                          {summary?.totalSpent ?? 0} Lei
                        </p>}
                  </div>
                </div>

                {/* Hidden rather than shown as "unknown": accounts created
                    before createdAt was recorded genuinely have no join date. */}
                {memberSince && (
                  <p className="mt-4 text-xs text-turbo-muted">Member since {memberSince}</p>
                )}
              </CardContent>
            </Card>

            <Button className="w-full" onClick={() => navigate('/my-orders')}>
              My orders
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <Card className="w-full max-w-md mx-auto bg-turbo-card border-border">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-2 text-center">Create your account</h2>
              <p className="text-sm text-turbo-muted mb-6 text-center">
                Keep your order history and get offers. Orders you already placed on this
                device come with you.
              </p>
              <AuthForms onDone={() => navigate('/my-orders')} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Account;
