import React from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  isFavorite, onToggle, disabled = false, label,
}) => (
  <button
    type="button"
    disabled={disabled}
    aria-pressed={isFavorite}
    aria-label={isFavorite ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
    onClick={(event) => {
      // The mix Card has no onClick today, so this has nothing to guard
      // against right now - but it sits on top of one inside a Carousel
      // slide, and stopPropagation is cheap insurance against whatever the
      // card or slide picks up next.
      event.stopPropagation();
      onToggle();
    }}
    className="rounded-full bg-black/40 p-2 backdrop-blur disabled:opacity-50"
  >
    <Heart
      className={cn('h-5 w-5 transition-colors', isFavorite ? 'fill-red-500 text-red-500' : 'text-white')}
    />
  </button>
);
