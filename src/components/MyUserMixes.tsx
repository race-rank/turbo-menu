import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyUserMixes(uid).then(setMixes).catch(() => setMixes([]));
  }, [uid]);

  useEffect(() => { load(); }, [load, refreshToken]);

  if (mixes.length === 0) return null;

  const withdraw = async (id: string) => {
    setBusyId(id);
    try {
      await withdrawUserMix(id);
      load();
    } catch {
      toast({ title: 'Could not withdraw that mix', description: 'Check your connection and try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
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
            {/* An approved mix is on the public menu, and only the bar can
                republish that - so only the bar can take it off. */}
            {mix.status === 'approved' ? (
              <p className="shrink-0 text-xs text-turbo-muted">Ask the bar to remove it</p>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={busyId === mix.id}>
                    {busyId === mix.id ? 'Withdrawing…' : 'Withdraw'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-turbo-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Withdraw this mix?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {`“${mix.name}” will no longer be considered for the menu.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction onClick={() => withdraw(mix.id)}>Withdraw</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
