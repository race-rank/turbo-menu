import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { pokeFriend } from '@/services/pokeService';
import { pokeCooldownRemainingMs } from '@/services/pokes';

export const PokeButton: React.FC<{ friendUid: string; friendName: string | null }> = ({ friendUid, friendName }) => {
  const { user } = useAuth();
  // Local only: the poke document carries the recipient's seenAt, so the
  // rules no longer let the poker read it. The rules still enforce the
  // cooldown; this just keeps the button honest within a visit.
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  // Re-render each 30s so the button re-enables when the cooldown ends.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const remainingMs = pokeCooldownRemainingMs(lastAt, now);
  const minutes = Math.ceil(remainingMs / 60_000);

  const poke = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await pokeFriend(user.uid, friendUid);
      setLastAt(new Date());
      setNow(new Date());
      toast({ title: `You poked ${friendName ?? 'them'} 👉` });
    } catch {
      toast({ title: 'Could not poke right now', description: 'You may have poked them very recently.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" disabled={busy || remainingMs > 0} onClick={poke}>
      {remainingMs > 0 ? `Poke in ${minutes}m` : 'Poke'}
    </Button>
  );
};
