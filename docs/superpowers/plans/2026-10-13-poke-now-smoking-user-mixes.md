# Poke, Now Smoking and User-Made Mixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app pokes between friends, an opt-in "what is my friend smoking" status, and customer-submitted mixes that an admin approves onto the public menu.

**Architecture:** Each feature is a pure, unit-tested module (`src/services/nowSmoking.ts`, `pokes.ts`, `userMixes.ts`) plus a thin Firestore service, guarded by new rules that are tested against the emulator before any UI exists. "Now smoking" is a separate friend-readable projection written at checkout, so orders stay owner-only. Ordering a friend's combo or a community mix reuses `resolveReorder`, so prices always come from the live menu. Approved community mixes ride in the existing menu snapshot, so guests still load the menu in one read.

**Tech Stack:** Vite, React 18, TypeScript, Firebase Auth + Firestore (client SDK), shadcn/ui, Tailwind, Vitest, `@firebase/rules-unit-testing` against the Firestore emulator.

**Spec:** `docs/superpowers/specs/2026-10-13-poke-now-smoking-user-mixes-design.md`

**Branch:** `feat/poke-now-smoking-user-mixes`, cut from `main` at `1df3692`; the spec is committed at `a27ced6`.

---

## Things to know before you start

**Never run `npm run dev` or `vite preview`.** The app points at the bar's live production database; even loading it signs an anonymous user in there. Verify with `npm test`, `npx tsc` and `npm run build` only.

**`npm test` wraps Vitest in the Firestore emulator and needs a JDK on PATH:**

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npm test
```

**Baseline: 221 passed, 0 failed across 10 files.** `PERMISSION_DENIED` lines on stderr are expected — rules tests assert denials. If `tests/translateSafeText.dom.test.tsx` is missing from the run, `node_modules` is out of date: run `npm ci`. A missing test environment does **not** fail the suite, so check the file count.

An emulator setup hook occasionally times out under load. If one rules test fails with `Hook timed out in 15000ms`, re-run before investigating.

**`npx tsc --noEmit -p tsconfig.app.json` reports exactly 4 pre-existing errors**, all in `src/services/firebaseService.ts`. Add none.

**`tsconfig.app.json` sets `strict: false`.** `strictNullChecks` is off, and narrowing on a negated discriminant does not work; `reorderService.ts` uses explicit type predicates for this reason.

**`npx eslint` is broken repo-wide** (ESLint 9 vs the installed `@typescript-eslint`). `react-hooks/exhaustive-deps` never runs, so check every dependency array by hand.

**Translate-safe text is enforced by a test.** Chrome's Google Translate breaks React updates when an element's children mix a literal and an interpolation. Write `` {`Smoking ${label}`} ``, never `Smoking {label}`; wrap a bare string beside an element in its own `<span>`. `tests/translateSafeText.guard.test.ts` fails the suite on any violation.

**The invariant.** Orders stay owner-only. Nothing in this plan may loosen `match /orders/{orderId}`.

**Deviations from the spec, decided while planning:**

1. **No composite indexes.** The admin queue and the creator's list query by one field and sort in the browser. The lists are small, and it removes an index deploy that `firestore.indexes.json` (out of sync with production) makes risky.
2. **Approved community mixes are publicly readable without sign-in**, like `hookahs` and `recommendedMixes`. The menu can load before the anonymous session exists, so a sign-in requirement would intermittently drop them from a cold start.
3. **The "share what I'm smoking" switch lives on `/friends`**, beside the existing "Let people find me by email" switch, not on `/account`. Both are friends-privacy settings.
4. **New rules tests go in a new file**, `tests/socialExtrasRules.test.ts`, with its own emulator project id, rather than growing `socialRules.test.ts` past 1,100 lines. Vitest runs files serially (`fileParallelism: false`), so they do not interfere.

---

## File structure

| File | Responsibility |
|---|---|
| `src/services/nowSmoking.ts` *(new)* | pure: build items from cart, freshness, convert an item to a `FavoriteCombo` |
| `src/services/pokes.ts` *(new)* | pure: unseen check, cooldown |
| `src/services/userMixes.ts` *(new)* | pure: types, input validation, favourite → submission, submission → `FavoriteCombo`, build description |
| `src/services/nowSmokingService.ts` *(new)* | Firestore: opt-in flag, publish, read, and the non-fatal checkout hook |
| `src/services/pokeService.ts` *(new)* | Firestore: poke, last poke, subscribe, mark seen |
| `src/services/userMixService.ts` *(new)* | Firestore: submit, list, withdraw, review |
| `src/hooks/useOrderFavorite.ts` *(new)* | table check → menu check → `resolveReorder` → add to cart, shared by three pages |
| `src/contexts/PokeContext.tsx` *(new)* | live poke listener, unseen count, toasts, mark-seen |
| `src/components/PokeButton.tsx` *(new)* | poke a friend, with the cooldown shown |
| `src/components/ShareMixDialog.tsx` *(new)* | name + description form for submitting a mix |
| `src/components/MyUserMixes.tsx` *(new)* | the creator's submissions and their status |
| `src/components/admin/CommunityMixesAdmin.tsx` *(new)* | the approval queue |
| `src/components/CommunityMixes.tsx` *(new)* | the customer-facing section |
| `firestore.rules` | `pokes`, `nowSmoking`, `userMixes` blocks |
| `tests/socialExtrasRules.test.ts` *(new)* | emulator tests for those rules |
| `tests/nowSmoking.test.ts`, `tests/pokes.test.ts`, `tests/userMixes.test.ts` *(new)* | pure-logic tests |
| `src/services/menuService.ts` | `MenuData.communityMixes`, carried through the snapshot |
| `src/pages/Account.tsx` | use the shared hook; Share as a mix; My submissions |
| `src/components/ComboLists.tsx` | optional `onShare` on `FavoritesList` |
| `src/pages/Cart.tsx` | publish now-smoking after an order |
| `src/pages/Friends.tsx` | opt-in switch, "smoking …" line, poke button, mark pokes seen |
| `src/pages/FriendProfile.tsx` | Now smoking card with Order the same, poke button |
| `src/components/NavigationSidebar.tsx` | unseen-poke badge |
| `src/App.tsx` | mount `PokeProvider` |
| `src/pages/MenuManagement.tsx` | Community Mixes tab |
| `src/pages/Index.tsx` | Community mixes section |

---

## Task 1: Pure logic for "now smoking"

**Files:**
- Create: `src/services/nowSmoking.ts`
- Test: `tests/nowSmoking.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/nowSmoking.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  NOW_SMOKING_MAX_ITEMS, NOW_SMOKING_TTL_MS, buildNowSmokingItems,
  isNowSmokingFresh, nowSmokingItemToFavorite,
} from '../src/services/nowSmoking';

const mixItem = {
  type: 'mix' as const, comboId: 'mix:sunset', comboLabel: 'Sunset Blend',
  name: 'Sunset Blend (Virginia)', mixId: 'sunset', tobaccoType: 'virginia' as const,
};
const customItem = {
  type: 'custom' as const, comboId: 'custom:abc', comboLabel: 'Khalil · Mint, Lemon',
  name: 'Custom Mix', hookahId: 'h1', tobaccoType: 'virginia' as const,
  flavorIds: ['mint:virginia', 'lemon:virginia'],
};

describe('buildNowSmokingItems', () => {
  test('a mix shares its id and label only', () => {
    expect(buildNowSmokingItems([mixItem])).toEqual([
      { comboId: 'mix:sunset', label: 'Sunset Blend' },
    ]);
  });

  test('a custom build also shares what is needed to order the same', () => {
    expect(buildNowSmokingItems([customItem])).toEqual([{
      comboId: 'custom:abc', label: 'Khalil · Mint, Lemon',
      hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
    }]);
  });

  test('personalisation is never shared', () => {
    const [item] = buildNowSmokingItems([{
      ...customItem, tobaccoStrength: 7, flavorPercentages: { a: 50 }, hasLED: true,
    } as typeof customItem]);
    expect(Object.keys(item).sort()).toEqual(['comboId', 'flavorIds', 'hookahId', 'label', 'tobaccoType']);
  });

  test('legacy items without a comboId are skipped', () => {
    expect(buildNowSmokingItems([{ ...mixItem, comboId: undefined as unknown as string }])).toEqual([]);
  });

  test('the same combo twice is shared once', () => {
    expect(buildNowSmokingItems([mixItem, mixItem])).toHaveLength(1);
  });

  test('falls back to the item name when there is no combo label', () => {
    expect(buildNowSmokingItems([{ ...mixItem, comboLabel: undefined }])[0].label)
      .toBe('Sunset Blend (Virginia)');
  });

  test('caps the list', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...mixItem, comboId: `mix:m${i}` }));
    expect(buildNowSmokingItems(many)).toHaveLength(NOW_SMOKING_MAX_ITEMS);
  });

  test('a custom item missing its build shares the label only', () => {
    expect(buildNowSmokingItems([{ ...customItem, hookahId: undefined }])).toEqual([
      { comboId: 'custom:abc', label: 'Khalil · Mint, Lemon' },
    ]);
  });
});

describe('isNowSmokingFresh', () => {
  const now = new Date('2026-10-13T20:00:00Z');

  test('fresh inside the window', () => {
    expect(isNowSmokingFresh(new Date(now.getTime() - 60_000), now)).toBe(true);
  });

  test('stale at the window', () => {
    expect(isNowSmokingFresh(new Date(now.getTime() - NOW_SMOKING_TTL_MS), now)).toBe(false);
  });

  test('a server time slightly ahead of the device clock still counts as fresh', () => {
    expect(isNowSmokingFresh(new Date(now.getTime() + 30_000), now)).toBe(true);
  });

  test('no timestamp is not fresh', () => {
    expect(isNowSmokingFresh(undefined, now)).toBe(false);
  });
});

describe('nowSmokingItemToFavorite', () => {
  test('a mix resolves from its combo id', () => {
    expect(nowSmokingItemToFavorite({ comboId: 'mix:sunset', label: 'Sunset Blend' })).toEqual({
      comboId: 'mix:sunset', label: 'Sunset Blend', kind: 'mix', mixId: 'sunset',
    });
  });

  test('a custom build resolves from its shared build', () => {
    expect(nowSmokingItemToFavorite({
      comboId: 'custom:abc', label: 'L', hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['a:virginia'],
    })).toEqual({
      comboId: 'custom:abc', label: 'L', kind: 'custom',
      hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['a:virginia'],
    });
  });

  test('a custom item without its build cannot be ordered', () => {
    expect(nowSmokingItemToFavorite({ comboId: 'custom:abc', label: 'L' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/nowSmoking.test.ts`
Expected: FAIL — cannot resolve `../src/services/nowSmoking`.

- [ ] **Step 3: Implement**

Create `src/services/nowSmoking.ts`:

```ts
import type { CartItem } from '@/contexts/CartContext';
import type { FavoriteCombo } from '@/services/favoritesService';
import { truncateLabel } from '@/services/comboId';

/**
 * "What is my friend smoking?" - the pure half.
 *
 * nowSmoking/{uid} is a friend-readable projection of an order, written at
 * checkout, in the same spirit as users/{uid}/ratings. The order itself stays
 * owner-only; this module decides exactly what leaves it.
 */

export const NOW_SMOKING_MAX_ITEMS = 5;
export const NOW_SMOKING_TTL_MS = 2 * 60 * 60 * 1000;

export interface NowSmokingItem {
  comboId: string;
  label: string;
  // Custom builds only, so a friend can "Order the same". Personalisation -
  // strength, percentages, add-ons - is deliberately never shared.
  hookahId?: string;
  tobaccoType?: string;
  flavorIds?: string[];
}

export interface NowSmoking {
  items: NowSmokingItem[];
  since: Date;
}

type SharableItem = Pick<CartItem, 'type' | 'comboId' | 'comboLabel' | 'name' | 'hookahId' | 'tobaccoType' | 'flavorIds'>;

export const buildNowSmokingItems = (items: SharableItem[]): NowSmokingItem[] => {
  const seen = new Set<string>();
  const out: NowSmokingItem[] = [];

  for (const item of items) {
    // Orders placed by an older bundle carry no comboId; there is nothing
    // stable to share or to order again, so they are left out.
    if (!item.comboId || seen.has(item.comboId)) continue;
    seen.add(item.comboId);

    const shared: NowSmokingItem = {
      comboId: item.comboId,
      label: truncateLabel(item.comboLabel ?? item.name),
    };
    // Built field by field, never by spread, so no undefined key ever reaches
    // Firestore and nothing personal rides along by accident.
    if (item.type === 'custom' && item.hookahId && item.tobaccoType && item.flavorIds?.length) {
      shared.hookahId = item.hookahId;
      shared.tobaccoType = item.tobaccoType;
      shared.flavorIds = item.flavorIds.slice(0, 10);
    }
    out.push(shared);
    if (out.length === NOW_SMOKING_MAX_ITEMS) break;
  }

  return out;
};

/**
 * `since` is server time and the device clock may be behind it, so a value
 * slightly in the future is fresh rather than rejected.
 */
export const isNowSmokingFresh = (since: Date | undefined | null, now: Date): boolean =>
  !!since && now.getTime() - since.getTime() < NOW_SMOKING_TTL_MS;

/** Shapes an item for resolveReorder, or null when it cannot be ordered. */
export const nowSmokingItemToFavorite = (item: NowSmokingItem): FavoriteCombo | null => {
  if (item.comboId.startsWith('mix:')) {
    return { comboId: item.comboId, label: item.label, kind: 'mix', mixId: item.comboId.slice('mix:'.length) };
  }
  if (item.hookahId && item.tobaccoType && item.flavorIds?.length) {
    return {
      comboId: item.comboId, label: item.label, kind: 'custom',
      hookahId: item.hookahId, tobaccoType: item.tobaccoType, flavorIds: item.flavorIds,
    };
  }
  return null;
};
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run tests/nowSmoking.test.ts`
Expected: 15 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/nowSmoking.ts tests/nowSmoking.test.ts
git commit -m "feat: decide what a now-smoking status shares"
```

---

## Task 2: Pure logic for pokes

**Files:**
- Create: `src/services/pokes.ts`
- Test: `tests/pokes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { POKE_COOLDOWN_MS, isPokeUnseen, pokeCooldownRemainingMs } from '../src/services/pokes';

const t = (ms: number) => new Date(ms);

describe('isPokeUnseen', () => {
  test('never seen is unseen', () => {
    expect(isPokeUnseen({ at: t(1000) })).toBe(true);
  });
  test('seen after the poke is seen', () => {
    expect(isPokeUnseen({ at: t(1000), seenAt: t(2000) })).toBe(false);
  });
  test('poked again after being seen is unseen', () => {
    expect(isPokeUnseen({ at: t(3000), seenAt: t(2000) })).toBe(true);
  });
});

describe('pokeCooldownRemainingMs', () => {
  const now = t(100 * 60_000);
  test('never poked can poke now', () => {
    expect(pokeCooldownRemainingMs(null, now)).toBe(0);
  });
  test('three minutes ago leaves seven', () => {
    expect(pokeCooldownRemainingMs(t(now.getTime() - 3 * 60_000), now)).toBe(7 * 60_000);
  });
  test('past the cooldown can poke now', () => {
    expect(pokeCooldownRemainingMs(t(now.getTime() - POKE_COOLDOWN_MS - 1), now)).toBe(0);
  });
});
```

Save as `tests/pokes.test.ts`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/pokes.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/services/pokes.ts`:

```ts
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
```

- [ ] **Step 4: Run it** — Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/pokes.ts tests/pokes.test.ts
git commit -m "feat: decide when a poke is unseen and when to allow another"
```

---

## Task 3: Pure logic for user-made mixes

**Files:**
- Create: `src/services/userMixes.ts`
- Test: `tests/userMixes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { comboIdForCustom } from '../src/services/comboId';
import {
  USER_MIX_DESCRIPTION_MAX, USER_MIX_NAME_MAX, describeUserMixBuild,
  userMixFromFavorite, userMixToFavorite, validateUserMixInput, type UserMix,
} from '../src/services/userMixes';
import type { FavoriteCombo } from '../src/services/favoritesService';
import type { DatabaseFlavor, DatabaseHookah } from '../src/types/database';

const favorite: FavoriteCombo = {
  comboId: 'custom:x', label: 'Khalil · Mint, Lemon', kind: 'custom',
  hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
  tobaccoStrength: 4, flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 },
  withIce: true, hasLED: true,
};

const mix: UserMix = {
  id: 'm1', creatorUid: 'alice', creatorName: 'Alice', name: 'Lemon Storm',
  hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
  tobaccoStrength: 4, status: 'approved',
};

describe('validateUserMixInput', () => {
  test('a normal name passes', () => {
    expect(validateUserMixInput({ name: 'Lemon Storm' })).toBeNull();
  });
  test('a blank name fails', () => {
    expect(validateUserMixInput({ name: '   ' })).toMatch(/name/i);
  });
  test('an overlong name fails', () => {
    expect(validateUserMixInput({ name: 'x'.repeat(USER_MIX_NAME_MAX + 1) })).toMatch(/name/i);
  });
  test('an overlong description fails', () => {
    expect(validateUserMixInput({ name: 'ok', description: 'x'.repeat(USER_MIX_DESCRIPTION_MAX + 1) }))
      .toMatch(/description/i);
  });
});

describe('userMixFromFavorite', () => {
  test('carries the build, trims input, and drops add-ons', () => {
    expect(userMixFromFavorite(favorite, { name: ' Lemon Storm ', description: ' zesty ' },
      { uid: 'alice', displayName: 'Alice' })).toEqual({
      creatorUid: 'alice', creatorName: 'Alice', name: 'Lemon Storm', description: 'zesty',
      hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
      tobaccoStrength: 4, flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 }, withIce: true,
    });
  });
  test('an empty description is left out', () => {
    expect(userMixFromFavorite(favorite, { name: 'L', description: '  ' }, { uid: 'a', displayName: 'A' }))
      .not.toHaveProperty('description');
  });
  test('a curated mix favourite cannot be shared', () => {
    expect(userMixFromFavorite({ comboId: 'mix:s', label: 'S', kind: 'mix', mixId: 's' },
      { name: 'L' }, { uid: 'a', displayName: 'A' })).toBeNull();
  });
});

describe('userMixToFavorite', () => {
  test('orders as the same custom combo, so ratings and favourites line up', () => {
    const fav = userMixToFavorite(mix);
    expect(fav.kind).toBe('custom');
    expect(fav.comboId).toBe(comboIdForCustom('h1', 'virginia', ['mint:virginia', 'lemon:virginia']));
    expect(fav.label).toBe('Lemon Storm');
    expect(fav.tobaccoStrength).toBe(4);
  });
});

describe('describeUserMixBuild', () => {
  const hookahs = [{ id: 'h1', name: 'Khalil Mamoon' }] as DatabaseHookah[];
  const flavors = [{ id: 'mint', name: 'Mint' }, { id: 'lemon', name: 'Lemon' }] as DatabaseFlavor[];
  test('names the hookah and flavours', () => {
    expect(describeUserMixBuild(mix, hookahs, flavors)).toBe('Khalil Mamoon · Mint, Lemon');
  });
  test('falls back to ids when something is gone', () => {
    expect(describeUserMixBuild(mix, [], [])).toBe('h1 · mint, lemon');
  });
});
```

Save as `tests/userMixes.test.ts`.

- [ ] **Step 2: Run it and confirm it fails** — `npx vitest run tests/userMixes.test.ts`, module not found.

- [ ] **Step 3: Implement**

Create `src/services/userMixes.ts`:

```ts
import { comboIdForCustom } from '@/services/comboId';
import type { FavoriteCombo } from '@/services/favoritesService';
import type { DatabaseFlavor, DatabaseHookah } from '@/types/database';

/** Bounds mirrored in firestore.rules - change both or neither. */
export const USER_MIX_NAME_MAX = 40;
export const USER_MIX_DESCRIPTION_MAX = 140;

export type UserMixStatus = 'pending' | 'approved' | 'rejected';

export interface UserMix {
  id: string;
  creatorUid: string;
  creatorName: string;
  name: string;
  description?: string;
  hookahId: string;
  tobaccoType: string;
  flavorIds: string[];
  tobaccoStrength?: number;
  flavorPercentages?: Record<string, number>;
  withIce?: boolean;
  status: UserMixStatus;
  createdAt?: Date;
  reviewedAt?: Date;
}

export type UserMixSubmission = Omit<UserMix, 'id' | 'status' | 'createdAt' | 'reviewedAt'>;

export interface UserMixInput {
  name: string;
  description?: string;
}

/** A message for the customer, or null when the input is acceptable. */
export const validateUserMixInput = ({ name, description }: UserMixInput): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return 'Give your mix a name.';
  if (trimmed.length > USER_MIX_NAME_MAX) return `Keep the name under ${USER_MIX_NAME_MAX + 1} characters.`;
  if ((description ?? '').trim().length > USER_MIX_DESCRIPTION_MAX) {
    return `Keep the description under ${USER_MIX_DESCRIPTION_MAX + 1} characters.`;
  }
  return null;
};

/**
 * Turns a saved custom favourite into a submission. Add-ons (LED, coloured
 * water, alcohol, fruit) are left out: they are priced extras a customer
 * chooses at the table, not part of the recipe being shared.
 */
export const userMixFromFavorite = (
  favorite: FavoriteCombo,
  input: UserMixInput,
  creator: { uid: string; displayName: string },
): UserMixSubmission | null => {
  if (favorite.kind !== 'custom' || !favorite.hookahId || !favorite.tobaccoType || !favorite.flavorIds?.length) {
    return null;
  }
  const submission: UserMixSubmission = {
    creatorUid: creator.uid,
    creatorName: creator.displayName,
    name: input.name.trim(),
    hookahId: favorite.hookahId,
    tobaccoType: favorite.tobaccoType,
    flavorIds: favorite.flavorIds,
  };
  const description = input.description?.trim();
  if (description) submission.description = description;
  if (favorite.tobaccoStrength !== undefined) submission.tobaccoStrength = favorite.tobaccoStrength;
  if (favorite.flavorPercentages) submission.flavorPercentages = favorite.flavorPercentages;
  if (favorite.withIce !== undefined) submission.withIce = favorite.withIce;
  return submission;
};

/**
 * Shapes a community mix for resolveReorder. The comboId is the ordinary
 * custom-build id, so a customer who orders it, favourites it or rates it
 * lands on the same combo as if they had built it by hand.
 */
export const userMixToFavorite = (mix: UserMix): FavoriteCombo => {
  const favorite: FavoriteCombo = {
    comboId: comboIdForCustom(mix.hookahId, mix.tobaccoType, mix.flavorIds),
    label: mix.name,
    kind: 'custom',
    hookahId: mix.hookahId,
    tobaccoType: mix.tobaccoType,
    flavorIds: mix.flavorIds,
  };
  if (mix.tobaccoStrength !== undefined) favorite.tobaccoStrength = mix.tobaccoStrength;
  if (mix.flavorPercentages) favorite.flavorPercentages = mix.flavorPercentages;
  if (mix.withIce !== undefined) favorite.withIce = mix.withIce;
  return favorite;
};

/** "Khalil Mamoon · Mint, Lemon", for the admin queue and the menu card. */
export const describeUserMixBuild = (
  mix: Pick<UserMix, 'hookahId' | 'flavorIds'>,
  hookahs: Pick<DatabaseHookah, 'id' | 'name'>[],
  flavors: Pick<DatabaseFlavor, 'id' | 'name'>[],
): string => {
  const hookah = hookahs.find((h) => h.id === mix.hookahId)?.name ?? mix.hookahId;
  const names = mix.flavorIds.map((variantId) => {
    const docId = variantId.split(':')[0];
    return flavors.find((f) => f.id === docId)?.name ?? docId;
  });
  return `${hookah} · ${names.join(', ')}`;
};
```

- [ ] **Step 4: Run it** — Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/userMixes.ts tests/userMixes.test.ts
git commit -m "feat: shape, validate and describe user-made mixes"
```

---

## Task 4: Rules, test-first

**Files:**
- Test: `tests/socialExtrasRules.test.ts` *(new)*
- Modify: `firestore.rules`

- [ ] **Step 1: Write the failing rules tests**

Create `tests/socialExtrasRules.test.ts`:

```ts
import { readFileSync } from 'fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const CAROL = 'carol-uid';
const ADMIN = 'admin-uid';
const pair = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

const loadRules = (): string => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  if (!rules.trim()) throw new Error('firestore.rules is empty - refusing to test against allow-all');
  return rules;
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-turbo-menu-extras',
    firestore: { rules: loadRules() },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), path), data); });
};

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed(`profiles/${ALICE}`, { displayName: 'Alice', photoURL: null });
  await seed(`profiles/${BOB}`, { displayName: 'Bob', photoURL: null });
  await seed(`profiles/${CAROL}`, { displayName: null, photoURL: null });
});

const alice = () => testEnv.authenticatedContext(ALICE, { email: 'alice@example.com' }).firestore();
const bob = () => testEnv.authenticatedContext(BOB, { email: 'bob@example.com' }).firestore();
const carol = () => testEnv.authenticatedContext(CAROL, { email: 'carol@example.com' }).firestore();
const admin = () => testEnv.authenticatedContext(ADMIN, { admin: true }).firestore();
const guest = (uid: string) => testEnv.authenticatedContext(uid, {
  firebase: { sign_in_provider: 'anonymous', identities: {} },
}).firestore();
const nobody = () => testEnv.unauthenticatedContext().firestore();

const befriend = (a: string, b: string, status: 'pending' | 'accepted' = 'accepted') =>
  seed(`friendships/${pair(a, b)}`, { uids: [a, b].sort(), requestedBy: a, status });

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);

// ------------------------------------------------------------------ pokes

describe('pokes', () => {
  const poke = (db = alice(), to = BOB, from = ALICE) =>
    setDoc(doc(db, 'users', to, 'pokes', from), { at: serverTimestamp() }, { merge: true });

  test('an accepted friend can poke', async () => {
    await befriend(ALICE, BOB);
    await assertSucceeds(poke());
  });

  test('a pending friend or a stranger cannot', async () => {
    await befriend(ALICE, BOB, 'pending');
    await assertFails(poke());
    await assertFails(poke(carol(), BOB, CAROL));
  });

  test('nobody can poke in someone else\'s name', async () => {
    await befriend(ALICE, BOB);
    await assertFails(poke(alice(), BOB, CAROL));
  });

  test('a guest cannot poke', async () => {
    await befriend(ALICE, BOB);
    await assertFails(setDoc(doc(guest(ALICE), 'users', BOB, 'pokes', ALICE), { at: serverTimestamp() }));
  });

  test('the time cannot be forged and nothing else can be written', async () => {
    await befriend(ALICE, BOB);
    await assertFails(setDoc(doc(alice(), 'users', BOB, 'pokes', ALICE), { at: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(doc(alice(), 'users', BOB, 'pokes', ALICE), { at: serverTimestamp(), msg: 'hi' }));
  });

  test('a second poke inside ten minutes is denied', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(3) });
    await assertFails(poke());
  });

  test('a poke after ten minutes is allowed, and keeps the seen marker', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(11), seenAt: minutesAgo(10) });
    await assertSucceeds(poke());
  });

  test('the recipient marks a poke seen, and can change nothing else', async () => {
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertSucceeds(updateDoc(doc(bob(), 'users', BOB, 'pokes', ALICE), { seenAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(bob(), 'users', BOB, 'pokes', ALICE), { at: serverTimestamp() }));
  });

  test('the poker cannot mark their own poke seen', async () => {
    await befriend(ALICE, BOB);
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertFails(updateDoc(doc(alice(), 'users', BOB, 'pokes', ALICE), { seenAt: serverTimestamp() }));
  });

  test('reads: the recipient lists, the poker gets their own, others nothing', async () => {
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertSucceeds(getDocs(collection(bob(), 'users', BOB, 'pokes')));
    await assertSucceeds(getDoc(doc(alice(), 'users', BOB, 'pokes', ALICE)));
    await assertFails(getDocs(collection(alice(), 'users', BOB, 'pokes')));
    await assertFails(getDoc(doc(carol(), 'users', BOB, 'pokes', ALICE)));
  });

  test('only the recipient deletes', async () => {
    await seed(`users/${BOB}/pokes/${ALICE}`, { at: minutesAgo(1) });
    await assertFails(deleteDoc(doc(alice(), 'users', BOB, 'pokes', ALICE)));
    await assertSucceeds(deleteDoc(doc(bob(), 'users', BOB, 'pokes', ALICE)));
  });
});

// ------------------------------------------------------------ now smoking

describe('now smoking', () => {
  const item = { comboId: 'mix:sunset', label: 'Sunset Blend' };
  const write = (data: Record<string, unknown>, db = alice(), uid = ALICE) =>
    setDoc(doc(db, 'nowSmoking', uid), data);

  test('the owner shares mixes and custom builds', async () => {
    await assertSucceeds(write({
      items: [item, {
        comboId: 'custom:abc', label: 'Khalil · Mint',
        hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia'],
      }],
      since: serverTimestamp(),
    }));
  });

  test('an accepted friend reads it; a pending friend and a stranger do not', async () => {
    await seed(`nowSmoking/${ALICE}`, { items: [item], since: minutesAgo(1) });
    await befriend(ALICE, BOB);
    await assertSucceeds(getDoc(doc(bob(), 'nowSmoking', ALICE)));
    await assertFails(getDoc(doc(carol(), 'nowSmoking', ALICE)));
    await befriend(ALICE, CAROL, 'pending');
    await assertFails(getDoc(doc(carol(), 'nowSmoking', ALICE)));
  });

  test('a friend still cannot read the order behind it', async () => {
    await befriend(ALICE, BOB);
    await seed('orders/o1', { customerInfo: { uid: ALICE }, status: 'pending', total: 100, items: [] });
    await assertFails(getDoc(doc(bob(), 'orders', 'o1')));
  });

  test('nobody writes another customer\'s status', async () => {
    await assertFails(write({ items: [item], since: serverTimestamp() }, bob(), ALICE));
  });

  test('shape and bounds are enforced', async () => {
    await assertFails(write({ items: [item], since: Timestamp.fromMillis(0) }));
    await assertFails(write({ items: [], since: serverTimestamp() }));
    await assertFails(write({ items: Array(6).fill(item), since: serverTimestamp() }));
    await assertFails(write({ items: [{ ...item, label: 'x'.repeat(201) }], since: serverTimestamp() }));
    await assertFails(write({ items: [{ ...item, tobaccoStrength: 7 }], since: serverTimestamp() }));
    await assertFails(write({ items: [item], since: serverTimestamp(), orderId: 'o1' }));
    await assertFails(write({
      items: [{ ...item, flavorIds: Array(11).fill('a:virginia') }], since: serverTimestamp(),
    }));
  });

  test('the owner deletes it', async () => {
    await seed(`nowSmoking/${ALICE}`, { items: [item], since: minutesAgo(1) });
    await assertSucceeds(deleteDoc(doc(alice(), 'nowSmoking', ALICE)));
  });
});

// ------------------------------------------------------------ user mixes

describe('user mixes', () => {
  const submission = (overrides: Record<string, unknown> = {}) => ({
    creatorUid: ALICE, creatorName: 'Alice', name: 'Lemon Storm',
    hookahId: 'h1', tobaccoType: 'virginia', flavorIds: ['mint:virginia', 'lemon:virginia'],
    status: 'pending', createdAt: serverTimestamp(),
    ...overrides,
  });
  const submit = (data: Record<string, unknown>, db = alice()) => setDoc(doc(db, 'userMixes', 'new'), data);

  test('a customer submits a pending mix', async () => {
    await assertSucceeds(submit(submission({
      description: 'Zesty', tobaccoStrength: 4, withIce: true,
      flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 },
    })));
  });

  test('it cannot be submitted already approved', async () => {
    await assertFails(submit(submission({ status: 'approved' })));
  });

  test('it cannot be credited to someone else', async () => {
    await assertFails(submit(submission({ creatorName: 'Bob' })));
    await assertFails(submit(submission({ creatorUid: BOB, creatorName: 'Bob' })));
  });

  test('a customer with no display name cannot submit', async () => {
    await assertFails(submit(submission({ creatorUid: CAROL, creatorName: null }), carol()));
  });

  test('a guest cannot submit', async () => {
    await assertFails(submit(submission(), guest(ALICE)));
  });

  test('bounds are enforced', async () => {
    await assertFails(submit(submission({ name: '' })));
    await assertFails(submit(submission({ name: 'x'.repeat(41) })));
    await assertFails(submit(submission({ description: 'x'.repeat(141) })));
    await assertFails(submit(submission({ flavorIds: [] })));
    await assertFails(submit(submission({ flavorIds: Array(11).fill('a:virginia') })));
    await assertFails(submit(submission({ createdAt: Timestamp.fromMillis(0) })));
    await assertFails(submit(submission({ hasLED: true })));
  });

  describe('reading', () => {
    beforeEach(async () => {
      await seed('userMixes/approved', { ...submission(), createdAt: minutesAgo(5), status: 'approved' });
      await seed('userMixes/pending', { ...submission(), createdAt: minutesAgo(5) });
    });

    test('anyone, even signed out, reads an approved mix', async () => {
      await assertSucceeds(getDoc(doc(nobody(), 'userMixes', 'approved')));
      await assertSucceeds(getDocs(query(collection(nobody(), 'userMixes'), where('status', '==', 'approved'))));
    });

    test('a pending mix is visible to its creator and admins only', async () => {
      await assertFails(getDoc(doc(bob(), 'userMixes', 'pending')));
      await assertSucceeds(getDoc(doc(alice(), 'userMixes', 'pending')));
      await assertSucceeds(getDoc(doc(admin(), 'userMixes', 'pending')));
    });

    test('only admins can list the queue', async () => {
      const pendingQuery = (db: ReturnType<typeof bob>) =>
        getDocs(query(collection(db, 'userMixes'), where('status', '==', 'pending')));
      await assertFails(pendingQuery(bob()));
      await assertSucceeds(pendingQuery(admin()));
    });

    test('a creator lists their own submissions', async () => {
      await assertSucceeds(getDocs(query(collection(alice(), 'userMixes'), where('creatorUid', '==', ALICE))));
    });
  });

  describe('reviewing', () => {
    beforeEach(async () => {
      await seed('userMixes/m1', { ...submission(), createdAt: minutesAgo(5) });
    });

    test('an admin approves or rejects', async () => {
      await assertSucceeds(updateDoc(doc(admin(), 'userMixes', 'm1'), {
        status: 'approved', reviewedAt: serverTimestamp(),
      }));
      await assertSucceeds(updateDoc(doc(admin(), 'userMixes', 'm1'), {
        status: 'rejected', reviewedAt: serverTimestamp(),
      }));
    });

    test('a creator cannot approve their own', async () => {
      await assertFails(updateDoc(doc(alice(), 'userMixes', 'm1'), {
        status: 'approved', reviewedAt: serverTimestamp(),
      }));
    });

    test('a review changes nothing but the verdict', async () => {
      await assertFails(updateDoc(doc(admin(), 'userMixes', 'm1'), {
        status: 'approved', reviewedAt: serverTimestamp(), name: 'Renamed',
      }));
      await assertFails(updateDoc(doc(admin(), 'userMixes', 'm1'), {
        status: 'featured', reviewedAt: serverTimestamp(),
      }));
    });

    test('the creator or an admin deletes; nobody else', async () => {
      await assertFails(deleteDoc(doc(bob(), 'userMixes', 'm1')));
      await assertSucceeds(deleteDoc(doc(alice(), 'userMixes', 'm1')));
      await seed('userMixes/m2', { ...submission(), createdAt: minutesAgo(5) });
      await assertSucceeds(deleteDoc(doc(admin(), 'userMixes', 'm2')));
    });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail for the right reason**

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npx firebase emulators:exec --only firestore --project demo-turbo-menu "npx vitest run tests/socialExtrasRules.test.ts"
```

Expected: every `assertSucceeds` fails (default deny), every `assertFails` passes vacuously. Note which `assertFails` already pass — they prove nothing until the rules exist.

- [ ] **Step 3: Add the rules**

In `firestore.rules`, add these helpers after `isFriendOf`:

```
    // ---------------------------------------------- now smoking (item shape)
    // One shared combo. Rules cannot loop, so smokingItemsOk below checks each
    // of the at-most-five slots by index. Bounds match the favourites block.
    function smokingItemOk(item) {
      return item is map
        && item.keys().hasOnly(['comboId', 'label', 'hookahId', 'tobaccoType', 'flavorIds'])
        && item.comboId is string && item.comboId.size() <= 100
        && item.label is string && item.label.size() <= 200
        && (!('hookahId' in item) || (item.hookahId is string && item.hookahId.size() <= 100))
        && (!('tobaccoType' in item) || (item.tobaccoType is string && item.tobaccoType.size() <= 100))
        && (!('flavorIds' in item) || (item.flavorIds is list && item.flavorIds.size() <= 10));
    }

    function smokingItemsOk(items) {
      return items is list && items.size() >= 1 && items.size() <= 5
        && smokingItemOk(items[0])
        && (items.size() < 2 || smokingItemOk(items[1]))
        && (items.size() < 3 || smokingItemOk(items[2]))
        && (items.size() < 4 || smokingItemOk(items[3]))
        && (items.size() < 5 || smokingItemOk(items[4]));
    }
```

Add these match blocks immediately after the `match /users/{uid}/ratings/{comboId}` block (`match /users/{uid}` is not recursive, so each subcollection needs its own block):

```
    // ------------------------------------------------------------- pokes
    // One document per poker, overwritten on each poke. The deterministic id
    // is what makes the cooldown enforceable: with a new document per poke,
    // nothing short of a server could count them. src/services/pokes.ts
    // mirrors the 10 minutes.
    match /users/{toUid}/pokes/{fromUid} {
      allow get: if isSignedIn()
        && (request.auth.uid == toUid || request.auth.uid == fromUid);
      allow list: if isSignedIn() && request.auth.uid == toUid;

      allow create: if isSignedIn() && isRealAccount()
        && request.auth.uid == fromUid && fromUid != toUid
        && isFriendOf(toUid)
        && request.resource.data.keys().hasOnly(['at'])
        && request.resource.data.at == request.time;

      // Two writers, disjoint fields. The poker may only move `at`, and only
      // once the cooldown has passed - written with merge so the recipient's
      // seenAt survives and stays out of affectedKeys. The recipient may only
      // stamp seenAt.
      allow update: if isSignedIn() && (
        (request.auth.uid == fromUid && isRealAccount() && isFriendOf(toUid)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['at'])
          && request.resource.data.at == request.time
          && resource.data.at < request.time - duration.value(10, 'm'))
        || (request.auth.uid == toUid
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['seenAt'])
          && request.resource.data.seenAt == request.time));

      allow delete: if isSignedIn() && request.auth.uid == toUid;
    }
```

Add these as top-level blocks, after the `friendships` block:

```
    // -------------------------------------------------------- now smoking
    // A friend-readable projection of an order, written at checkout by an
    // opted-in customer - the same pattern as users/{uid}/ratings. The order
    // itself stays owner-only; this is what keeps it that way.
    match /nowSmoking/{uid} {
      allow read: if isSignedIn() && (request.auth.uid == uid || isFriendOf(uid));
      allow create, update: if isSignedIn() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['items', 'since'])
        && request.resource.data.since == request.time
        && smokingItemsOk(request.resource.data.items);
      allow delete: if isSignedIn() && request.auth.uid == uid;
    }

    // --------------------------------------------------------- user mixes
    // Customers submit; admins approve onto the public menu. Approved mixes
    // are public like hookahs and recommendedMixes, because the menu can load
    // before the anonymous session exists. Bounds mirror
    // src/services/userMixes.ts.
    match /userMixes/{mixId} {
      allow read: if resource.data.status == 'approved'
        || (isSignedIn() && (resource.data.creatorUid == request.auth.uid || isAdmin()));

      allow create: if isSignedIn() && isRealAccount()
        && request.resource.data.keys().hasOnly([
             'creatorUid', 'creatorName', 'name', 'description', 'hookahId', 'tobaccoType',
             'flavorIds', 'tobaccoStrength', 'flavorPercentages', 'withIce', 'status', 'createdAt'])
        && request.resource.data.keys().hasAll([
             'creatorUid', 'creatorName', 'name', 'hookahId', 'tobaccoType', 'flavorIds',
             'status', 'createdAt'])
        && request.resource.data.creatorUid == request.auth.uid
        // Credited publicly, so it must be the submitter's own profile name.
        && request.resource.data.creatorName is string
        && request.resource.data.creatorName
             == get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.get('displayName', null)
        && request.resource.data.status == 'pending'
        && request.resource.data.createdAt == request.time
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 1
        && request.resource.data.name.size() <= 40
        && (!('description' in request.resource.data)
            || (request.resource.data.description is string
                && request.resource.data.description.size() <= 140))
        && request.resource.data.hookahId is string
        && request.resource.data.hookahId.size() <= 100
        && request.resource.data.tobaccoType is string
        && request.resource.data.tobaccoType.size() <= 100
        && request.resource.data.flavorIds is list
        && request.resource.data.flavorIds.size() >= 1
        && request.resource.data.flavorIds.size() <= 10
        && (!('tobaccoStrength' in request.resource.data)
            || request.resource.data.tobaccoStrength is number)
        && (!('flavorPercentages' in request.resource.data)
            || (request.resource.data.flavorPercentages is map
                && request.resource.data.flavorPercentages.size() <= 10))
        && (!('withIce' in request.resource.data) || request.resource.data.withIce is bool);

      // Admins only, and only the verdict. A creator who wants changes
      // withdraws and resubmits.
      allow update: if isAdmin()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'reviewedAt'])
        && request.resource.data.status in ['approved', 'rejected']
        && request.resource.data.reviewedAt == request.time;

      allow delete: if isSignedIn()
        && (resource.data.creatorUid == request.auth.uid || isAdmin());
    }
```

- [ ] **Step 4: Run them and confirm they pass**

Same command as Step 2. Expected: all `socialExtrasRules` tests pass.

- [ ] **Step 5: Run the whole suite**

`npm test` — Expected: everything passes, including the untouched `socialRules.test.ts` (105) and `rules.test.ts` (30).

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/socialExtrasRules.test.ts
git commit -m "feat(rules): pokes, now smoking and user-made mixes"
```

---

## Task 5: Firestore services

**Files:**
- Create: `src/services/nowSmokingService.ts`, `src/services/pokeService.ts`, `src/services/userMixService.ts`

No unit tests here: thin Firestore wrappers, matching the rest of `src/services`. The rules they depend on are tested in Task 4 and the logic in Tasks 1-3.

- [ ] **Step 1: `src/services/nowSmokingService.ts`**

```ts
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firestore } from '@/lib/firebase';
import type { CartItem } from '@/contexts/CartContext';
import { buildNowSmokingItems, type NowSmoking, type NowSmokingItem } from './nowSmoking';

/** The opt-in lives on the owner-only users/{uid} doc, beside discoverableByEmail. */
export const getShareNowSmoking = async (uid: string): Promise<boolean> => {
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  return snapshot.exists() && snapshot.data().shareNowSmoking === true;
};

/**
 * Turning it off deletes the live status first, so friends stop seeing it
 * immediately rather than when it expires. If that delete fails, this throws
 * and the flag is left as it was - never "off" while a status is still live.
 */
export const setShareNowSmoking = async (uid: string, enabled: boolean): Promise<void> => {
  if (!enabled) await deleteDoc(doc(firestore, 'nowSmoking', uid));
  await setDoc(doc(firestore, 'users', uid), { shareNowSmoking: enabled }, { merge: true });
};

export const getNowSmoking = async (uid: string): Promise<NowSmoking | null> => {
  const snapshot = await getDoc(doc(firestore, 'nowSmoking', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const since = data.since?.toDate?.();
  if (!since || !Array.isArray(data.items)) return null;
  return { items: data.items as NowSmokingItem[], since };
};

/**
 * Called after an order is placed. Never throws, never blocks: checkout is
 * the bar's revenue path, and sharing a status is a nicety on top of it.
 * Guests are skipped - friends need a real account.
 */
export const shareWhatImSmoking = async (user: User, items: CartItem[]): Promise<void> => {
  try {
    if (user.isAnonymous) return;
    const shared = buildNowSmokingItems(items);
    if (shared.length === 0) return;
    if (!(await getShareNowSmoking(user.uid))) return;
    await setDoc(doc(firestore, 'nowSmoking', user.uid), { items: shared, since: serverTimestamp() });
  } catch (error) {
    console.error('Sharing what you are smoking failed:', error);
  }
};
```

- [ ] **Step 2: `src/services/pokeService.ts`**

```ts
import {
  collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc,
  type FirestoreError, type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import type { Poke } from './pokes';

/**
 * merge: true is load-bearing. The recipient may have stamped seenAt; a plain
 * set would delete it, putting seenAt in affectedKeys, and the rule - which
 * lets the poker touch only `at` - would deny the poke.
 */
export const pokeFriend = (me: string, friendUid: string): Promise<void> =>
  setDoc(doc(firestore, 'users', friendUid, 'pokes', me), { at: serverTimestamp() }, { merge: true });

export const getMyLastPokeAt = async (me: string, friendUid: string): Promise<Date | null> => {
  const snapshot = await getDoc(doc(firestore, 'users', friendUid, 'pokes', me));
  return snapshot.exists() ? snapshot.data().at?.toDate?.() ?? null : null;
};

export const subscribeToPokes = (
  uid: string,
  onChange: (pokes: Poke[]) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe => onSnapshot(
  collection(firestore, 'users', uid, 'pokes'),
  (snapshot) => {
    const pokes = snapshot.docs.map((docSnap) => {
      // 'estimate' so a just-written serverTimestamp reads as "now" locally
      // instead of null until the server confirms it.
      const data = docSnap.data({ serverTimestamps: 'estimate' });
      return { fromUid: docSnap.id, at: data.at?.toDate?.(), seenAt: data.seenAt?.toDate?.() };
    });
    onChange(pokes.filter((poke): poke is Poke => poke.at instanceof Date));
  },
  onError,
);

export const markPokesSeen = (uid: string, fromUids: string[]): Promise<unknown> =>
  Promise.all(fromUids.map((from) =>
    updateDoc(doc(firestore, 'users', uid, 'pokes', from), { seenAt: serverTimestamp() })));
```

- [ ] **Step 3: `src/services/userMixService.ts`**

```ts
import {
  addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import type { UserMix, UserMixStatus, UserMixSubmission } from './userMixes';

const userMixes = () => collection(firestore, 'userMixes');

const toUserMix = (id: string, data: Record<string, any>): UserMix => ({
  ...(data as Omit<UserMix, 'id'>),
  id,
  createdAt: data.createdAt?.toDate?.() ?? undefined,
  reviewedAt: data.reviewedAt?.toDate?.() ?? undefined,
});

// Single-field queries, sorted here. A where + orderBy pair would need a
// composite index, and firestore.indexes.json is out of sync with
// production, so every index deploy is a risk. These lists are small.
const byCreatedAt = (direction: 1 | -1) => (a: UserMix, b: UserMix) =>
  direction * ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

const listWhere = async (field: string, value: string): Promise<UserMix[]> => {
  const snapshot = await getDocs(query(userMixes(), where(field, '==', value)));
  return snapshot.docs.map((d) => toUserMix(d.id, d.data()));
};

export const submitUserMix = async (submission: UserMixSubmission): Promise<string> => {
  const ref = await addDoc(userMixes(), { ...submission, status: 'pending', createdAt: serverTimestamp() });
  return ref.id;
};

export const listMyUserMixes = async (uid: string): Promise<UserMix[]> =>
  (await listWhere('creatorUid', uid)).sort(byCreatedAt(-1));

export const listPendingUserMixes = async (): Promise<UserMix[]> =>
  (await listWhere('status', 'pending')).sort(byCreatedAt(1));

export const listApprovedUserMixes = async (): Promise<UserMix[]> =>
  (await listWhere('status', 'approved')).sort(byCreatedAt(-1));

export const withdrawUserMix = (id: string): Promise<void> => deleteDoc(doc(firestore, 'userMixes', id));

/** Callers must republish the menu snapshot afterwards, like every menu mutation. */
export const reviewUserMix = (id: string, status: Exclude<UserMixStatus, 'pending'>): Promise<void> =>
  updateDoc(doc(firestore, 'userMixes', id), { status, reviewedAt: serverTimestamp() });
```

`submitUserMix` spreads a `UserMixSubmission` built by `userMixFromFavorite`, which never sets an `undefined` key — Firestore rejects those.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit -p tsconfig.app.json`: only the 4 known errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/nowSmokingService.ts src/services/pokeService.ts src/services/userMixService.ts
git commit -m "feat: Firestore services for pokes, now smoking and user mixes"
```

---

## Task 6: Extract the shared "order this favourite" hook

**Files:**
- Create: `src/hooks/useOrderFavorite.ts`
- Modify: `src/pages/Account.tsx` (`handleReorder`, ~lines 77-111)

Pure refactor: Account behaves exactly as before. Three pages will need this flow.

- [ ] **Step 1: Create the hook**

```ts
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { toast } from '@/hooks/use-toast';
import type { FavoriteCombo } from '@/services/favoritesService';
import { resolveReorder, type MenuSnapshot } from '@/services/reorderService';
import { TURBO_TABLE_STORAGE_KEY, isValidTableId } from '@/services/tableValidation';

interface Options {
  /** Account goes to the cart; the menu stays where it is. */
  navigateToCart?: boolean;
  addedDescription?: (favorite: FavoriteCombo) => string;
}

/**
 * Table check -> menu check -> resolveReorder -> add to cart. The price always
 * comes from the live menu, and anything deactivated is named, never silently
 * dropped. Returns whether the item was added.
 */
export const useOrderFavorite = (menu: MenuSnapshot | null, options: Options = {}) => {
  const { addItem } = useCart();
  const navigate = useNavigate();
  const { navigateToCart = false, addedDescription } = options;

  return useCallback((favorite: FavoriteCombo): boolean => {
    const tableId = localStorage.getItem(TURBO_TABLE_STORAGE_KEY);
    if (!isValidTableId(tableId)) {
      toast({
        title: 'No table selected',
        description: "Please scan your table's QR code to place an order.",
        variant: 'destructive',
      });
      return false;
    }

    if (!menu) {
      toast({ title: 'Menu still loading', description: 'Please try again in a moment.', variant: 'destructive' });
      return false;
    }

    const resolution = resolveReorder(favorite, menu, tableId);
    if (resolution.status === 'unavailable') {
      toast({
        title: 'No longer available',
        description: `${resolution.missing.join(', ')} ${resolution.missing.length > 1 ? 'are' : 'is'} no longer on the menu.`,
        variant: 'destructive',
      });
      return false;
    }

    addItem(resolution.item);
    toast({
      title: 'Added to cart',
      description: addedDescription ? addedDescription(favorite) : `${favorite.label} is in your cart.`,
    });
    if (navigateToCart) navigate('/cart');
    return true;
  }, [menu, addItem, navigate, navigateToCart, addedDescription]);
};
```

Check the exact export names in `src/services/tableValidation.ts` (`Account.tsx` already imports `TURBO_TABLE_STORAGE_KEY` and `isValidTableId`) and match them.

- [ ] **Step 2: Use it in Account**

Replace the body of `handleReorder` with the hook. `addedDescription` must be stable or the callback is rebuilt every render, so define it at module scope:

```tsx
// Module scope, so useOrderFavorite's callback is not rebuilt every render.
const backInCart = (favorite: FavoriteCombo) => `${favorite.label} is back in your cart.`;
```

and inside the component, replacing the whole `const handleReorder = (favorite: FavoriteCombo) => { … };` block:

```tsx
  const orderFavorite = useOrderFavorite(menu, { navigateToCart: true, addedDescription: backInCart });
  const handleReorder = (favorite: FavoriteCombo) => { orderFavorite(favorite); };
```

Remove imports from `Account.tsx` that are now unused (`resolveReorder`, `TURBO_TABLE_STORAGE_KEY`, `isValidTableId`, and `addItem` from `useCart` if nothing else uses it). `MenuSnapshot` stays — the `menu` state is typed with it.

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.app.json` (4 known errors), `npm run build`, `npm test` (unchanged count).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useOrderFavorite.ts src/pages/Account.tsx
git commit -m "refactor: share the order-a-favourite flow"
```

---

## Task 7: Share what I'm smoking at checkout

**Files:** Modify `src/pages/Cart.tsx`

- [ ] **Step 1: Add the import**

```tsx
import { shareWhatImSmoking } from '@/services/nowSmokingService';
```

- [ ] **Step 2: Call it after the order is recorded**

In `handleOrderSubmission`, directly after:

```tsx
      const result = await submitOrder(orderData);
      await recordOrderPlaced(user).catch(() => undefined);
```

add:

```tsx
      // Not awaited: it can never fail or delay the order - see
      // shareWhatImSmoking. orderData.items is captured here, before
      // clearCart() empties state.items below.
      void shareWhatImSmoking(user, orderData.items);
```

- [ ] **Step 3: Verify** — typecheck, build, `npm test`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Cart.tsx
git commit -m "feat: share what an opted-in customer is smoking after ordering"
```

---

## Task 8: Friends page — the switch and the "smoking …" line

**Files:** Modify `src/pages/Friends.tsx`

- [ ] **Step 1: Imports**

```tsx
import { getNowSmoking, getShareNowSmoking, setShareNowSmoking } from '@/services/nowSmokingService';
import { isNowSmokingFresh, type NowSmoking } from '@/services/nowSmoking';
```

- [ ] **Step 2: State**

Beside `const [discoverable, setDiscoverableState] = useState(false);`:

```tsx
  const [shareSmoking, setShareSmokingState] = useState(false);
  const [smokingByUid, setSmokingByUid] = useState<Record<string, NowSmoking>>({});
```

- [ ] **Step 3: Load the opt-in with the other per-user settings**

Find the effect that calls `getDiscoverable(user.uid)` and add beside that call:

```tsx
    getShareNowSmoking(user.uid).then(setShareSmokingState).catch(() => setShareSmokingState(false));
```

- [ ] **Step 4: Load friends' statuses whenever the accepted list changes**

Add after the existing effects, using the page's existing `accepted` list (the accepted `FriendRow[]` rendered under "Friends"). If `accepted` is computed inline in JSX rather than as a variable, compute it once near the top of the render body first.

```tsx
  // One read per friend. Denied or missing simply means "nothing to show" -
  // they may not have opted in, and that is not an error.
  const acceptedUids = accepted.map((row) => row.otherUid).join(',');
  useEffect(() => {
    if (!acceptedUids) { setSmokingByUid({}); return; }
    let cancelled = false;
    Promise.all(acceptedUids.split(',').map(async (uid) =>
      [uid, await getNowSmoking(uid).catch(() => null)] as const))
      .then((entries) => {
        if (cancelled) return;
        const now = new Date();
        setSmokingByUid(Object.fromEntries(entries.filter(
          (entry): entry is readonly [string, NowSmoking] => !!entry[1] && isNowSmokingFresh(entry[1].since, now))));
      });
    return () => { cancelled = true; };
  }, [acceptedUids]);
```

`acceptedUids` is a string so the effect does not re-run on every render from a fresh array identity.

- [ ] **Step 5: The switch**

Directly after the "Let people find me by email" switch row (the `<div className="flex items-center justify-between border-t border-border pt-3">` containing `<Switch id="discoverable" …/>`), add:

```tsx
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <Label htmlFor="share-smoking" className="text-sm">
                    Let friends see what I'm smoking
                  </Label>
                  <Switch
                    id="share-smoking" checked={shareSmoking}
                    onCheckedChange={async (checked) => {
                      if (!user) return;
                      try {
                        await setShareNowSmoking(user.uid, checked);
                        setShareSmokingState(checked);
                      } catch (error) {
                        toast({ title: 'Could not change that', description: String(error), variant: 'destructive' });
                      }
                    }}
                  />
                </div>
```

- [ ] **Step 6: The "smoking …" line**

In the accepted-friends list, the name button has `className="flex-1 truncate text-left underline"` and renders `{row.displayName ?? 'Friend'}`. Remove `underline` from the button's className (a child cannot cancel a parent's text-decoration, so the status line would be underlined too) and replace the button's contents with:

```tsx
                          <span className="block truncate underline">{row.displayName ?? 'Friend'}</span>
                          {smokingByUid[row.otherUid] && (
                            <span className="block truncate text-xs text-turbo-muted">
                              {`smoking ${smokingByUid[row.otherUid].items.map((item) => item.label).join(', ')}`}
                            </span>
                          )}
```

- [ ] **Step 7: Verify** — typecheck, build, `npm test` (the translate guard must still pass).

- [ ] **Step 8: Commit**

```bash
git add src/pages/Friends.tsx
git commit -m "feat: opt in to sharing what you smoke, and see friends' on /friends"
```

---

## Task 9: Friend profile — Now smoking card with Order the same

**Files:** Modify `src/pages/FriendProfile.tsx`

- [ ] **Step 1: Imports**

```tsx
import { getNowSmoking } from '@/services/nowSmokingService';
import { isNowSmokingFresh, nowSmokingItemToFavorite, type NowSmoking } from '@/services/nowSmoking';
import { getMenuData } from '@/services/menuService';
import type { MenuSnapshot } from '@/services/reorderService';
import { useOrderFavorite } from '@/hooks/useOrderFavorite';
```

(Skip any already present.)

- [ ] **Step 2: State and data**

```tsx
  const [nowSmoking, setNowSmoking] = useState<NowSmoking | null>(null);
  const [menu, setMenu] = useState<MenuSnapshot | null>(null);
  const orderFavorite = useOrderFavorite(menu);

  useEffect(() => {
    getMenuData().then(setMenu).catch(() => setMenu(null));
  }, []);
```

Add `getNowSmoking(uid)` to the existing `Promise.allSettled([...])` as a **fourth** entry, destructure it as `nowSmokingResult`, and set:

```tsx
      const smoking = nowSmokingResult.status === 'fulfilled' ? nowSmokingResult.value : null;
      setNowSmoking(smoking && isNowSmokingFresh(smoking.since, new Date()) ? smoking : null);
```

Do **not** add `nowSmokingResult` to the `failures` list. A denial or absence of `nowSmoking` just means the friend has not opted in, and must not turn the page into "You can only see this once you are friends".

- [ ] **Step 3: The card**

Render above the `<FavoritesList` on this page:

```tsx
            {nowSmoking && (
              <Card className="bg-turbo-card border-border">
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold">Now smoking</h3>
                  {nowSmoking.items.map((item) => {
                    const favorite = nowSmokingItemToFavorite(item);
                    return (
                      <div key={item.comboId} className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{item.label}</span>
                        {favorite && (
                          <Button size="sm" variant="outline" onClick={() => orderFavorite(favorite)}>
                            Order the same
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
```

Import `Card`, `CardContent` and `Button` from `@/components/ui/*` if the file does not already.

- [ ] **Step 4: Verify and commit**

```bash
git add src/pages/FriendProfile.tsx
git commit -m "feat: see what a friend is smoking and order the same"
```

---

## Task 10: Poke provider and badge

**Files:**
- Create: `src/contexts/PokeContext.tsx`
- Modify: `src/App.tsx`, `src/components/NavigationSidebar.tsx`

- [ ] **Step 1: The provider**

```tsx
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

    return subscribeToPokes(uid, (next) => {
      setPokes(next);
      const unseen = next.filter(isPokeUnseen);

      if (announced.current === null) {
        announced.current = new Map(unseen.map((p) => [p.fromUid, p.at.getTime()]));
        return;
      }
      for (const poke of unseen) {
        if (announced.current.get(poke.fromUid) === poke.at.getTime()) continue;
        announced.current.set(poke.fromUid, poke.at.getTime());
        void announce(uid, poke.fromUid);
      }
    }, (error) => console.error('Poke listener failed:', error));
  }, [uid]);

  const announce = async (me: string, fromUid: string) => {
    let name = names.current.get(fromUid);
    if (!name) {
      name = (await getPublicProfile(fromUid).catch(() => null))?.displayName ?? 'A friend';
      names.current.set(fromUid, name);
    }
    toast({
      title: `${name} poked you 👉`,
      action: (
        <ToastAction
          altText="Poke back"
          onClick={() => {
            pokeFriend(me, fromUid).catch(() =>
              toast({ title: 'You poked them recently - try again in a few minutes.' }));
          }}
        >
          Poke back
        </ToastAction>
      ),
    });
  };

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
```

Check `src/components/ui/toast.tsx` exports `ToastAction` (shadcn's does). Because this file returns JSX it must be `.tsx`.

- [ ] **Step 2: Mount it**

In `src/App.tsx`, wrap the tree directly inside `<AuthProvider>` with `<PokeProvider>…</PokeProvider>` (it reads `useAuth`, so it must sit inside it). Import it from `@/contexts/PokeContext`.

- [ ] **Step 3: The badge**

In `src/components/NavigationSidebar.tsx`, the trigger renders `<Menu className="h-4 w-4" />` inside the `SheetTrigger`'s button. Import `usePokes`, read `const { unseenCount } = usePokes();` in the component, make the button `relative` if it is not, and add after the icon:

```tsx
            {unseenCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                aria-label={`${unseenCount} unseen pokes`}
              >
                {unseenCount}
              </span>
            )}
```

- [ ] **Step 4: Verify** — typecheck, build, `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/PokeContext.tsx src/App.tsx src/components/NavigationSidebar.tsx
git commit -m "feat: hear about pokes while the app is open"
```

---

## Task 11: The poke button

**Files:**
- Create: `src/components/PokeButton.tsx`
- Modify: `src/pages/Friends.tsx`, `src/pages/FriendProfile.tsx`

- [ ] **Step 1: The component**

```tsx
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getMyLastPokeAt, pokeFriend } from '@/services/pokeService';
import { pokeCooldownRemainingMs } from '@/services/pokes';

export const PokeButton: React.FC<{ friendUid: string; friendName: string | null }> = ({ friendUid, friendName }) => {
  const { user } = useAuth();
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyLastPokeAt(user.uid, friendUid)
      .then((at) => { if (!cancelled) setLastAt(at); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [user, friendUid]);

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
```

- [ ] **Step 2: On /friends**

In each accepted-friend row, add `<PokeButton friendUid={row.otherUid} friendName={row.displayName} />` before the Remove button.

Also mark pokes seen on arrival: import `usePokes`, and add

```tsx
  const { markAllSeen } = usePokes();
  useEffect(() => { markAllSeen(); }, [markAllSeen]);
```

`markAllSeen` changes identity when the poke list changes, so pokes that arrive while the customer is on `/friends` are marked seen too. That is intended.

- [ ] **Step 3: On the friend profile**

Next to the page heading, when the friendship is not denied and `uid` is set:

```tsx
            <PokeButton friendUid={uid} friendName={profile?.displayName ?? null} />
```

- [ ] **Step 4: Verify and commit**

```bash
git add src/components/PokeButton.tsx src/pages/Friends.tsx src/pages/FriendProfile.tsx
git commit -m "feat: poke a friend"
```

---

## Task 12: Community mixes in the menu snapshot

**Files:** Modify `src/services/menuService.ts`

- [ ] **Step 1: Import**

```ts
import { listApprovedUserMixes } from './userMixService';
import type { UserMix } from './userMixes';
```

- [ ] **Step 2: `MenuData`**

Add to the interface:

```ts
  // Approved community mixes. Optional: a snapshot published before this
  // shipped carries none, and that reads as "no community mixes".
  communityMixes?: UserMix[];
```

- [ ] **Step 3: The fallback path**

In `fetchMenuCollections`, add `listApprovedUserMixes().catch(() => [])` as the last entry of the `Promise.all`, destructure it as `communityMixes`, and return it. The `.catch` is load-bearing: this list must never be able to take the whole menu down with it.

- [ ] **Step 4: The snapshot path**

In `getMenuData`'s snapshot branch, add to the returned object:

```ts
        communityMixes: reviveMenuItems<UserMix>(data.communityMixes),
```

`publishMenuSnapshot()` builds from `fetchMenuCollections()`, so it now embeds approved mixes with no further change.

- [ ] **Step 5: Verify and commit**

```bash
git add src/services/menuService.ts
git commit -m "feat: carry approved community mixes in the menu snapshot"
```

---

## Task 13: Submitting a mix from Account

**Files:**
- Create: `src/components/ShareMixDialog.tsx`, `src/components/MyUserMixes.tsx`
- Modify: `src/components/ComboLists.tsx`, `src/pages/Account.tsx`

- [ ] **Step 1: `onShare` on `FavoritesList`**

In `ComboLists.tsx`, add to `FavoritesListProps`:

```ts
  // Account's signed-in list only. Rendered for custom builds - a curated
  // mix is already on the menu.
  onShare?: (favorite: FavoriteCombo) => void;
```

destructure it, and next to the existing `onReorder` button render:

```tsx
          {onShare && favorite.kind === 'custom' && (
            <Button size="sm" variant="ghost" onClick={() => onShare(favorite)}>
              Share as a mix
            </Button>
          )}
```

Match the size and variant of the neighbouring buttons in that file.

- [ ] **Step 2: The dialog**

```tsx
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import type { FavoriteCombo } from '@/services/favoritesService';
import { getPublicProfile } from '@/services/profileService';
import { submitUserMix } from '@/services/userMixService';
import {
  USER_MIX_DESCRIPTION_MAX, USER_MIX_NAME_MAX, userMixFromFavorite, validateUserMixInput,
} from '@/services/userMixes';

interface Props {
  favorite: FavoriteCombo | null;
  uid: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export const ShareMixDialog: React.FC<Props> = ({ favorite, uid, onClose, onSubmitted }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setName(''); setDescription(''); onClose(); };

  const submit = async () => {
    if (!favorite) return;
    const problem = validateUserMixInput({ name, description });
    if (problem) { toast({ title: problem, variant: 'destructive' }); return; }

    setBusy(true);
    try {
      // Read from the profile, not the auth user: the rule compares against
      // profiles/{uid}.displayName, so this is the value that will pass.
      const displayName = (await getPublicProfile(uid))?.displayName;
      if (!displayName) {
        toast({ title: 'Set a display name first', description: 'Your mix is credited to you by name.', variant: 'destructive' });
        return;
      }
      const submission = userMixFromFavorite(favorite, { name, description }, { uid, displayName });
      if (!submission) {
        toast({ title: 'Only custom builds can be shared', variant: 'destructive' });
        return;
      }
      await submitUserMix(submission);
      toast({ title: 'Submitted for review', description: 'The bar will take a look before it goes on the menu.' });
      onSubmitted();
      close();
    } catch (error) {
      toast({ title: 'Could not submit your mix', description: String(error), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={favorite !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share as a mix</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mix-name">Name</Label>
            <Input id="mix-name" value={name} maxLength={USER_MIX_NAME_MAX} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mix-description">Description (optional)</Label>
            <Input
              id="mix-description" value={description} maxLength={USER_MIX_DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 3: The submissions list**

```tsx
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
```

An approved mix the creator removes disappears from the menu at the next snapshot publish, which happens on any admin menu edit. This is acceptable: the spec allows the creator to withdraw, and a stale card resolves through `resolveReorder` like any other.

- [ ] **Step 4: Wire into Account**

In the **signed-in** branch only:

```tsx
  const [sharing, setSharing] = useState<FavoriteCombo | null>(null);
  const [mixesRefresh, setMixesRefresh] = useState(0);
```

pass `onShare={setSharing}` to that branch's `<FavoritesList>`, and render after it:

```tsx
            <MyUserMixes uid={user.uid} refreshToken={mixesRefresh} />
            <ShareMixDialog
              favorite={sharing} uid={user.uid}
              onClose={() => setSharing(null)}
              onSubmitted={() => setMixesRefresh((n) => n + 1)}
            />
```

The guest branch gets none of this — submitting needs a real account.

- [ ] **Step 5: Verify and commit**

```bash
git add src/components/ComboLists.tsx src/components/ShareMixDialog.tsx src/components/MyUserMixes.tsx src/pages/Account.tsx
git commit -m "feat: submit a custom build as a community mix"
```

---

## Task 14: The admin review queue

**Files:**
- Create: `src/components/admin/CommunityMixesAdmin.tsx`
- Modify: `src/pages/MenuManagement.tsx`

- [ ] **Step 1: The component**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { DatabaseFlavor, DatabaseHookah } from '@/types/database';
import { listApprovedUserMixes, listPendingUserMixes, reviewUserMix } from '@/services/userMixService';
import { describeUserMixBuild, type UserMix } from '@/services/userMixes';

interface Props {
  hookahs: DatabaseHookah[];
  flavors: DatabaseFlavor[];
  /** MenuManagement's publishAndReload: approving must reach the guest snapshot. */
  onChanged: () => Promise<void>;
}

export const CommunityMixesAdmin: React.FC<Props> = ({ hookahs, flavors, onChanged }) => {
  const [pending, setPending] = useState<UserMix[]>([]);
  const [approved, setApproved] = useState<UserMix[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([listPendingUserMixes(), listApprovedUserMixes()]);
    setPending(p);
    setApproved(a);
  }, []);

  useEffect(() => {
    load().catch((error) => toast({ title: 'Could not load community mixes', description: String(error), variant: 'destructive' }));
  }, [load]);

  const review = async (mix: UserMix, status: 'approved' | 'rejected') => {
    setBusyId(mix.id);
    try {
      await reviewUserMix(mix.id, status);
      await onChanged();
      await load();
    } catch (error) {
      toast({ title: 'Could not update that mix', description: String(error), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const row = (mix: UserMix, actions: React.ReactNode) => (
    <Card key={mix.id} className="bg-turbo-card border-border">
      <CardContent className="p-4 space-y-1">
        <p className="font-semibold">{mix.name}</p>
        <p className="text-xs text-turbo-muted">{`by ${mix.creatorName}`}</p>
        <p className="text-sm">{describeUserMixBuild(mix, hookahs, flavors)}</p>
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
            <Button size="sm" disabled={busyId === mix.id} onClick={() => review(mix, 'approved')}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busyId === mix.id} onClick={() => review(mix, 'rejected')}>Reject</Button>
          </>
        )))}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{`On the menu (${approved.length})`}</h2>
        {approved.length === 0 && <p className="text-sm text-turbo-muted">No community mixes yet.</p>}
        {approved.map((mix) => row(mix, (
          <Button size="sm" variant="outline" disabled={busyId === mix.id} onClick={() => review(mix, 'rejected')}>Remove</Button>
        )))}
      </section>
    </div>
  );
};
```

- [ ] **Step 2: The tab**

In `MenuManagement.tsx`, after `<TabsTrigger value="mixes">Recommended Mixes</TabsTrigger>` add:

```tsx
            <TabsTrigger value="community">Community Mixes</TabsTrigger>
```

and after the `<TabsContent value="mixes">…</TabsContent>` block:

```tsx
          <TabsContent value="community">
            <CommunityMixesAdmin hookahs={hookahs} flavors={flavors} onChanged={publishAndReload} />
          </TabsContent>
```

If the `TabsList` uses a fixed grid (`grid-cols-4`), widen it to fit five triggers.

- [ ] **Step 3: Verify and commit**

```bash
git add src/components/admin/CommunityMixesAdmin.tsx src/pages/MenuManagement.tsx
git commit -m "feat: review community mixes in the back office"
```

---

## Task 15: Community mixes on the menu

**Files:**
- Create: `src/components/CommunityMixes.tsx`
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: The component**

```tsx
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
```

- [ ] **Step 2: On the menu**

In `Index.tsx`:

```tsx
import { CommunityMixes } from '@/components/CommunityMixes';
import { useOrderFavorite } from '@/hooks/useOrderFavorite';
import type { UserMix } from '@/services/userMixes';
```

Beside the other menu state, `const [communityMixes, setCommunityMixes] = useState<UserMix[]>([]);`. Where `loadMenuData` assigns `setRecommendedMixes(menu.recommendedMixes);`, add `setCommunityMixes(menu.communityMixes ?? []);`.

In the component body:

```tsx
  // Same object shape resolveReorder takes; memoised so the hook's callback
  // and every card's resolution are not rebuilt on each keystroke.
  const menuSnapshot = useMemo(
    () => ({ hookahs, flavors, recommendedMixes }),
    [hookahs, flavors, recommendedMixes],
  );
  const orderCommunityMix = useOrderFavorite(menuSnapshot);
```

(add `useMemo` to the React import if it is missing). Then insert, directly after the closing `</section>` of the Recommended Mixes section and before `<section ref={step1Ref}>`:

```tsx
          {!isLoading && (
            <CommunityMixes mixes={communityMixes} menu={menuSnapshot} onAdd={orderCommunityMix} />
          )}
```

- [ ] **Step 3: Verify and commit**

```bash
git add src/components/CommunityMixes.tsx src/pages/Index.tsx
git commit -m "feat: show and order community mixes on the menu"
```

---

## Task 16: Verify and open the PR

- [ ] **Step 1: Everything**

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: 0 failed across **14 files** — the 10 baseline files plus `nowSmoking`, `pokes`, `userMixes` and `socialExtrasRules`. `socialRules.test.ts` still at 105 and `rules.test.ts` at 30, unchanged. Exactly 4 `tsc` errors in `firebaseService.ts`. Build succeeds.

- [ ] **Step 2: Blast radius**

```bash
git fetch origin
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- firestore.rules | grep -E '^[-]' | grep -v '^---'
```

The second command lists removed rule lines. Expected: **none** — every rules change is additive. `firestore.indexes.json` must not appear in the stat.

- [ ] **Step 3: PR**

```bash
git push -u origin feat/poke-now-smoking-user-mixes
gh pr create --base main --title "feat: pokes, now smoking and community mixes" --body "See docs/superpowers/specs/2026-10-13-poke-now-smoking-user-mixes-design.md"
```

- [ ] **Step 4: After merge — rules deploy**

From an **up-to-date `main` checkout** (`firebase deploy` reads `firestore.rules` from disk, not from git):

```bash
git checkout main && git pull --ff-only
npx firebase deploy --only firestore:rules --project turbo-menu-30079
```

Not `npm run rules:deploy`: it also deploys indexes, and the indexes file is missing 3 production indexes that `--force` would delete. No index deploy is needed for this feature.

Until the rules are deployed, pokes, now smoking and submissions fail with permission-denied and the menu simply shows no community mixes. Checkout is unaffected either way.
