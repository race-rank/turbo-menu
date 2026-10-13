import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { DatabaseFlavor, DatabaseHookah } from '@/types/database';
import {
  approveUserMix, listCommunityMixes, listPendingUserMixes, rejectUserMix,
} from '@/services/userMixService';
import { describeUserMixBuild, describeUserMixRecipe, type CommunityMix, type UserMix } from '@/services/userMixes';

type MixRow = Pick<
  CommunityMix,
  'id' | 'name' | 'creatorName' | 'description' | 'hookahId' | 'flavorIds' | 'tobaccoStrength' | 'withIce' | 'flavorPercentages'
>;

interface Props {
  hookahs: DatabaseHookah[];
  flavors: DatabaseFlavor[];
  /** MenuManagement's publishAndReload: approving must reach the guest snapshot. */
  onChanged: () => Promise<void>;
}

export const CommunityMixesAdmin: React.FC<Props> = ({ hookahs, flavors, onChanged }) => {
  const [pending, setPending] = useState<UserMix[]>([]);
  const [approved, setApproved] = useState<CommunityMix[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([listPendingUserMixes(), listCommunityMixes()]);
    setPending(p);
    setApproved(a);
  }, []);

  useEffect(() => {
    load().catch(() => toast({ title: 'Could not load community mixes', description: 'Check your connection and try again.', variant: 'destructive' }));
  }, [load]);

  const review = async (id: string, verdict: () => Promise<void>) => {
    setBusyId(id);
    try {
      await verdict();
      await onChanged();
      await load();
    } catch {
      toast({ title: 'Could not update that mix', description: 'Check your connection and try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const row = (mix: MixRow, actions: React.ReactNode) => (
    <Card key={mix.id} className="bg-turbo-card border-border">
      <CardContent className="p-4 space-y-1">
        <p className="font-semibold">{mix.name}</p>
        <p className="text-xs text-turbo-muted">{`by ${mix.creatorName}`}</p>
        <p className="text-sm">{describeUserMixBuild(mix, hookahs, flavors)}</p>
        {describeUserMixRecipe(mix, flavors).map((line) => (
          <p key={line} className="text-xs text-turbo-muted">{line}</p>
        ))}
        {mix.description && <p className="text-sm text-turbo-muted">{mix.description}</p>}
        <div className="flex gap-2 pt-2">{actions}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{`Waiting for review (${pending.length})`}</h2>
        {pending.length === 0 && <p className="text-sm text-turbo-muted">Nothing to review.</p>}
        {pending.map((mix) => row(mix, (
          <>
            <Button size="sm" disabled={busyId === mix.id} onClick={() => review(mix.id, () => approveUserMix(mix))}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busyId === mix.id} onClick={() => review(mix.id, () => rejectUserMix(mix.id))}>Reject</Button>
          </>
        )))}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{`On the menu (${approved.length})`}</h2>
        {approved.length === 0 && <p className="text-sm text-turbo-muted">No community mixes yet.</p>}
        {approved.map((mix) => row(mix, (
          <Button size="sm" variant="outline" disabled={busyId === mix.id} onClick={() => review(mix.id, () => rejectUserMix(mix.id))}>Remove</Button>
        )))}
      </section>
    </div>
  );
};
