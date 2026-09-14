# Hookah of the Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin promote exactly one hookah on the customer menu — promotion only, no pricing, no rotation, no expiry.

**Architecture:** A pointer document at `menu/featured` holds `{ hookahId, promoText? }`, so "exactly one" is enforced by construction rather than by clearing a flag on another record. `publishMenuSnapshot()` folds the pointer into the existing `menu/current` snapshot, so customers still read the whole menu in one document. A pure resolver turns the pointer plus the hookah list into a renderable result, or `null` when the pointer dangles.

**Tech Stack:** Vite, React 18, TypeScript, Firebase Firestore (client SDK), shadcn/ui, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-hookah-of-the-day-design.md`

**Branch:** `feat/hookah-of-the-day`, already cut from `main`. The spec is committed at `28ef17d`.

---

## Things to know before you start

**Do not run `npm run dev`.** It points at the bar's live production database. Verify with `npm test` and `npm run build` only.

**`npm test` needs a JDK on PATH** — it wraps Vitest in the Firestore emulator:

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npm test
```

Baseline before you start: **151 passed, 0 failed** across 6 files (socialRules 78, reorderService 17, rules 30, comboId 15, orderItem 9, orderService 2). `PERMISSION_DENIED` lines on stderr are expected — those tests assert that denials happen.

**`npx tsc --noEmit -p tsconfig.app.json` reports exactly 4 pre-existing errors**, all in `src/services/firebaseService.ts`. That is the accepted baseline; add none.

**`npx eslint` is broken repo-wide** (ESLint 9 vs the installed `@typescript-eslint`). Not yours to fix.

**`tsconfig.app.json` sets `strict: false`**, so `strictNullChecks` is off and control-flow narrowing on a negated discriminant does not work. `src/services/reorderService.ts` uses explicit type predicates to work around this — do not "simplify" those away.

**No `firestore.rules` change is needed anywhere in this plan.** `match /menu/{document}` is already `allow read: if true; allow write: if isAdmin()`, which covers `menu/featured`. If you find yourself editing `firestore.rules`, stop — something has gone wrong.

---

## File structure

| File | Responsibility |
|---|---|
| `src/types/database.ts` | add the `FeaturedHookah` shape next to the other persisted types |
| `src/services/hookahOfTheDay.ts` *(new)* | pure resolver; no Firebase imports, so it unit-tests directly |
| `tests/hookahOfTheDay.test.ts` *(new)* | tests for the resolver |
| `src/services/menuService.ts` | read/write `menu/featured`; carry it through the snapshot and the fallback |
| `src/components/HookahOfTheDayCard.tsx` *(new)* | the hero card; presentational only |
| `src/pages/Index.tsx` | hero placement, badge in the Step 1 grid, pick-and-scroll |
| `src/pages/MenuManagement.tsx` | admin picker, promo line, clear |

`Index.tsx` is already ~1200 lines and has been flagged for it in review, which is why the hero card is its own file rather than more JSX in the page.

---

## Task 1: The `FeaturedHookah` type and the pure resolver

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/services/hookahOfTheDay.ts`
- Test: `tests/hookahOfTheDay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/hookahOfTheDay.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { resolveHookahOfTheDay } from '../src/services/hookahOfTheDay';
import type { DatabaseHookah, FeaturedHookah } from '../src/types/database';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const hookah = (overrides: Partial<DatabaseHookah> = {}): DatabaseHookah => ({
  id: 'hookah-1',
  name: 'Khalil Mamoon',
  price: 120,
  image: '/img/khalil.webp',
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('resolveHookahOfTheDay', () => {
  test('a valid pointer resolves to the hookah and its promo text', () => {
    const hookahs = [hookah(), hookah({ id: 'hookah-2', name: 'Amotion' })];
    const featured: FeaturedHookah = { hookahId: 'hookah-2', promoText: 'Smooth and slow' };

    expect(resolveHookahOfTheDay(hookahs, featured)).toEqual({
      hookah: hookahs[1],
      promoText: 'Smooth and slow',
    });
  });

  test('a pointer with no promo text resolves with the hookah alone', () => {
    const hookahs = [hookah()];

    expect(resolveHookahOfTheDay(hookahs, { hookahId: 'hookah-1' })).toEqual({
      hookah: hookahs[0],
    });
  });

  test('no pointer at all resolves to null', () => {
    expect(resolveHookahOfTheDay([hookah()], undefined)).toBeNull();
  });

  test('a pointer to an unknown id resolves to null', () => {
    // The hookah was deleted after being featured.
    expect(resolveHookahOfTheDay([hookah()], { hookahId: 'hookah-gone' })).toBeNull();
  });

  test('a pointer to a deactivated hookah resolves to null', () => {
    // The bar switched it off without remembering it was the promotion. It must
    // not be advertised - the bar will not serve it.
    const hookahs = [hookah({ isActive: false })];

    expect(resolveHookahOfTheDay(hookahs, { hookahId: 'hookah-1' })).toBeNull();
  });

  test('whitespace-only promo text is treated as absent', () => {
    const hookahs = [hookah()];

    expect(resolveHookahOfTheDay(hookahs, { hookahId: 'hookah-1', promoText: '   ' }))
      .toEqual({ hookah: hookahs[0] });
  });

  test('an empty hookah list resolves to null rather than throwing', () => {
    expect(resolveHookahOfTheDay([], { hookahId: 'hookah-1' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run tests/hookahOfTheDay.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/services/hookahOfTheDay"`.

(Use `npx vitest run` for this task, not `npm test`. This test needs no emulator, and running just the one file is faster while iterating. Run the full `npm test` before committing.)

- [ ] **Step 3: Add the type**

In `src/types/database.ts`, directly after the `DatabaseHookah` interface (which ends at line 102 with `}`), add:

```ts
/**
 * The admin's current promotion: a pointer to one hookah, not a flag on it.
 *
 * A boolean on each hookah could not enforce "exactly one" - setting a new one
 * would mean clearing the old one, two writes that can half-fail and leave two
 * hookahs featured, or none. With a pointer, picking a new hookah IS the unset
 * of the previous one.
 */
export interface FeaturedHookah {
  hookahId: string;
  /**
   * Optional promo line, capped at MAX_PROMO_TEXT_LENGTH. It rides inside the
   * public menu snapshot that every customer downloads on every visit, so it is
   * bounded for the same reason order items stopped carrying base64 images.
   */
  promoText?: string;
}
```

- [ ] **Step 4: Write the resolver**

Create `src/services/hookahOfTheDay.ts`:

```ts
import type { DatabaseHookah, FeaturedHookah } from '@/types/database';

/**
 * Bound on the promo line. The menu snapshot is the hottest read path in the
 * app - every customer downloads it on every visit - and this project has
 * already had documents bloat to 91% of the 1MiB limit by carrying unbounded
 * data. Enforced when writing, in menuService.setFeaturedHookah.
 */
export const MAX_PROMO_TEXT_LENGTH = 140;

export interface ResolvedHookahOfTheDay {
  hookah: DatabaseHookah;
  promoText?: string;
}

/**
 * Turn the stored pointer into something renderable, or nothing.
 *
 * Takes the hookah list rather than MenuData on purpose: MenuData lives in
 * menuService, which imports Firebase, and this module stays pure so it can be
 * unit tested without an emulator - the same reason comboId.ts and
 * reorderService.ts are shaped this way.
 *
 * Returns null rather than repairing the pointer when it dangles. A hookah
 * deactivated today may be switched back on tomorrow, so clearing the
 * promotion on the admin's behalf would be a surprise, not a kindness.
 */
export const resolveHookahOfTheDay = (
  hookahs: DatabaseHookah[],
  featured: FeaturedHookah | undefined,
): ResolvedHookahOfTheDay | null => {
  if (!featured?.hookahId) return null;

  const hookah = hookahs.find((candidate) => candidate.id === featured.hookahId);
  if (!hookah || !hookah.isActive) return null;

  const promoText = featured.promoText?.trim();
  return promoText ? { hookah, promoText } : { hookah };
};
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npx vitest run tests/hookahOfTheDay.test.ts
```

Expected: PASS — 7 passed, 0 failed.

- [ ] **Step 6: Run the full suite and typecheck**

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npm test
npx tsc --noEmit -p tsconfig.app.json
```

Expected: 158 passed, 0 failed across 7 files (the 151 baseline plus this file's 7). `tsc`: the same 4 pre-existing `firebaseService.ts` errors, nothing new.

- [ ] **Step 7: Commit**

```bash
git add src/types/database.ts src/services/hookahOfTheDay.ts tests/hookahOfTheDay.test.ts
git commit -m "feat: resolve the featured hookah from a pointer"
```

---

## Task 2: Read and write `menu/featured`

**Files:**
- Modify: `src/services/menuService.ts`

No test in this task. These are thin Firestore wrappers with no branching logic worth an emulator test, matching the other functions already in this file (`updateHookah`, `createRecommendedMix` and the rest have none). The logic that *can* be got wrong lives in Task 1's resolver, which is tested.

- [ ] **Step 1: Add the document id constant**

In `src/services/menuService.ts`, the snapshot constants currently read:

```ts
const MENU_SNAPSHOT_COLLECTION = 'menu';
const MENU_SNAPSHOT_ID = 'current';
```

Add a third line directly beneath them:

```ts
// Sibling of the snapshot under the same collection, so it inherits
// `match /menu/{document}` - public read, admin write - with no rules change.
const FEATURED_HOOKAH_ID = 'featured';
```

- [ ] **Step 2: Import the type and the cap**

The file's type import currently reads:

```ts
import { DatabaseHookah, DatabaseTobaccoType, DatabaseFlavor, DatabaseRecommendedMix } from '@/types/database';
```

Change it to:

```ts
import { DatabaseHookah, DatabaseTobaccoType, DatabaseFlavor, DatabaseRecommendedMix, FeaturedHookah } from '@/types/database';
import { MAX_PROMO_TEXT_LENGTH } from './hookahOfTheDay';
```

- [ ] **Step 3: Add the three operations**

Add at the end of `src/services/menuService.ts`:

```ts
// ------------------------------------------------- hookah of the day

/**
 * Read the promotion pointer. Returns undefined when nothing is featured,
 * which is the normal resting state, not an error.
 *
 * Field-by-field rather than a spread: this document is admin-written and
 * therefore trusted, but a stray field would otherwise ride into the public
 * snapshot that every customer downloads.
 */
export const getFeaturedHookah = async (): Promise<FeaturedHookah | undefined> => {
  const snapshot = await getDoc(doc(firestore, MENU_SNAPSHOT_COLLECTION, FEATURED_HOOKAH_ID));
  if (!snapshot.exists()) return undefined;

  const data = snapshot.data();
  if (typeof data.hookahId !== 'string' || !data.hookahId) return undefined;

  return {
    hookahId: data.hookahId,
    promoText: typeof data.promoText === 'string' ? data.promoText : undefined,
  };
};

/**
 * Point the promotion at a hookah. setDoc rather than updateDoc so clearing the
 * promo line actually removes it instead of leaving the previous one behind.
 *
 * Callers must republish the menu snapshot afterwards, or guests keep seeing
 * the previous promotion - the same contract every other mutation in this file
 * has.
 */
export const setFeaturedHookah = async (hookahId: string, promoText?: string): Promise<void> => {
  const trimmed = promoText?.trim();
  await setDoc(doc(firestore, MENU_SNAPSHOT_COLLECTION, FEATURED_HOOKAH_ID), stripUndefined({
    hookahId,
    promoText: trimmed ? trimmed.slice(0, MAX_PROMO_TEXT_LENGTH) : undefined,
  }));
};

/** Ends the promotion. Deleting is the whole of it - there is no "off" state. */
export const clearFeaturedHookah = async (): Promise<void> => {
  await deleteDoc(doc(firestore, MENU_SNAPSHOT_COLLECTION, FEATURED_HOOKAH_ID));
};
```

`stripUndefined`, `getDoc`, `setDoc`, `deleteDoc`, `doc` and `firestore` are all already imported in this file — check the import block at the top before adding anything.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: the same 4 pre-existing `firebaseService.ts` errors, nothing new.

- [ ] **Step 5: Commit**

```bash
git add src/services/menuService.ts
git commit -m "feat: read and write the featured hookah pointer"
```

---

## Task 3: Carry the pointer through the menu snapshot

**Files:**
- Modify: `src/services/menuService.ts`

- [ ] **Step 1: Extend `MenuData`**

It currently reads:

```ts
export interface MenuData {
  hookahs: DatabaseHookah[];
  tobaccoTypes: DatabaseTobaccoType[];
  flavors: DatabaseFlavor[];
  recommendedMixes: DatabaseRecommendedMix[];
}
```

Replace with:

```ts
export interface MenuData {
  hookahs: DatabaseHookah[];
  tobaccoTypes: DatabaseTobaccoType[];
  flavors: DatabaseFlavor[];
  recommendedMixes: DatabaseRecommendedMix[];
  // Optional: a snapshot published before this shipped carries no such key, and
  // that must read as "nothing featured" rather than as an error.
  hookahOfTheDay?: FeaturedHookah;
}
```

- [ ] **Step 2: Read it on the fallback path**

`fetchMenuCollections` currently reads:

```ts
const fetchMenuCollections = async (): Promise<MenuData> => {
  const [hookahs, tobaccoTypes, flavors, recommendedMixes] = await Promise.all([
    getHookahs(),
    getTobaccoTypes(),
    getFlavors(),
    getRecommendedMixes()
  ]);
  return { hookahs, tobaccoTypes, flavors, recommendedMixes };
};
```

Replace with:

```ts
const fetchMenuCollections = async (): Promise<MenuData> => {
  const [hookahs, tobaccoTypes, flavors, recommendedMixes, hookahOfTheDay] = await Promise.all([
    getHookahs(),
    getTobaccoTypes(),
    getFlavors(),
    getRecommendedMixes(),
    getFeaturedHookah()
  ]);
  return { hookahs, tobaccoTypes, flavors, recommendedMixes, hookahOfTheDay };
};
```

`publishMenuSnapshot()` builds the snapshot from `fetchMenuCollections()` and writes `stripUndefined(menu)`, so the pointer is embedded automatically and `stripUndefined` drops the key when nothing is featured. No change needed there.

Note the ordering constraint this creates: `getFeaturedHookah` is declared at the bottom of the file in Task 2, and `fetchMenuCollections` is above it. That is fine — these are `const` arrow functions referenced at call time, not at module evaluation time.

- [ ] **Step 3: Read it on the snapshot path**

`getMenuData` currently returns, inside the `if (snapshot.exists())` branch:

```ts
      return {
        hookahs: reviveMenuItems<DatabaseHookah>(data.hookahs),
        tobaccoTypes: reviveMenuItems<DatabaseTobaccoType>(data.tobaccoTypes),
        flavors: reviveMenuItems<DatabaseFlavor>(data.flavors),
        recommendedMixes: reviveMenuItems<DatabaseRecommendedMix>(data.recommendedMixes)
      };
```

Replace with:

```ts
      return {
        hookahs: reviveMenuItems<DatabaseHookah>(data.hookahs),
        tobaccoTypes: reviveMenuItems<DatabaseTobaccoType>(data.tobaccoTypes),
        flavors: reviveMenuItems<DatabaseFlavor>(data.flavors),
        recommendedMixes: reviveMenuItems<DatabaseRecommendedMix>(data.recommendedMixes),
        // Not run through reviveMenuItems: it is a single object with no
        // timestamps, not a list of menu items.
        hookahOfTheDay: data.hookahOfTheDay ?? undefined
      };
```

- [ ] **Step 4: Typecheck and build**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: 4 pre-existing errors only; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/services/menuService.ts
git commit -m "feat: carry the featured hookah through the menu snapshot"
```

---

## Task 4: The hero card component

**Files:**
- Create: `src/components/HookahOfTheDayCard.tsx`

Presentational only — it takes a resolved result and a callback, and holds no data fetching and no Firestore access.

- [ ] **Step 1: Write the component**

Create `src/components/HookahOfTheDayCard.tsx`:

```tsx
import React from 'react';
import { Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ResolvedHookahOfTheDay } from '@/services/hookahOfTheDay';

interface Props {
  resolved: ResolvedHookahOfTheDay;
  /** Selects the hookah in the builder and scrolls the customer to it. */
  onPick: () => void;
}

export const HookahOfTheDayCard: React.FC<Props> = ({ resolved, onPick }) => {
  const { hookah, promoText } = resolved;

  return (
    <Card className="bg-turbo-card border-2 border-amber-400 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-4 p-4">
          <img
            src={hookah.image}
            alt={hookah.name}
            className="h-24 w-24 rounded object-cover flex-shrink-0"
            loading="lazy"
            decoding="async"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              Hookah of the day
            </p>
            <h3 className="truncate text-lg font-bold">{hookah.name}</h3>
            {promoText && (
              <p className="text-sm text-turbo-muted line-clamp-2">{promoText}</p>
            )}
            <p className="mt-1 font-bold text-amber-400">{hookah.price} Lei</p>
          </div>
          <Button
            className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={onPick}
          >
            Pick
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 2: Typecheck and build**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: 4 pre-existing errors only; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/HookahOfTheDayCard.tsx
git commit -m "feat: add the hookah of the day hero card"
```

---

## Task 5: Place the hero and the badge on the menu

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Add the imports**

`src/pages/Index.tsx` imports `getMenuData` at line 21. Add alongside the other imports at the top of the file:

```tsx
import { HookahOfTheDayCard } from '@/components/HookahOfTheDayCard';
import { resolveHookahOfTheDay } from '@/services/hookahOfTheDay';
import type { FeaturedHookah } from '@/types/database';
```

- [ ] **Step 2: Hold the pointer in state**

The state block around line 82 declares `recommendedMixes`. Add next to it:

```tsx
  const [featuredHookah, setFeaturedHookah] = useState<FeaturedHookah | undefined>(undefined);
```

- [ ] **Step 3: Populate it when the menu loads**

In the `loadMenuData` effect, the menu fields are assigned around line 110:

```tsx
        setHookahs(menu.hookahs);
        setTobaccoTypes(menu.tobaccoTypes);
        setFlavors(menu.flavors);
        setRecommendedMixes(menu.recommendedMixes);
```

Add one line after them:

```tsx
        setFeaturedHookah(menu.hookahOfTheDay);
```

- [ ] **Step 4: Resolve it and add the pick handler**

`step1Ref` is declared at line 94 and attached to the Step 1 `<section>` at line 757. Add this below the other derived values in the component body — put it directly after the existing `const currentFlavors = getExpandedFlavors();` line:

```tsx
  // Resolved rather than read straight from state: the pointer can name a
  // hookah that has since been deleted or switched off, and neither should
  // render. See src/services/hookahOfTheDay.ts.
  const hookahOfTheDay = resolveHookahOfTheDay(hookahs, featuredHookah);

  const pickHookahOfTheDay = () => {
    if (!hookahOfTheDay) return;
    setSelectedHookah(hookahOfTheDay.hookah.id);
    step1Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
```

- [ ] **Step 5: Render the hero above the mixes carousel**

The page body currently opens like this (around line 674):

```tsx
        <div className="container mx-auto px-4 py-6 space-y-8">
          <section>
            <WelcomeHeader />
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-6">Recommended Mixes</h2>
```

Insert a section between the two, so the promotion sits above the carousel:

```tsx
        <div className="container mx-auto px-4 py-6 space-y-8">
          <section>
            <WelcomeHeader />
          </section>
          {hookahOfTheDay && (
            <section>
              <HookahOfTheDayCard resolved={hookahOfTheDay} onPick={pickHookahOfTheDay} />
            </section>
          )}
          <section>
            <h2 className="text-xl font-semibold mb-6">Recommended Mixes</h2>
```

There is deliberately no skeleton here. While `isLoading` is true, `hookahs` is empty, so `resolveHookahOfTheDay` returns `null` and nothing renders — a placeholder for a promotion that may not exist would be worse than no placeholder.

- [ ] **Step 6: Badge the hookah in the Step 1 grid**

The hookah card in the Step 1 grid currently opens at around line 760:

```tsx
                <Card 
                  key={hookah.id} 
                  className={`bg-turbo-card border ${getHookahTypeBorder(getHookahTobaccoType(hookah.name))} cursor-pointer transition-all ${
                    selectedHookah === hookah.id ? 'border-4' : 'border-2'
                  }`}
                  onClick={() => setSelectedHookah(hookah.id)}
                >
                  <CardContent className="p-4 text-center">
```

Replace those lines with:

```tsx
                <Card 
                  key={hookah.id} 
                  className={`bg-turbo-card border ${getHookahTypeBorder(getHookahTobaccoType(hookah.name))} cursor-pointer transition-all ${
                    selectedHookah === hookah.id ? 'border-4' : 'border-2'
                  } ${hookahOfTheDay?.hookah.id === hookah.id ? 'ring-2 ring-amber-400' : ''}`}
                  onClick={() => setSelectedHookah(hookah.id)}
                >
                  <CardContent className="p-4 text-center">
                    {hookahOfTheDay?.hookah.id === hookah.id && (
                      <p className="mb-1 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                        <Star className="h-3 w-3 fill-current" />
                        Today
                      </p>
                    )}
```

A `ring` rather than a heavier border, because the border width on this card already encodes selection — overloading it would make the featured hookah look selected.

`Star` must be imported from `lucide-react` in `Index.tsx`. Check the existing `lucide-react` import line and add `Star` to it if it is not already there.

- [ ] **Step 7: Typecheck, build, and run the suite**

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm test
```

Expected: 4 pre-existing errors only; build succeeds; 158 passed, 0 failed.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: show the hookah of the day on the menu"
```

---

## Task 6: The admin control

**Files:**
- Modify: `src/pages/MenuManagement.tsx`

- [ ] **Step 1: Add the imports**

`MenuManagement.tsx` already imports `Tabs`, `Card`, `CardContent`, `Button`, `Input`, `Select` and friends, and pulls menu operations from `@/services/menuService` in a block starting around line 22. Add to that service import block:

```tsx
  getFeaturedHookah,
  setFeaturedHookah,
  clearFeaturedHookah,
```

and alongside the other type imports:

```tsx
import type { FeaturedHookah } from '@/types/database';
import { MAX_PROMO_TEXT_LENGTH } from '@/services/hookahOfTheDay';
```

- [ ] **Step 2: Hold the state**

Next to the other state declarations (around line 52, where `recommendedMixes` is declared):

```tsx
  const [featured, setFeatured] = useState<FeaturedHookah | undefined>(undefined);
  const [featuredPromo, setFeaturedPromo] = useState('');
  const [featuredSaving, setFeaturedSaving] = useState(false);
```

- [ ] **Step 3: Load it with the rest of the menu**

`loadMenuData` currently reads:

```tsx
  const loadMenuData = async () => {
    try {
      setIsLoading(true);
      const [hookahsData, tobaccoData, flavorsData, mixesData] = await Promise.all([
        getHookahs(),
        getTobaccoTypes(),
        getFlavors(),
        getRecommendedMixes()
      ]);
      
      setHookahs(hookahsData);
      setTobaccoTypes(tobaccoData);
      setFlavors(flavorsData);
      setRecommendedMixes(mixesData);
```

Replace that portion with:

```tsx
  const loadMenuData = async () => {
    try {
      setIsLoading(true);
      const [hookahsData, tobaccoData, flavorsData, mixesData, featuredData] = await Promise.all([
        getHookahs(),
        getTobaccoTypes(),
        getFlavors(),
        getRecommendedMixes(),
        getFeaturedHookah()
      ]);
      
      setHookahs(hookahsData);
      setTobaccoTypes(tobaccoData);
      setFlavors(flavorsData);
      setRecommendedMixes(mixesData);
      setFeatured(featuredData);
      // Seeded from the stored value so editing the line and then picking a
      // hookah does not silently wipe the promo text that is already live.
      setFeaturedPromo(featuredData?.promoText ?? '');
```

Leave the `catch`/`finally` blocks below untouched. Keep the destructuring order matching the promise order — a mismatch here assigns the wrong data to every field and nothing will flag it.

- [ ] **Step 4: Add the handlers**

Add next to the other handlers, e.g. after `handleEditHookah`:

```tsx
  // Picking a new hookah IS the unset of the previous one - the pointer holds a
  // single id - so there is nothing to clear first.
  const handleSetFeatured = async (hookahId: string) => {
    setFeaturedSaving(true);
    try {
      await setFeaturedHookah(hookahId, featuredPromo);
      await publishAndReload();
      toast({ title: 'Hookah of the day updated' });
    } catch (error) {
      console.error('Error setting hookah of the day:', error);
      toast({
        title: 'Could not update the hookah of the day',
        variant: 'destructive',
      });
    } finally {
      setFeaturedSaving(false);
    }
  };

  const handleClearFeatured = async () => {
    setFeaturedSaving(true);
    try {
      await clearFeaturedHookah();
      setFeaturedPromo('');
      await publishAndReload();
      toast({ title: 'Hookah of the day cleared' });
    } catch (error) {
      console.error('Error clearing hookah of the day:', error);
      toast({
        title: 'Could not clear the hookah of the day',
        variant: 'destructive',
      });
    } finally {
      setFeaturedSaving(false);
    }
  };
```

`publishAndReload` already exists at line 147 and is what every other mutation on this screen calls — it republishes the guest-facing snapshot and then reloads local state. Without it the change is invisible to customers.

- [ ] **Step 5: Render the control**

Inside `<TabsContent value="hookahs">`, directly after the `flex justify-between` header block that ends with the "Add Hookah" button and before the search `<div className="relative mb-6">`, insert:

```tsx
            <Card className="bg-turbo-card border-amber-400/40 mb-6">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold">Hookah of the day</h3>
                <p className="text-xs text-turbo-muted">
                  Shown as a banner above the menu and badged in the hookah list.
                  One at a time — picking a new one replaces the current.
                </p>

                <Input
                  placeholder="Optional promo line, e.g. Smooth and slow"
                  value={featuredPromo}
                  maxLength={MAX_PROMO_TEXT_LENGTH}
                  onChange={(e) => setFeaturedPromo(e.target.value)}
                  className="bg-turbo-bg border-border text-turbo-text"
                />
                <p className="text-right text-[10px] text-turbo-muted">
                  {featuredPromo.length}/{MAX_PROMO_TEXT_LENGTH}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={featured?.hookahId ?? ''}
                    onValueChange={handleSetFeatured}
                    disabled={featuredSaving}
                  >
                    <SelectTrigger className="w-64 bg-turbo-bg border-border">
                      <SelectValue placeholder="Choose a hookah" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Active only, so the ordinary path cannot create a
                          dangling pointer. The resolver still guards the case,
                          because a hookah can be deactivated after it was
                          featured. */}
                      {hookahs.filter((h) => h.isActive).map((hookah) => (
                        <SelectItem key={hookah.id} value={hookah.id}>
                          {hookah.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {featured && (
                    <Button
                      variant="outline"
                      onClick={handleClearFeatured}
                      disabled={featuredSaving}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {featured && !hookahs.some((h) => h.id === featured.hookahId && h.isActive) && (
                  // The featured hookah was deleted or switched off after being
                  // picked. Customers see nothing; say so here, where it can be
                  // fixed.
                  <p className="text-xs text-destructive">
                    The featured hookah is no longer active, so customers are not seeing it.
                  </p>
                )}
              </CardContent>
            </Card>
```

Check that `Select`, `SelectTrigger`, `SelectValue`, `SelectContent` and `SelectItem` are in the file's import block — the tobacco form already uses them around line 846, so they should be.

- [ ] **Step 6: Typecheck, build, and run the suite**

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npx tsc --noEmit -p tsconfig.app.json
npm run build
npm test
```

Expected: 4 pre-existing errors only; build succeeds; 158 passed, 0 failed.

- [ ] **Step 7: Commit**

```bash
git add src/pages/MenuManagement.tsx
git commit -m "feat: let an admin pick the hookah of the day"
```

---

## Task 7: Verify and open the PR

**Files:** none

- [ ] **Step 1: Run everything**

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: **158 passed, 0 failed** across 7 files (hookahOfTheDay 7, socialRules 78, reorderService 17, rules 30, comboId 15, orderItem 9, orderService 2); exactly 4 `tsc` errors, all in `src/services/firebaseService.ts`; build succeeds.

- [ ] **Step 2: Confirm the blast radius**

```bash
git fetch origin
git diff origin/main...HEAD --stat
```

Use `origin/main`, not `main`. The local `main` ref in this clone is stale — it sits at
the PR #10 era, several merges behind — so `git diff main...HEAD` drags in the whole
social-features release and reports 42 files instead of this branch's 9.

Expected: nine files — two docs (`docs/superpowers/specs/2026-09-14-hookah-of-the-day-design.md`, `docs/superpowers/plans/2026-09-14-hookah-of-the-day.md`), six source files (`src/types/database.ts`, `src/services/hookahOfTheDay.ts`, `src/services/menuService.ts`, `src/components/HookahOfTheDayCard.tsx`, `src/pages/Index.tsx`, `src/pages/MenuManagement.tsx`), and one test file (`tests/hookahOfTheDay.test.ts`).

`firestore.rules` and `firestore.indexes.json` must **not** appear. If either does, stop and find out why.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/hookah-of-the-day
gh pr create --base main --title "feat: hookah of the day" --body "See docs/superpowers/specs/2026-09-14-hookah-of-the-day-design.md"
```

- [ ] **Step 4: After merge**

Vercel deploys on merge. **No rules deploy is needed** — `match /menu/{document}` already covers `menu/featured`.

The first promotion will not appear until an admin picks one and the snapshot republishes, which `publishAndReload` does automatically.

---

## Notes for whoever executes this

**The one thing not to get wrong.** The promotion must never render a hookah the bar will not serve. `resolveHookahOfTheDay` returning `null` for a deleted or deactivated hookah is the whole safety property, and it is the only part of this feature with tests. If you change it, keep the tests honest.

**Republishing is not optional.** `getMenuData()` reads a single published document; writing `menu/featured` alone changes nothing for customers. Every admin path must call `publishAndReload()`.

**No rules work.** If you reach for `firestore.rules`, something is wrong — `menu/{document}` already permits public read and admin write.

**Do not run `npm run dev`.** Live production database.
