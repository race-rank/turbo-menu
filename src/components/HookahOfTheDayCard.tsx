import React from 'react';
import { Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ResolvedHookahOfTheDay } from '@/services/hookahOfTheDay';

interface Props {
  resolved: ResolvedHookahOfTheDay;
  /** Selects the hookah in the builder and scrolls the customer to it. */
  onPick: () => void;
}

export const HookahOfTheDayCard: React.FC<Props> = ({ resolved, onPick }) => {
  const { hookah, promoText } = resolved;

  return (
    <Card className="bg-turbo-card border-2 border-amber-400 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-4 p-4">
          <img
            src={hookah.image}
            alt={hookah.name}
            className="h-24 w-24 rounded object-cover flex-shrink-0"
            loading="lazy"
            decoding="async"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              Hookah of the day
            </p>
            <h3 className="truncate text-lg font-bold">{hookah.name}</h3>
            {promoText && (
              <p className="text-sm text-turbo-muted line-clamp-2">{promoText}</p>
            )}
            <p className="mt-1 font-bold text-amber-400">{hookah.price} Lei</p>
          </div>
          <Button
            className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={onPick}
          >
            Pick
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
