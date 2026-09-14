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
});
