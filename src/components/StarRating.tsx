import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  onChange?: (score: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6' };

/**
 * Read-only when onChange is omitted, in which case the stars render as plain
 * text rather than buttons so screen readers do not announce five controls
 * nobody can press.
 */
export const StarRating: React.FC<StarRatingProps> = ({
  value, onChange, disabled = false, size = 'md',
}) => {
  const scores = [1, 2, 3, 4, 5];

  if (!onChange) {
    return (
      <div className="flex gap-0.5" role="img" aria-label={`Rated ${value} out of 5`}>
        {scores.map((score) => (
          <Star
            key={score}
            aria-hidden="true"
            className={cn(
              SIZES[size],
              score <= value ? 'fill-amber-400 text-amber-400' : 'text-turbo-muted',
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {scores.map((score) => (
        <button
          key={score}
          type="button"
          disabled={disabled}
          onClick={() => onChange(score)}
          aria-label={`Rate ${score} out of 5`}
          aria-pressed={score === value}
          className="disabled:opacity-50"
        >
          <Star
            className={cn(
              SIZES[size],
              'transition-colors',
              score <= value ? 'fill-amber-400 text-amber-400' : 'text-turbo-muted',
            )}
          />
        </button>
      ))}
    </div>
  );
};
