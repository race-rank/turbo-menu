import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { getPublicProfile } from '@/services/profileService';
import {
  FriendRequestConflictError, acceptFriendRequest, ensureInviteCode, findByEmail,
  getDiscoverable, listFriendships, removeFriendship, resolveInviteCode,
  sendFriendRequest, setDiscoverable, type Friendship,
} from '@/services/friendsService';

interface FriendRow extends Friendship {
  displayName: string | null;
}

const Friends: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<FriendRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [discoverable, setDiscoverableState] = useState(false);

  const signedIn = !!user && !isAnonymous;

  const refresh = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const friendships = await listFriendships(user.uid);
      const withNames = await Promise.all(friendships.map(async (friendship) => ({
        ...friendship,
        displayName: (await getPublicProfile(friendship.otherUid).catch(() => null))?.displayName ?? null,
      })));
      setRows(withNames);
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => { if (signedIn) void refresh(); }, [signedIn, refresh]);

  useEffect(() => {
    if (!signedIn || !user) return;
    ensureInviteCode(user).then(setInviteCode).catch(() => setInviteCode(''));
    // Without this the switch renders off for someone who already opted in,
    // and flipping it would write the value it already had.
    getDiscoverable(user.uid).then(setDiscoverableState).catch(() => setDiscoverableState(false));
  }, [signedIn, user]);

  // Arriving from someone's invite link.
  useEffect(() => {
    const code = searchParams.get('code');
    if (!code || !signedIn || !user) return;
    (async () => {
      const target = await resolveInviteCode(code);
      setSearchParams({});
      if (!target) {
        toast({ title: 'That invite link is not valid', variant: 'destructive' });
        return;
      }
      await request(target.uid, target.displayName);
    })();
  }, [searchParams, signedIn, user]);

  const request = async (otherUid: string, name: string | null) => {
    if (!user) return;
    try {
      await sendFriendRequest(user.uid, otherUid);
      toast({ title: `Request sent to ${name ?? 'them'}` });
    } catch (error) {
      if (error instanceof FriendRequestConflictError) {
        // Both people tapped at once, or one already asked. Not an error.
        toast({
          title: error.existing.requestedBy === user.uid
            ? 'You already asked them'
            : `${name ?? 'They'} already asked you - accept below`,
        });
      } else {
        toast({ title: 'Could not send that request', description: String(error), variant: 'destructive' });
      }
    }
    await refresh();
  };

  const search = async () => {
    if (!email.trim() || !user) return;
    try {
      const found = await findByEmail(email);
      if (!found) {
        // Deliberately the same message whether nobody has that address or the
        // person has not opted in - the difference is exactly what email search
        // must not reveal.
        toast({ title: 'No one found with that email' });
        return;
      }
      if (found.uid === user.uid) {
        toast({ title: 'That is you' });
        return;
      }
      await request(found.uid, found.displayName);
      setEmail('');
    } catch (error) {
      toast({ title: 'Search failed', description: String(error), variant: 'destructive' });
    }
  };

  const inviteUrl = inviteCode ? `${window.location.origin}/friends?code=${inviteCode}` : '';
  const incoming = rows.filter((r) => r.status === 'pending' && r.requestedBy !== user?.uid);
  const outgoing = rows.filter((r) => r.status === 'pending' && r.requestedBy === user?.uid);
  const accepted = rows.filter((r) => r.status === 'accepted');

  return (
    <div className="min-h-screen pb-24">
      <header className="flex items-center justify-between border-b border-border p-4">
        <NavigationSidebar />
        <h1 className="text-2xl font-bold tracking-wider">FRIENDS</h1>
        <div className="w-10" />
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        {loading ? (
          <p className="text-center text-turbo-muted">Loading…</p>
        ) : !signedIn ? (
          <Card className="border-primary bg-turbo-card">
            <CardContent className="p-6 text-center">
              <p className="mb-4 text-sm">Friends need an account.</p>
              <Button className="w-full" onClick={() => navigate('/account')}>
                Create an account
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bg-turbo-card border-border">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-bold uppercase text-turbo-muted">Your invite link</h2>
                <p className="break-all font-mono text-xs">{inviteUrl || '…'}</p>
                <Button
                  variant="outline" className="w-full" disabled={!inviteUrl}
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteUrl);
                    toast({ title: 'Link copied' });
                  }}
                >
                  Copy link
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-turbo-card border-border">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-bold uppercase text-turbo-muted">Find by email</h2>
                <div className="flex gap-2">
                  <Input
                    type="email" value={email} aria-label="Friend's email"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button onClick={search}>Find</Button>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <Label htmlFor="discoverable" className="text-sm">
                    Let people find me by email
                  </Label>
                  <Switch
                    id="discoverable" checked={discoverable}
                    onCheckedChange={async (checked) => {
                      if (!user) return;
                      try {
                        await setDiscoverable(user, checked);
                        setDiscoverableState(checked);
                      } catch (error) {
                        toast({ title: 'Could not change that', description: String(error), variant: 'destructive' });
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-turbo-muted">
                  Off by default. While it is off, nobody can find you by email.
                </p>
              </CardContent>
            </Card>

            {busy ? <Skeleton className="h-24 w-full" /> : (
              <>
                {incoming.length > 0 && (
                  <Card className="border-primary bg-turbo-card">
                    <CardContent className="space-y-2 p-4">
                      <h2 className="text-sm font-bold uppercase text-turbo-muted">Requests</h2>
                      {incoming.map((row) => (
                        <div key={row.pairId} className="flex items-center gap-2">
                          <span className="flex-1 truncate">{row.displayName ?? 'Someone'}</span>
                          <Button size="sm" onClick={async () => {
                            await acceptFriendRequest(row.pairId); await refresh();
                          }}>Accept</Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            await removeFriendship(row.pairId); await refresh();
                          }}>Decline</Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card className="bg-turbo-card border-border">
                  <CardContent className="space-y-2 p-4">
                    <h2 className="text-sm font-bold uppercase text-turbo-muted">
                      Friends ({accepted.length})
                    </h2>
                    {accepted.length === 0 && <p className="text-sm text-turbo-muted">No friends yet.</p>}
                    {accepted.map((row) => (
                      <div key={row.pairId} className="flex items-center gap-2">
                        <button
                          type="button"
                          className="flex-1 truncate text-left underline"
                          onClick={() => navigate(`/friends/${row.otherUid}`)}
                        >
                          {row.displayName ?? 'Friend'}
                        </button>
                        <Button size="sm" variant="ghost" onClick={async () => {
                          await removeFriendship(row.pairId); await refresh();
                        }}>Remove</Button>
                      </div>
                    ))}
                    {outgoing.map((row) => (
                      <p key={row.pairId} className="text-sm text-turbo-muted">
                        {row.displayName ?? 'Someone'} — request sent
                      </p>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Friends;
