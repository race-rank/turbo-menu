import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { FavoritesList, RatingsList } from '@/components/ComboLists';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { AuthForms } from '@/components/auth/AuthForms';
import { logout, updateDisplayName } from '@/services/authService';
import { getAccountSummary, upsertUserProfile, type AccountSummary } from '@/services/userService';
import { refreshInviteCodeName } from '@/services/friendsService';
import { listFavorites, removeFavorite, type FavoriteCombo } from '@/services/favoritesService';
import { listRatings, type ComboRating } from '@/services/ratingsService';
import { getMenuData } from '@/services/menuService';
import { resolveReorder, type MenuSnapshot } from '@/services/reorderService';
import { isValidTableId, TURBO_TABLE_STORAGE_KEY } from '@/services/tableValidation';
import { toast } from '@/hooks/use-toast';

const Account: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const signedIn = !!user && !isAnonymous;

  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteCombo[]>([]);
  const [ratings, setRatings] = useState<ComboRating[]>([]);
  // Loaded once, unconditionally: re-ordering a favourite needs the live
  // menu to resolve and re-price against (see reorderService.ts), and
  // favourites render for a signed-out guest too, so this can't wait on
  // `signedIn`.
  const [menu, setMenu] = useState<MenuSnapshot | null>(null);
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
    listRatings(user.uid)
      .then(setRatings)
      .catch(() => setRatings([]));
  }, [signedIn, user]);

  // Split from the effect above: favourites work for anonymous guests too
  // (the rules permit writes to their own users/{uid}/favorites, and the uid
  // survives a later linkWithCredential upgrade), so this list has to load
  // whether or not the customer has a real account.
  useEffect(() => {
    if (!user) return;
    listFavorites(user.uid)
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }, [user]);

  // Same call Index.tsx makes to build its own builder - a menu snapshot,
  // not a Firestore listener, since re-order only needs a menu to resolve
  // against, not to stay live-updated while this page is open.
  useEffect(() => {
    getMenuData()
      .then(setMenu)
      .catch(() => setMenu(null));
  }, []);

  const handleReorder = (favorite: FavoriteCombo) => {
    const tableId = localStorage.getItem(TURBO_TABLE_STORAGE_KEY);
    if (!isValidTableId(tableId)) {
      toast({
        title: 'No table selected',
        description: "Please scan your table's QR code to place an order.",
        variant: 'destructive',
      });
      return;
    }

    if (!menu) {
      toast({
        title: 'Menu still loading',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
      return;
    }

    const resolution = resolveReorder(favorite, menu, tableId);
    if (resolution.status === 'unavailable') {
      // Names what is gone rather than silently dropping it from the build -
      // see reorderService.ts.
      toast({
        title: 'No longer available',
        description: `${resolution.missing.join(', ')} ${resolution.missing.length > 1 ? 'are' : 'is'} no longer on the menu.`,
        variant: 'destructive',
      });
      return;
    }

    addItem(resolution.item);
    toast({ title: 'Added to cart', description: `${favorite.label} is back in your cart.` });
    navigate('/cart');
  };

  // The only caller that ever passes onRemove to FavoritesList - this is the
  // owner's own list, guest or signed in. FriendProfile renders the same
  // component for someone else's favourites and deliberately does not pass
  // this prop, so the control cannot reach that page even by mistake.
  const handleRemoveFavorite = async (favorite: FavoriteCombo) => {
    if (!user) return;
    try {
      await removeFavorite(user.uid, favorite.comboId);
      setFavorites((prev) => prev.filter((f) => f.comboId !== favorite.comboId));
      toast({ title: 'Removed from favourites' });
    } catch (error) {
      toast({ title: 'Could not remove that favourite', description: String(error), variant: 'destructive' });
    }
  };

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
      // Non-fatal: a rename already succeeded by this point, and a code that
      // stays stale until the next rename is a strictly smaller problem than
      // reporting a successful rename as a failure. No-ops if there is no
      // invite code yet.
      await refreshInviteCodeName(updated).catch((error) => {
        console.error('Invite code name refresh failed:', error);
      });
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

            <FavoritesList
              favorites={favorites}
              heading="Favourites"
              emptyText="Tap the heart on a mix to save it."
              onReorder={handleReorder}
              onRemove={handleRemoveFavorite}
            />

            <RatingsList
              ratings={ratings}
              heading="Your ratings"
              emptyText="Rate an order from your history."
            />

            <Button className="w-full" onClick={() => navigate('/my-orders')}>
              My orders
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate('/friends')}>
              Friends
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
          <div className="w-full max-w-md mx-auto space-y-4">
            {/* Favourites genuinely work for an anonymous guest - the rules
                let them write their own users/{uid}/favorites, and the uid
                survives a later linkWithCredential sign-up - so this is a
                real list, not a teaser for a feature they can't use yet. */}
            {user && (
              <FavoritesList
                favorites={favorites}
                heading="Favourites"
                emptyText="Tap the heart on a mix to save it."
                onReorder={handleReorder}
                onRemove={handleRemoveFavorite}
                footer={
                  <p className="mt-3 border-t border-border pt-3 text-xs text-turbo-muted">
                    Sign up to keep these on any device.
                  </p>
                }
              />
            )}
            <Card className="bg-turbo-card border-border">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold mb-2 text-center">Create your account</h2>
                <p className="text-sm text-turbo-muted mb-6 text-center">
                  Keep your order history and get offers. Orders you already placed on this
                  device come with you.
                </p>
                <AuthForms onDone={() => navigate('/my-orders')} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Account;
