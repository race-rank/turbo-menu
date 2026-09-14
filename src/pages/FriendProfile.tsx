import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { StarRating } from '@/components/StarRating';
import { getPublicProfile, type PublicProfile } from '@/services/profileService';
import { listFavorites, type FavoriteCombo } from '@/services/favoritesService';
import { listRatings, type ComboRating } from '@/services/ratingsService';

const FriendProfile: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [favorites, setFavorites] = useState<FavoriteCombo[]>([]);
  const [ratings, setRatings] = useState<ComboRating[]>([]);
  const [busy, setBusy] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setBusy(true);
    Promise.all([
      getPublicProfile(uid),
      listFavorites(uid),
      listRatings(uid),
    ])
      .then(([p, f, r]) => { setProfile(p); setFavorites(f); setRatings(r); })
      // Rules read the friendship live, so this is also what an unfriend looks
      // like while the page is open.
      .catch(() => setDenied(true))
      .finally(() => setBusy(false));
  }, [uid]);

  return (
    <div className="min-h-screen pb-24">
      <header className="flex items-center justify-between border-b border-border p-4">
        <NavigationSidebar />
        <h1 className="truncate text-2xl font-bold tracking-wider">
          {profile?.displayName ?? 'FRIEND'}
        </h1>
        <div className="w-10" />
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
            <Card className="bg-turbo-card border-border">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
                  Favourites ({favorites.length})
                </h2>
                {favorites.length === 0 && <p className="text-sm text-turbo-muted">Nothing saved yet.</p>}
                {favorites.map((favorite) => (
                  <p key={favorite.comboId} className="py-1 text-sm">{favorite.label}</p>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-turbo-card border-border">
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
                  Ratings ({ratings.length})
                </h2>
                {ratings.length === 0 && <p className="text-sm text-turbo-muted">Nothing rated yet.</p>}
                {ratings.map((rating) => (
                  <div key={rating.comboId} className="flex items-center justify-between py-1">
                    <span className="flex-1 truncate text-sm">{rating.label}</span>
                    <StarRating value={rating.score} size="sm" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default FriendProfile;
