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

  useEffect(() => {
    setPokes([]);
    announced.current = null;
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
  // It cannot loop: once seenAt is stamped nothing is unseen, so the re-run
  // finds an empty list and writes nothing.
  const markAllSeen = useCallback(() => {
    if (!uid) return;
    const unseen = pokes.filter(isPokeUnseen).map((p) => p.fromUid);
    if (unseen.length > 0) {
      markPokesSeen(uid, unseen).catch((error) => console.error('Marking pokes seen failed:', error));
    }
  }, [uid, pokes]);

  return (
    <PokeContext.Provider value={{ unseenCount: pokes.filter(isPokeUnseen).length, markAllSeen }}>
      {children}
    </PokeContext.Provider>
  );
};
