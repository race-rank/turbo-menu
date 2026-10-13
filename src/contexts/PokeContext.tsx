import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { getPublicProfile } from '@/services/profileService';
import { markPokesSeen, pokeFriend, subscribeToPokes } from '@/services/pokeService';
import { isPokeUnseen, type Poke } from '@/services/pokes';

interface PokeContextValue {
  unseenCount: number;
  markAllSeen: () => void;
}

const PokeContext = createContext<PokeContextValue>({ unseenCount: 0, markAllSeen: () => undefined });
export const usePokes = () => useContext(PokeContext);

export const PokeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAnonymous } = useAuth();
  const uid = user && !isAnonymous ? user.uid : null;
  const [pokes, setPokes] = useState<Poke[]>([]);
  // `at` per poker already announced, so a re-delivered snapshot never toasts
  // twice. The first snapshot after subscribing seeds it silently: pokes that
  // were waiting show on the badge, not as a burst of toasts on page load.
  const announced = useRef<Map<string, number> | null>(null);
  const names = useRef(new Map<string, string>());
  // `at` per poker already written as seen. seenAt is read back as a local
  // estimate, which can still look older than the server's `at` on a phone
  // whose clock runs behind - without this the write would repeat on every
  // snapshot.
  const marked = useRef(new Map<string, number>());

  useEffect(() => {
    setPokes([]);
    announced.current = null;
    names.current = new Map();
    marked.current = new Map();
    if (!uid) return undefined;

    // Declared inside the effect so it closes over this run's uid and
    // `cancelled`: a name lookup that resolves after sign-out or an account
    // switch must not toast for the previous account.
    let cancelled = false;
    const announce = async (fromUid: string) => {
      let name = names.current.get(fromUid);
      if (!name) {
        name = (await getPublicProfile(fromUid).catch(() => null))?.displayName ?? 'A friend';
        names.current.set(fromUid, name);
      }
      if (cancelled) return;
      toast({
        title: `${name} poked you 👉`,
        action: (
          <ToastAction
            altText="Poke back"
            onClick={() => {
              pokeFriend(uid, fromUid).catch(() =>
                toast({ title: 'You poked them recently - try again in a few minutes.' }));
            }}
          >
            <span>Poke back</span>
          </ToastAction>
        ),
      });
    };

    const unsubscribe = subscribeToPokes(uid, (next) => {
      if (cancelled) return;
      setPokes(next);
      const unseen = next.filter(isPokeUnseen);

      if (announced.current === null) {
        announced.current = new Map(unseen.map((p) => [p.fromUid, p.at.getTime()]));
        return;
      }
      for (const poke of unseen) {
        if (announced.current.get(poke.fromUid) === poke.at.getTime()) continue;
        announced.current.set(poke.fromUid, poke.at.getTime());
        void announce(poke.fromUid);
      }
    }, (error) => console.error('Poke listener failed:', error));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid]);

  // New identity whenever `pokes` changes, on purpose: /friends re-runs its
  // mark-seen effect and so also covers pokes that arrive while it is open.
  // It cannot loop: each poke `at` is written at most once (see `marked`), even
  // if the local seenAt estimate still looks stale afterwards.
  const markAllSeen = useCallback(() => {
    if (!uid) return;
    const unseen = pokes.filter(isPokeUnseen).filter((p) => marked.current.get(p.fromUid) !== p.at.getTime());
    if (unseen.length === 0) return;
    for (const p of unseen) marked.current.set(p.fromUid, p.at.getTime());
    markPokesSeen(uid, unseen.map((p) => p.fromUid)).catch((error) => {
      console.error('Marking pokes seen failed:', error);
      // Allow a later attempt for these pokes.
      for (const p of unseen) {
        if (marked.current.get(p.fromUid) === p.at.getTime()) marked.current.delete(p.fromUid);
      }
    });
  }, [uid, pokes]);

  return (
    <PokeContext.Provider value={{ unseenCount: pokes.filter(isPokeUnseen).length, markAllSeen }}>
      {children}
    </PokeContext.Provider>
  );
};
