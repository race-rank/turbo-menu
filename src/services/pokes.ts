/**
 * Pokes - the pure half. One document per poker at users/{to}/pokes/{from},
 * overwritten on each poke; that deterministic id is what lets the rules
 * enforce the cooldown without a server. Must match firestore.rules.
 */
export const POKE_COOLDOWN_MS = 10 * 60 * 1000;

export interface Poke {
  fromUid: string;
  at: Date;
  seenAt?: Date;
}

export const isPokeUnseen = (poke: Pick<Poke, 'at' | 'seenAt'>): boolean =>
  !poke.seenAt || poke.seenAt.getTime() < poke.at.getTime();

/** 0 means the friend can be poked now. */
export const pokeCooldownRemainingMs = (lastAt: Date | null | undefined, now: Date): number =>
  (lastAt ? Math.max(0, POKE_COOLDOWN_MS - (now.getTime() - lastAt.getTime())) : 0);
