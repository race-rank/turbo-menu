import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  // Same as onReorder: FriendProfile does not pass this, so the remove
  // control is structurally impossible to reach for someone else's list
  // rather than merely hidden by a page-level check.
  onRemove?: (favorite: FavoriteCombo) => void;
}

export const FavoritesList: React.FC<FavoritesListProps> = ({
  favorites, heading, emptyText, footer, onReorder, onRemove,
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
          {onRemove && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs text-turbo-muted"
                  aria-label={`Remove ${favorite.label} from favourites`}
                >
                  Remove
                </Button>
              </AlertDialogTrigger>
              {/* Destructive and easy to mis-tap on a phone next to "Order
                  again" - confirm before it is gone, same precedent as the
                  invite-code reset on Friends.tsx. */}
              <AlertDialogContent className="bg-turbo-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this favourite?</AlertDialogTitle>
                  <AlertDialogDescription>
                    &ldquo;{favorite.label}&rdquo; will no longer appear on your favourites
                    list.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onRemove(favorite)}>
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
