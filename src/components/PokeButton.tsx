import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { pokeFriend } from '@/services/pokeService';
import { pokeCooldownRemainingMs } from '@/services/pokes';

const storageKey = (uid: string, friendUid: string) => `turbo-poke:${uid}:${friendUid}`;

// Convenience only - the rule enforces the real cooldown. Storage can throw
// (private mode, blocked site data), so every access is guarded.
const readLastPoke = (uid: string, friendUid: string): Date | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(uid, friendUid));
    const ms = raw === null ? NaN : Number(raw);
    return Number.isFinite(ms) ? new Date(ms) : null;
  } catch {
    return null;
  }
};

const writeLastPoke = (uid: string, friendUid: string, at: Date): void => {
  try {
    window.localStorage.setItem(storageKey(uid, friendUid), String(at.getTime()));
  } catch {
    // Not remembered across reloads; nothing else to do.
  }
};

const errorCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : null;


export const PokeButton: React.FC<{ friendUid: string; friendName: string | null }> = ({ friendUid, friendName }) => {
  const { user } = useAuth();
  const myUid = user?.uid ?? null;
  // The poke document carries the recipient's seenAt, so the rules no longer
  // let the poker read it. The last poke is remembered locally instead.
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLastAt(myUid ? readLastPoke(myUid, friendUid) : null);
    setNow(new Date());
  }, [myUid, friendUid]);

  const remainingMs = pokeCooldownRemainingMs(lastAt, now);
  const cooling = remainingMs > 0;
  const minutes = Math.ceil(remainingMs / 60_000);

  // Re-render each 30s so the button re-enables when the cooldown ends - and
  // only while one is running, so a list of friends is not a list of timers.
  useEffect(() => {
    if (!cooling) return undefined;
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [cooling]);

  const poke = async () => {
    if (!myUid) return;
    setBusy(true);
    try {
      await pokeFriend(myUid, friendUid);
      const at = new Date();
      writeLastPoke(myUid, friendUid, at);
      setLastAt(at);
      setNow(at);
      toast({ title: `You poked ${friendName ?? 'them'} 👉` });
    } catch (error) {
      const code = errorCode(error);
      let description = 'Try again in a moment.';
      if (code === 'permission-denied') {
        description = pokeCooldownRemainingMs(lastAt, new Date()) > 0
          ? 'You poked them recently'
          : 'You can only poke friends';
      } else if (code === 'unavailable' || code === 'network-request-failed' || !window.navigator.onLine) {
        description = "You're offline";
      }
      toast({ title: 'Could not poke right now', description, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" disabled={busy || cooling} onClick={poke}>
      {cooling ? `Poke in ${minutes}m` : 'Poke'}
    </Button>
  );
};
