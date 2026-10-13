import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { listMyUserMixes, withdrawUserMix } from '@/services/userMixService';
import type { UserMix } from '@/services/userMixes';

const STATUS_LABEL: Record<UserMix['status'], string> = {
  pending: 'Waiting for review',
  approved: 'On the menu',
  rejected: 'Not accepted',
};

/** `refreshToken` changes when Account submits a new mix. */
export const MyUserMixes: React.FC<{ uid: string; refreshToken: number }> = ({ uid, refreshToken }) => {
  const [mixes, setMixes] = useState<UserMix[]>([]);

  const load = useCallback(() => {
    listMyUserMixes(uid).then(setMixes).catch(() => setMixes([]));
  }, [uid]);

  useEffect(() => { load(); }, [load, refreshToken]);

  if (mixes.length === 0) return null;

  const withdraw = async (id: string) => {
    try {
      await withdrawUserMix(id);
      load();
    } catch (error) {
      toast({ title: 'Could not withdraw that mix', description: String(error), variant: 'destructive' });
    }
  };

  return (
    <Card className="bg-turbo-card border-border">
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">Your shared mixes</h3>
        {mixes.map((mix) => (
          <div key={mix.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{mix.name}</p>
              <p className="text-xs text-turbo-muted">{STATUS_LABEL[mix.status]}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => withdraw(mix.id)}>
              {mix.status === 'approved' ? 'Remove' : 'Withdraw'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
