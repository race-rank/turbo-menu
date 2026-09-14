import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  rotateInviteCode, sendFriendRequest, setDiscoverable, type Friendship,
} from '@/services/friendsService';

interface FriendRow extends Friendship {
  displayName: string | null;
}

/**
 * Where an invite code waits out a sign-up.
 *
 * A guest who scans a friend's QR at the table has no account yet, so the code
 * cannot be redeemed on arrival. Account.tsx finishes by sending them to
 * /my-orders, and the ?code= query param does not survive that round trip, so
 * the code is parked here on the way out and picked up the next time this page
 * mounts with a real account. sessionStorage rather than localStorage: an
 * invite should not outlive the visit it arrived in.
 *
 * All three helpers are wrapped because Safari in private mode throws on
 * storage access rather than no-opping, and a lost invite must not take the
 * page down with it.
 */
const PENDING_INVITE_KEY = 'turbo-pending-invite';

const readPendingInvite = (): string | null => {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
};

const writePendingInvite = (code: string): void => {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // Nothing to do: the link in the URL still works if they come back to it.
  }
};

const clearPendingInvite = (): void => {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Same.
  }
};

const Friends: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<FriendRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteError, setInviteError] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [discoverable, setDiscoverableState] = useState(false);
  const [pendingPairId, setPendingPairId] = useState<string | null>(null);

  // Ref as well as state: two taps landing in the same tick both read the same
  // pre-render value of pendingPairId, so the state is what disables the
  // button and the ref is what actually stops the second write.
  const mutating = useRef(false);
  const nameCache = useRef(new Map<string, string | null>());
  const consumedInvite = useRef<string | null>(null);
  const linkRef = useRef<HTMLParagraphElement>(null);

  const signedIn = !!user && !isAnonymous;
  const paramCode = searchParams.get('code');

  /**
   * One profiles/{uid} read per person per visit, not per refresh.
   *
   * Every one of those reads evaluates sharesFriendshipWith() in the rules,
   * which bills an extra exists() on top, and refresh() runs on mount and after
   * every accept, decline, remove and sent request. Clearing five requests with
   * twenty friends on the list used to cost around 360 reads against the live
   * database; cached it is twenty plus whoever is new.
   *
   * The trade is that a friend who renames themselves mid-visit stays stale
   * until the next load, which is the right price for a display name.
   */
  const resolveName = useCallback(async (uid: string): Promise<string | null> => {
    const cache = nameCache.current;
    const cached = cache.get(uid);
    if (cached !== undefined) return cached;
    try {
      const profile = await getPublicProfile(uid);
      const name = profile?.displayName ?? null;
      cache.set(uid, name);
      return name;
    } catch {
      // Deliberately NOT cached. A read denied while a brand-new friendship is
      // still settling should be retried on the next refresh, not remembered
      // forever as "this person has no name".
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const friendships = await listFriendships(user.uid);
      const withNames = await Promise.all(friendships.map(async (friendship) => ({
        ...friendship,
        displayName: await resolveName(friendship.otherUid),
      })));
      setRows(withNames);
      setLoadError(false);
    } catch (error) {
      // Leaving rows at [] here rendered "Friends (0) / No friends yet." to
      // someone with a dozen friends and a dropped connection, with nothing
      // anywhere to say the load had failed. Say so, and offer a retry.
      console.error('Could not load friendships:', error);
      setLoadError(true);
    } finally {
      setBusy(false);
    }
  }, [user, resolveName]);

  useEffect(() => { if (signedIn) void refresh(); }, [signedIn, refresh]);

  const loadInviteCode = useCallback(async () => {
    if (!user) return;
    setInviteBusy(true);
    try {
      setInviteCode(await ensureInviteCode(user));
      setInviteError(false);
    } catch (error) {
      // Swallowing this into setInviteCode('') left the card showing an ellipsis
      // with a permanently disabled Copy button and no way to find out why.
      console.error('Could not load the invite code:', error);
      setInviteCode('');
      setInviteError(true);
    } finally {
      setInviteBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (!signedIn || !user) return;
    void loadInviteCode();
    // Without this the switch renders off for someone who already opted in,
    // and flipping it would write the value it already had.
    getDiscoverable(user.uid).then(setDiscoverableState).catch(() => setDiscoverableState(false));
  }, [signedIn, user, loadInviteCode]);

  const request = useCallback(async (otherUid: string, name: string | null) => {
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
  }, [user, refresh]);

  /**
   * Arriving from someone's invite link, or coming back from sign-up with one
   * parked in sessionStorage.
   *
   * Keyed on the code VALUE rather than the searchParams object, and latched in
   * a ref before the first await: react-router hands back a fresh
   * URLSearchParams instance on every render, and re-entering here re-sends the
   * request and greets the customer with "You already asked them".
   */
  useEffect(() => {
    if (!signedIn || !user) return;
    // The URL wins over the parked one: a link just opened is a better
    // statement of intent than one left over from earlier in the visit.
    const code = paramCode ?? readPendingInvite();
    if (!code || consumedInvite.current === code) return;
    consumedInvite.current = code;
    // Cleared up front rather than on success: the ref latch does not survive a
    // remount, so a stored code that outlived a failure would fire again on the
    // customer's next visit to this page.
    clearPendingInvite();

    let cancelled = false;
    (async () => {
      try {
        const target = await resolveInviteCode(code);

        // react-router 6.27's useNavigate never resets its activeRef on unmount
        // and its callback closes over the pathname it was created with, so an
        // unguarded setSearchParams here is a real history.push('/friends').
        // A customer who opened an invite link, got a slow inviteCodes read and
        // wandered off to /cart would be thrown back here mid-checkout when it
        // finally resolved. Never navigate once this effect has been torn down.
        if (!cancelled && paramCode) {
          // replace, not push: otherwise Back returns to ?code= and re-fires
          // the whole thing for an undeserved "You already asked them".
          setSearchParams({}, { replace: true });
        }

        if (!target) {
          if (!cancelled) {
            toast({ title: 'That invite link is not valid', variant: 'destructive' });
          }
          return;
        }

        // Sent even if this page is gone. They asked for it by opening the
        // link, and the code has already been consumed; only the navigation
        // above is unsafe after teardown.
        await request(target.uid, target.displayName);
      } catch (error) {
        if (cancelled) return;
        toast({
          title: 'Could not open that invite link',
          description: String(error),
          variant: 'destructive',
        });
      }
    })();

    return () => { cancelled = true; };
  }, [paramCode, signedIn, user, request, setSearchParams]);

  /**
   * Accept, decline and remove all come through here.
   *
   * refresh() lives in the finally, not after a successful write. A double-tap
   * on bar wifi has the second updateDoc denied by the `status == 'pending'`
   * clause in the friendships update rule precisely BECAUSE the first one
   * worked, so the UI has to reconcile with the server on failure too.
   * Without it the row stayed under "Requests" with an Accept button that could
   * from then on only ever fail.
   */
  const mutate = useCallback(async (
    pairId: string,
    failure: string,
    action: () => Promise<void>,
  ) => {
    if (mutating.current) return;
    mutating.current = true;
    setPendingPairId(pairId);
    try {
      await action();
    } catch (error) {
      toast({ title: failure, description: String(error), variant: 'destructive' });
    } finally {
      await refresh();
      mutating.current = false;
      setPendingPairId(null);
    }
  }, [refresh]);

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

  const selectLinkText = (): boolean => {
    const node = linkRef.current;
    const selection = window.getSelection?.();
    if (!node || !selection) return false;
    try {
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * navigator.clipboard is undefined outside a secure context, and this app gets
   * opened over plain http on a LAN IP often enough that comboId.ts and the
   * invite-code generator both carry comments about it. The old version
   * optional-chained the write, never awaited it, and toasted "Link copied"
   * unconditionally - so a customer pasted whatever was already on their
   * clipboard into WhatsApp and wondered why nobody ever joined.
   *
   * Only claim success when something actually succeeded; otherwise select the
   * link so it can be copied by hand, and say so.
   */
  const copyLink = async () => {
    if (!inviteUrl) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(inviteUrl);
      toast({ title: 'Link copied' });
      return;
    } catch {
      // Fall through to the manual path rather than reporting a dead end the
      // customer can still work around.
    }

    const selected = selectLinkText();
    let copied = false;
    if (selected) {
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
    }

    if (copied) {
      toast({ title: 'Link copied' });
      return;
    }

    toast({
      title: selected ? 'Copy the link by hand' : 'Could not copy the link',
      description: selected
        ? 'It is selected above - long-press to copy, or let them scan the QR code.'
        : 'Read it out, or let them scan the QR code.',
      variant: selected ? 'default' : 'destructive',
    });
  };

  const resetLink = async () => {
    if (!user || resetting) return;
    setResetting(true);
    try {
      setInviteCode(await rotateInviteCode(user));
      setInviteError(false);
      toast({ title: 'New invite link ready', description: 'The old link and QR code no longer work.' });
    } catch (error) {
      toast({ title: 'Could not reset the link', description: String(error), variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

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
              <p className="mb-4 text-sm">
                {paramCode
                  ? 'Someone invited you. Create an account and we will send them the request.'
                  : 'Friends need an account.'}
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  // Account.tsx finishes at /my-orders and the ?code= param does
                  // not survive the trip, so park it before leaving.
                  if (paramCode) writePendingInvite(paramCode);
                  navigate('/account');
                }}
              >
                Create an account
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bg-turbo-card border-border">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-sm font-bold uppercase text-turbo-muted">Your invite link</h2>

                {inviteError ? (
                  <>
                    <p className="text-sm">Your invite link could not be loaded.</p>
                    <Button
                      variant="outline" className="w-full" disabled={inviteBusy}
                      onClick={() => void loadInviteCode()}
                    >
                      {inviteBusy ? 'Trying…' : 'Try again'}
                    </Button>
                  </>
                ) : !inviteUrl ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <>
                    <div className="flex justify-center">
                      {/* A light plate behind the code on purpose: phone cameras
                          want a bright quiet zone and the app's own background is
                          nearly black. */}
                      <div className="rounded-lg bg-white p-3">
                        <QRCodeSVG
                          value={inviteUrl} size={148} level="M"
                          bgColor="#ffffff" fgColor="#0f141a"
                          title="Invite QR code"
                        />
                      </div>
                    </div>
                    <p className="text-center text-xs text-turbo-muted">
                      Let them scan this at the table, or send the link.
                    </p>
                    <p ref={linkRef} className="break-all font-mono text-xs">{inviteUrl}</p>
                    <Button variant="outline" className="w-full" onClick={() => void copyLink()}>
                      Copy link
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full" disabled={resetting}>
                          {resetting ? 'Resetting…' : 'Reset link'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-turbo-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset your invite link?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Anyone holding the old link, or a photo of the old QR code, will
                            no longer be able to add you. Friends you already have stay.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep it</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void resetLink()}>
                            Reset link
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
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

            {loadError && (
              <Card className="border-destructive bg-turbo-card">
                <CardContent className="space-y-3 p-4">
                  <p className="text-sm">
                    Your friends list could not be loaded, so what is below may be
                    incomplete.
                  </p>
                  <Button
                    variant="outline" className="w-full" disabled={busy}
                    onClick={() => void refresh()}
                  >
                    {busy ? 'Trying…' : 'Try again'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {busy ? (
              <Skeleton className="h-24 w-full" />
            ) : loadError && rows.length === 0 ? null : (
              <>
                {incoming.length > 0 && (
                  <Card className="border-primary bg-turbo-card">
                    <CardContent className="space-y-2 p-4">
                      <h2 className="text-sm font-bold uppercase text-turbo-muted">Requests</h2>
                      {incoming.map((row) => (
                        <div key={row.pairId} className="flex items-center gap-2">
                          <span className="flex-1 truncate">{row.displayName ?? 'Someone'}</span>
                          <Button
                            size="sm" disabled={pendingPairId !== null}
                            onClick={() => void mutate(
                              row.pairId,
                              'Could not accept that request',
                              () => acceptFriendRequest(row.pairId),
                            )}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm" variant="ghost" disabled={pendingPairId !== null}
                            onClick={() => void mutate(
                              row.pairId,
                              'Could not decline that request',
                              () => removeFriendship(row.pairId),
                            )}
                          >
                            Decline
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {outgoing.length > 0 && (
                  <Card className="bg-turbo-card border-border">
                    <CardContent className="space-y-2 p-4">
                      <h2 className="text-sm font-bold uppercase text-turbo-muted">
                        Requests sent ({outgoing.length})
                      </h2>
                      {outgoing.map((row) => (
                        <p key={row.pairId} className="text-sm text-turbo-muted">
                          {row.displayName ?? 'Someone'} — request sent
                        </p>
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
                        <Button
                          size="sm" variant="ghost" disabled={pendingPairId !== null}
                          onClick={() => void mutate(
                            row.pairId,
                            'Could not remove that friend',
                            () => removeFriendship(row.pairId),
                          )}
                        >
                          Remove
                        </Button>
                      </div>
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
