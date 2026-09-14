import { describe, expect, test } from 'vitest';
import { resolveReorder } from '../src/services/reorderService';
import type { MenuSnapshot } from '../src/services/reorderService';
import { comboIdForCustom, comboIdForMix } from '../src/services/comboId';
import type { FavoriteCombo } from '../src/services/favoritesService';
import type { DatabaseFlavor, DatabaseHookah, DatabaseRecommendedMix } from '../src/types/database';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const hookah = (overrides: Partial<DatabaseHookah> = {}): DatabaseHookah => ({
  id: 'hookah-1',
  name: 'Khalil Mamoon',
  price: 60,
  image: 'khalil.webp',
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const flavor = (overrides: Partial<DatabaseFlavor> = {}): DatabaseFlavor => ({
  id: 'mint',
  name: 'Mint',
  image: 'mint.webp',
  compatibleTobaccoTypes: ['virginia', 'darkblend'],
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const mix = (overrides: Partial<DatabaseRecommendedMix> = {}): DatabaseRecommendedMix => ({
  id: 'sunset',
  name: 'Sunset Blend',
  price: 90,
  category: 'virginia',
  mainImage: 'sunset.webp',
  flavorImages: [],
  bgColor: 'bg-amber-900',
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const emptyMenu: MenuSnapshot = { hookahs: [], flavors: [], recommendedMixes: [] };

describe('resolveReorder - mix favourites', () => {
  test('re-prices from the live menu - a favourite stores no price to fall back on', () => {
    // The menu price has moved on since this was favourited; nothing on the
    // favourite itself carries a price for the resolver to trust instead.
    const menu: MenuSnapshot = { ...emptyMenu, recommendedMixes: [mix({ price: 120 })] };
    const favorite: FavoriteCombo = {
      comboId: comboIdForMix('sunset'), label: 'Sunset Blend', kind: 'mix', mixId: 'sunset',
    };

    const result = resolveReorder(favorite, menu, 'table-7');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.item.price).toBe(120);
    }
  });

  test('a deactivated mix resolves to unavailable, naming it from the favourite label', () => {
    const menu: MenuSnapshot = { ...emptyMenu, recommendedMixes: [mix({ isActive: false })] };
    const favorite: FavoriteCombo = {
      comboId: comboIdForMix('sunset'), label: 'Sunset Blend', kind: 'mix', mixId: 'sunset',
    };

    expect(resolveReorder(favorite, menu, 'table-7'))
      .toEqual({ status: 'unavailable', missing: ['Sunset Blend'] });
  });

  test('a mix gone from the menu entirely resolves to unavailable, naming it', () => {
    const favorite: FavoriteCombo = {
      comboId: comboIdForMix('sunset'), label: 'Sunset Blend', kind: 'mix', mixId: 'sunset',
    };

    expect(resolveReorder(favorite, emptyMenu, 'table-7'))
      .toEqual({ status: 'unavailable', missing: ['Sunset Blend'] });
  });

  test('falls back to the "mix" category when the favourite has none', () => {
    // toggleMixFavorite in Index.tsx never stores a category today - it is
    // picked later, at order time - so this is the common case in practice.
    const menu: MenuSnapshot = { ...emptyMenu, recommendedMixes: [mix()] };
    const favorite: FavoriteCombo = {
      comboId: comboIdForMix('sunset'), label: 'Sunset Blend', kind: 'mix', mixId: 'sunset',
    };

    const result = resolveReorder(favorite, menu, 'table-7');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.item.tobaccoType).toBe('mix');
      expect(result.item.name).toBe('Sunset Blend (Mix)');
      expect(result.item.id).toBe('mix-sunset-mix');
      expect(result.item.comboId).toBe(comboIdForMix('sunset'));
      expect(result.item.comboLabel).toBe('Sunset Blend');
      expect(result.item.table).toBe('table-7');
    }
  });

  test('uses the favourite\'s stored tobaccoType as the category when present', () => {
    const menu: MenuSnapshot = { ...emptyMenu, recommendedMixes: [mix()] };
    const favorite: FavoriteCombo = {
      comboId: comboIdForMix('sunset'),
      label: 'Sunset Blend',
      kind: 'mix',
      mixId: 'sunset',
      tobaccoType: 'darkblend',
    };

    const result = resolveReorder(favorite, menu, 'table-7');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.item.tobaccoType).toBe('darkblend');
      expect(result.item.name).toBe('Sunset Blend (Darkblend)');
    }
  });
});

describe('resolveReorder - custom builds', () => {
  const baseFavorite: FavoriteCombo = {
    comboId: comboIdForCustom('hookah-1', 'virginia', ['mint:virginia']),
    label: 'Khalil Mamoon · Mint',
    kind: 'custom',
    hookahId: 'hookah-1',
    tobaccoType: 'virginia',
    flavorIds: ['mint:virginia'],
    tobaccoStrength: 5,
    hasLED: true,
    hasFruits: true,
  };

  test('resolves with every flavour present; price is hookah + selected addons', () => {
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah({ price: 60 })],
      flavors: [flavor()],
    };

    const result = resolveReorder(baseFavorite, menu, 'table-3');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      // 60 (hookah) + 30 (LED) + 20 (Fruits); ColoredWater/Alcohol unset.
      expect(result.item.price).toBe(110);
      expect(result.item.flavors).toEqual(['Mint']);
      expect(result.item.hookah).toBe('Khalil Mamoon');
      expect(result.item.hookahId).toBe('hookah-1');
      expect(result.item.tobaccoType).toBe('virginia');
      expect(result.item.tobaccoStrength).toBe(5);
      expect(result.item.hasLED).toBe(true);
      expect(result.item.hasFruits).toBe(true);
      expect(result.item.hasColoredWater).toBeFalsy();
      expect(result.item.hasAlcohol).toBeFalsy();
      expect(result.item.table).toBe('table-3');
    }
  });

  test('one deactivated flavour makes the whole build unavailable, naming that flavour', () => {
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      flavors: [flavor({ isActive: false })],
    };

    expect(resolveReorder(baseFavorite, menu, 'table-3'))
      .toEqual({ status: 'unavailable', missing: ['Mint'] });
  });

  test('does not silently drop a good flavour when a sibling flavour is gone entirely', () => {
    const twoFlavorFavorite: FavoriteCombo = {
      ...baseFavorite,
      flavorIds: ['mint:virginia', 'ghost:virginia'],
    };
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      // Only mint exists; "ghost" has no document at all.
      flavors: [flavor()],
    };

    // Falls back to the raw flavour id - there is no name to show for a
    // document that no longer exists.
    expect(resolveReorder(twoFlavorFavorite, menu, 'table-3'))
      .toEqual({ status: 'unavailable', missing: ['ghost'] });
  });

  test('a flavour whose compatibleTobaccoTypes no longer includes the saved variant counts as missing', () => {
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      // An admin removed 'virginia' from this flavour's compatible types.
      flavors: [flavor({ compatibleTobaccoTypes: ['darkblend'] })],
    };

    expect(resolveReorder(baseFavorite, menu, 'table-3'))
      .toEqual({ status: 'unavailable', missing: ['Mint'] });
  });

  test('a deactivated hookah counts as missing, falling back to its raw id', () => {
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah({ isActive: false })],
      flavors: [flavor()],
    };

    // FavoriteCombo has no separate field for the bare hookah name (only the
    // combined "hookah · flavours" label), so the id is what stands in.
    expect(resolveReorder(baseFavorite, menu, 'table-3'))
      .toEqual({ status: 'unavailable', missing: ['hookah-1'] });
  });

  test('flavorPercentages in the legacy UI {id}-{type} key shape still resolve', () => {
    const favorite: FavoriteCombo = {
      ...baseFavorite,
      flavorPercentages: { 'mint-virginia': 70 },
    };
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      flavors: [flavor()],
    };

    const result = resolveReorder(favorite, menu, 'table-3');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.item.flavorPercentages).toEqual({ 'mint:virginia': 70 });
    }
  });

  test('flavorPercentages in the current {id}:{type} key shape resolve', () => {
    const favorite: FavoriteCombo = {
      ...baseFavorite,
      flavorPercentages: { 'mint:virginia': 65 },
    };
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      flavors: [flavor()],
    };

    const result = resolveReorder(favorite, menu, 'table-3');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.item.flavorPercentages).toEqual({ 'mint:virginia': 65 });
    }
  });

  test('a favourite with no flavorPercentages carries none on the resolved item', () => {
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      flavors: [flavor()],
    };

    const result = resolveReorder(baseFavorite, menu, 'table-3');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.item.flavorPercentages).toBeUndefined();
    }
  });

  // This is the invariant that keeps favourites and ratings agreeing: a
  // rating is filed under an order item's comboId/comboLabel, and a
  // favourite's comboId under the same. They must never diverge for what is
  // otherwise the same build.
  test('produces the same comboId and comboLabel the original order path would for the same build', () => {
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      flavors: [flavor()],
    };

    const result = resolveReorder(baseFavorite, menu, 'table-3');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      // What finalizeAddToCart in Index.tsx computes for this same build
      // (hookah-1, virginia, single flavour "mint:virginia", no ice).
      expect(result.item.comboId).toBe(comboIdForCustom('hookah-1', 'virginia', ['mint:virginia']));
      expect(result.item.comboLabel).toBe('Khalil Mamoon · Mint');
    }
  });

  // The single-flavour, no-ice, non-mix build above is the one shape where a
  // bare flavour-name join happens to equal finalizeAddToCart's real output.
  // These three cover the shapes where they diverge if reorderService ever
  // goes back to building its own flavour strings instead of using
  // comboDisplay.ts: two-or-more flavours, ice, and a mix-type build with the
  // per-flavour variant tag.
  test('two or more flavours carry percentages into comboLabel and flavors, matching finalizeAddToCart', () => {
    // Mirrors this file's own regression scenario: Khalil Mamoon + Mint 60%
    // + Lemon 40%, no ice, virginia (non-mix, so no variant tag).
    const favorite: FavoriteCombo = {
      comboId: comboIdForCustom('hookah-1', 'virginia', ['mint:virginia', 'lemon:virginia']),
      label: 'Khalil Mamoon · Mint 60%, Lemon 40%',
      kind: 'custom',
      hookahId: 'hookah-1',
      tobaccoType: 'virginia',
      flavorIds: ['mint:virginia', 'lemon:virginia'],
      flavorPercentages: { 'mint:virginia': 60, 'lemon:virginia': 40 },
    };
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      flavors: [
        flavor({ id: 'mint', name: 'Mint', compatibleTobaccoTypes: ['virginia', 'darkblend'] }),
        flavor({ id: 'lemon', name: 'Lemon', compatibleTobaccoTypes: ['virginia'] }),
      ],
    };

    const result = resolveReorder(favorite, menu, 'table-3');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      // finalizeAddToCart: selectedFlavors.length >= 2, so showPct is true
      // for both flavours; virginia isn't 'mix', so no variant tag.
      expect(result.item.flavors).toEqual(['Mint 60%', 'Lemon 40%']);
      expect(result.item.comboLabel).toBe('Khalil Mamoon · Mint 60%, Lemon 40%');
    }
  });

  test('a build with ice folds an Ice entry into flavors and comboLabel, matching finalizeAddToCart', () => {
    // Two flavours whose stored percentages sum to 80 - the ice share
    // finalizeAddToCart would have used is the 20 left over from 100.
    const favorite: FavoriteCombo = {
      comboId: comboIdForCustom('hookah-1', 'darkblend', ['mint:darkblend', 'lemon:darkblend']),
      label: 'Khalil Mamoon · Mint 45%, Lemon 35%, Ice (20%)',
      kind: 'custom',
      hookahId: 'hookah-1',
      tobaccoType: 'darkblend',
      flavorIds: ['mint:darkblend', 'lemon:darkblend'],
      flavorPercentages: { 'mint:darkblend': 45, 'lemon:darkblend': 35 },
      withIce: true,
    };
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      flavors: [
        flavor({ id: 'mint', name: 'Mint', compatibleTobaccoTypes: ['darkblend'] }),
        flavor({ id: 'lemon', name: 'Lemon', compatibleTobaccoTypes: ['darkblend'] }),
      ],
    };

    const result = resolveReorder(favorite, menu, 'table-3');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.item.flavors).toEqual(['Mint 45%', 'Lemon 35%', 'Ice (20%)']);
      expect(result.item.comboLabel).toBe('Khalil Mamoon · Mint 45%, Lemon 35%, Ice (20%)');
    }
  });

  test('a Mix-type build with ice tags each flavour\'s category, matching finalizeAddToCart exactly', () => {
    // The failure scenario from the review: Mint (Virginia) 40%, Lemon
    // (Darkblend) 30%, Ice 30% - the admin dashboard renders nothing but
    // this exact `flavors` join, so it must carry the category tags and the
    // ice entry or staff cannot tell which flavour is which blend.
    const favorite: FavoriteCombo = {
      comboId: comboIdForCustom('hookah-1', 'mix', ['mint:virginia', 'lemon:darkblend']),
      label: 'Khalil Mamoon · Mint (Virginia) 40%, Lemon (Darkblend) 30%, Ice (30%)',
      kind: 'custom',
      hookahId: 'hookah-1',
      tobaccoType: 'mix',
      flavorIds: ['mint:virginia', 'lemon:darkblend'],
      flavorPercentages: { 'mint:virginia': 40, 'lemon:darkblend': 30 },
      withIce: true,
    };
    const menu: MenuSnapshot = {
      ...emptyMenu,
      hookahs: [hookah()],
      flavors: [
        flavor({ id: 'mint', name: 'Mint', compatibleTobaccoTypes: ['virginia', 'darkblend'] }),
        flavor({ id: 'lemon', name: 'Lemon', compatibleTobaccoTypes: ['virginia', 'darkblend'] }),
      ],
    };

    const result = resolveReorder(favorite, menu, 'table-3');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.item.flavors).toEqual([
        'Mint (Virginia) 40%', 'Lemon (Darkblend) 30%', 'Ice (30%)',
      ]);
      expect(result.item.comboLabel).toBe(
        'Khalil Mamoon · Mint (Virginia) 40%, Lemon (Darkblend) 30%, Ice (30%)',
      );
      // withIce carried through and the flavour percentages resolved and
      // re-keyed canonically - the ice share itself is never stored as a
      // flavour id, only derived for display.
      expect(result.item.flavorPercentages).toEqual({ 'mint:virginia': 40, 'lemon:darkblend': 30 });
    }
  });
});
