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
  // "7/20" on the customer's own list. Friends see a plain count.
  countLabel?: string;
  footer?: React.ReactNode;
  onReorder?: (favorite: FavoriteCombo) => void;
  // "Order again" on the customer's own list; "Order" on a friend's, which
  // they have never ordered.
  reorderLabel?: string;
  // FriendProfile only: copy a friend's favourite into the viewer's own list.
  onSave?: (favorite: FavoriteCombo) => void;
  // The viewer's own comboIds, so a combo they already have reads "Saved".
  savedIds?: ReadonlySet<string>;
  // Disables every Order / Save button while one of them is in flight.
  busy?: boolean;
  // FriendProfile does not pass this, so the remove control is structurally
  // impossible to reach for someone else's list rather than merely hidden by
  // a page-level check.
  onRemove?: (favorite: FavoriteCombo) => void;
  // Account's signed-in list only. Rendered for custom builds - a curated
  // mix is already on the menu.
  onShare?: (favorite: FavoriteCombo) => void;
}

export const FavoritesList: React.FC<FavoritesListProps> = ({
  favorites, heading, emptyText, countLabel, footer, onReorder, reorderLabel = 'Order again',
  onSave, savedIds, busy = false, onRemove, onShare,
}) => (
  <Card className="bg-turbo-card border-border">
    <CardContent className="p-4">
      <h2 className="mb-3 text-sm font-bold uppercase text-turbo-muted">
        {`${heading} (${countLabel ?? favorites.length})`}
      </h2>
      {favorites.length === 0 && <p className="text-sm text-turbo-muted">{emptyText}</p>}
      {favorites.map((favorite) => (
        // Name on its own line, wrapped in full, actions underneath: a build's
        // name lists its flavours, and truncating it beside three buttons left
        // only "Darkblend · Lapt…" on a phone.
        <div key={favorite.comboId} className="border-b border-border py-2 last:border-b-0">
          <p className="break-words text-sm">{favorite.label}</p>
          {(onReorder || onSave || onShare || onRemove) && (
            <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
              {onReorder && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs"
                  disabled={busy}
                  onClick={() => onReorder(favorite)}
                >
                  {reorderLabel}
                </Button>
              )}
              {onSave && (savedIds?.has(favorite.comboId) ? (
                <Button variant="ghost" size="sm" className="shrink-0 text-xs" disabled>
                  Saved
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs"
                  disabled={busy}
                  onClick={() => onSave(favorite)}
                >
                  Save to mine
                </Button>
              ))}
              {onShare && favorite.kind === 'custom' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => onShare(favorite)}
                >
                  Share as a mix
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
                        {`“${favorite.label}” will no longer appear on your favourites list.`}
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
        {`${heading} (${ratings.length})`}
      </h2>
      {ratings.length === 0 && <p className="text-sm text-turbo-muted">{emptyText}</p>}
      {ratings.map((rating) => (
        <div key={rating.comboId} className="flex items-start justify-between gap-2 py-1">
          <span className="flex-1 break-words text-sm">{rating.label}</span>
          <StarRating value={rating.score} size="sm" />
        </div>
      ))}
    </CardContent>
  </Card>
);
