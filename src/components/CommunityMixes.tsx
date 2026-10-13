import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { FavoriteCombo } from '@/services/favoritesService';
import { resolveReorder, type MenuSnapshot } from '@/services/reorderService';
import { describeUserMixBuild, userMixToFavorite, type UserMix } from '@/services/userMixes';

interface Props {
  mixes: UserMix[];
  menu: MenuSnapshot;
  onAdd: (favorite: FavoriteCombo) => void;
}

export const CommunityMixes: React.FC<Props> = ({ mixes, menu, onAdd }) => {
  if (mixes.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-semibold mb-6">Community Mixes</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mixes.map((mix) => {
          const favorite = userMixToFavorite(mix);
          // Resolved for display only - price and availability come from the
          // live menu, never from the submission. The table is irrelevant here.
          const resolution = resolveReorder(favorite, menu, '');
          return (
            <Card key={mix.id} className="bg-turbo-card border-border">
              <CardContent className="p-4 space-y-1">
                <p className="font-semibold">{mix.name}</p>
                <p className="text-xs text-turbo-muted">{`by ${mix.creatorName}`}</p>
                <p className="text-sm">{describeUserMixBuild(mix, menu.hookahs, menu.flavors)}</p>
                {mix.description && <p className="text-sm text-turbo-muted">{mix.description}</p>}
                <div className="flex items-center justify-between pt-2">
                  {resolution.status === 'ok' ? (
                    <>
                      <span className="text-lg font-bold text-amber-400">{`${resolution.item.price} Lei`}</span>
                      <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => onAdd(favorite)}>
                        Add
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm text-turbo-muted">
                      {`Unavailable — no longer on the menu: ${resolution.missing.join(', ')}`}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
