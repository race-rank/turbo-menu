import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StarRating } from '@/components/StarRating';
import type { FavoriteCombo } from '@/services/favoritesService';
import type { ComboRating } from '@/services/ratingsService';

/**
 * Presentational only - no data fetching, no menu logic. Account and
 * FriendProfile both render a favourites card and a ratings card that differ
 * solely in heading and empty-state copy (yours is actionable - "tap the
 * heart"; a friend's is just a fact - "nothing saved yet"), so that copy
 * stays a prop rather than being baked in here.
 */

interface FavoritesListProps {
  favorites: FavoriteCombo[];
  heading: string;
  emptyText: string;
  footer?: React.ReactNode;
  // Omitted entirely on FriendProfile - re-ordering someone else's favourite
  // is not part of this feature, and the row simply renders without a
  // control rather than a page having to disable one.
  onReorder?: (favorite: FavoriteCombo) => void;
}

export const FavoritesList: React.FC<FavoritesListProps> = ({
  favorites, heading, emptyText, footer, onReorder,
}) => (
  <Card className="bg-turbo-card border-border">
    <CardContent className="p-4">
      <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
        {heading} ({favorites.length})
      </h2>
      {favorites.length === 0 && <p className="text-sm text-turbo-muted">{emptyText}</p>}
      {favorites.map((favorite) => (
        <div key={favorite.comboId} className="flex items-center justify-between gap-2 py-1">
          <p className="flex-1 truncate text-sm">{favorite.label}</p>
          {onReorder && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-xs"
              onClick={() => onReorder(favorite)}
            >
              Order again
            </Button>
          )}
        </div>
      ))}
      {footer}
    </CardContent>
  </Card>
);

interface RatingsListProps {
  ratings: ComboRating[];
  heading: string;
  emptyText: string;
}

export const RatingsList: React.FC<RatingsListProps> = ({
  ratings, heading, emptyText,
}) => (
  <Card className="bg-turbo-card border-border">
    <CardContent className="p-4">
      <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
        {heading} ({ratings.length})
      </h2>
      {ratings.length === 0 && <p className="text-sm text-turbo-muted">{emptyText}</p>}
      {ratings.map((rating) => (
        <div key={rating.comboId} className="flex items-center justify-between py-1">
          <span className="flex-1 truncate text-sm">{rating.label}</span>
          <StarRating value={rating.score} size="sm" />
        </div>
      ))}
    </CardContent>
  </Card>
);
