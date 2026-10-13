import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { PokeButton } from '@/components/PokeButton';
import { FavoritesList, RatingsList } from '@/components/ComboLists';
import { getPublicProfile, type PublicProfile } from '@/services/profileService';
import { listFavorites, type FavoriteCombo } from '@/services/favoritesService';
import { listRatings, type ComboRating } from '@/services/ratingsService';
import { getNowSmoking } from '@/services/nowSmokingService';
import { isNowSmokingFresh, nowSmokingItemToFavorite, type NowSmoking } from '@/services/nowSmoking';
import { getMenuData } from '@/services/menuService';
import type { MenuSnapshot } from '@/services/reorderService';
import { useOrderFavorite } from '@/hooks/useOrderFavorite';

// Firestore rejects a disallowed read with a bare FirestoreError whose `code`
// is the literal string 'permission-denied' - no exported class to instanceof
// against, so duck-type it the same way authService does for auth/* codes.
const isPermissionDenied = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error &&
  (error as { code: string }).code === 'permission-denied';

const FriendProfile: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [favorites, setFavorites] = useState<FavoriteCombo[]>([]);
  const [ratings, setRatings] = useState<ComboRating[]>([]);
  const [busy, setBusy] = useState(true);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [nowSmoking, setNowSmoking] = useState<NowSmoking | null>(null);
  const [menu, setMenu] = useState<MenuSnapshot | null>(null);
  const orderFavorite = useOrderFavorite(menu);

  useEffect(() => {
    getMenuData().then(setMenu).catch(() => setMenu(null));
  }, []);

  useEffect(() => {
    if (!uid) return;
    setBusy(true);
    // Reset every run, not just on mount: a future "next friend" link would
    // otherwise carry a previous profile's denial or error into this one.
    setDenied(false);
    setLoadError(false);

    Promise.allSettled([
      getPublicProfile(uid),
      listFavorites(uid),
      listRatings(uid),
      getNowSmoking(uid),
    ]).then(([profileResult, favoritesResult, ratingsResult, nowSmokingResult]) => {
      setProfile(profileResult.status === 'fulfilled' ? profileResult.value : null);
      setFavorites(favoritesResult.status === 'fulfilled' ? favoritesResult.value : []);
      setRatings(ratingsResult.status === 'fulfilled' ? ratingsResult.value : []);

      // Deliberately not in `failures` below: a denial or absence just means the
      // friend has not opted in, which must not read as "you are not friends".
      const smoking = nowSmokingResult.status === 'fulfilled' ? nowSmokingResult.value : null;
      setNowSmoking(smoking && isNowSmokingFresh(smoking.since, new Date()) ? smoking : null);

      const failures = [profileResult, favoritesResult, ratingsResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected');

      // Rules read the friendship live, so a permission-denied is also what
      // an unfriend looks like while the page is open - show that message.
      // Any other failure (a dropped connection, a timeout) is transient,
      // must not be read as "you were never friends", and must not throw
      // away whichever of the three reads DID succeed.
      if (failures.some((failure) => isPermissionDenied(failure.reason))) {
        setDenied(true);
      } else if (failures.length > 0) {
        setLoadError(true);
      }

      setBusy(false);
    });
  }, [uid, retryToken]);

  return (
    <div className="min-h-screen pb-24">
      <header className="flex items-center justify-between border-b border-border p-4">
        <NavigationSidebar />
        <h1 className="truncate text-2xl font-bold tracking-wider">
          {profile?.displayName ?? 'FRIEND'}
        </h1>
        {uid && !busy && !denied ? (
          <PokeButton friendUid={uid} friendName={profile?.displayName ?? null} />
        ) : (
          <div className="w-10" />
        )}
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        {busy && <Skeleton className="h-32 w-full" />}

        {!busy && denied && (
          <p className="text-center text-turbo-muted">
            You can only see this once you are friends.
          </p>
        )}

        {!busy && !denied && (
          <>
            {loadError && (
              <Card className="border-destructive/50 bg-turbo-card">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <p className="text-sm text-turbo-muted">Some of this didn't load. Try again?</p>
                  <Button variant="outline" size="sm" onClick={() => setRetryToken((n) => n + 1)}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {nowSmoking && (
              <Card className="bg-turbo-card border-border">
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold">Now smoking</h3>
                  {nowSmoking.items.map((item) => {
                    const favorite = nowSmokingItemToFavorite(item);
                    return (
                      <div key={item.comboId} className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{item.label}</span>
                        {favorite && (
                          <Button size="sm" variant="outline" onClick={() => orderFavorite(favorite)}>
                            Order the same
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <FavoritesList
              favorites={favorites}
              heading="Favourites"
              emptyText="Nothing saved yet."
            />

            <RatingsList
              ratings={ratings}
              heading="Ratings"
              emptyText="Nothing rated yet."
            />
          </>
        )}
      </div>
    </div>
  );
};

export default FriendProfile;
