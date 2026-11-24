/**
 * The cross-platform contract. Every case below is run through the TypeScript
 * implementation - the reference - and compared with contract/vectors/*.json.
 * The iOS and Android test suites load the same JSON files, so all three
 * clients are held to identical behaviour.
 *
 * To change behaviour on purpose: edit the code or a case here, run
 * `UPDATE_VECTORS=1 npx vitest run tests/contractVectors.test.ts`, commit the
 * JSON, and port the change to ios/ and android/ until their suites pass.
 *
 * JSON conventions: dates are epoch milliseconds (fields ending in `Ms`); a
 * field that is `undefined` in TypeScript is absent; `null` means null.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// friendsService imports the live Firebase app; pairIdFor needs none of it.
vi.mock('../src/lib/firebase', () => ({ app: {}, firestore: {}, auth: {} }));

import { comboIdForCustom, comboIdForMix, fnv1a64, truncateLabel, MAX_LABEL_LENGTH } from '../src/services/comboId';
import {
  MAX_FAVORITES, describeFavoritesThatDidNotFit, favoritesThatFit, formatFavoriteCount, hasRoomForFavorite,
} from '../src/services/favoriteLimit';
import { POKE_COOLDOWN_MS, isPokeUnseen, pokeCooldownRemainingMs } from '../src/services/pokes';
import {
  NOW_SMOKING_MAX_ITEMS, NOW_SMOKING_TTL_MS, buildNowSmokingItems, isNowSmokingFresh, nowSmokingItemToFavorite,
} from '../src/services/nowSmoking';
import { ADDON_PRICES } from '../src/services/addons';
import { buildComboLabel, buildFlavorDisplayNames } from '../src/services/comboDisplay';
import { resolveReorder } from '../src/services/reorderService';
import {
  MAX_PROMO_TEXT_LENGTH, clampPromoText, hookahOfTheDayCartItem, resolveHookahOfTheDay,
} from '../src/services/hookahOfTheDay';
import { isValidTableId } from '../src/services/tableValidation';
import { pairIdFor } from '../src/services/friendsService';
import { convertCartItemToDbItem } from '../src/services/orderItem';

type Case = { name: string; input: unknown; expected: unknown };
type VectorFile = { description: string; functions: Record<string, Case[]> };

const VECTOR_DIR = path.resolve(__dirname, '../contract/vectors');
const UPDATE = process.env.UPDATE_VECTORS === '1';

/** JSON round trip: drops undefined, exactly what the other platforms will see. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

const build = <I>(cases: Array<{ name: string; input: I }>, run: (input: I) => unknown): Case[] =>
  cases.map(({ name, input }) => ({ name, input: plain(input), expected: plain(run(input)) }));

const date = (ms: number | null | undefined) => (ms == null ? undefined : new Date(ms));

// ----------------------------------------------------------------- fixtures
const T0 = 1_800_000_000_000;
const stamp = { createdAt: new Date(T0), updatedAt: new Date(T0) };

const hookahs = [
  { id: 'hk-virginia', name: 'Virginia', price: 70, image: 'v.webp', isActive: true },
  { id: 'hk-darkblend', name: 'Darkblend', price: 80, image: 'd.webp', isActive: true },
  { id: 'hk-retired', name: 'Retired', price: 60, image: 'r.webp', isActive: false },
  { id: 'hk-free', name: 'Free', price: 0, image: 'f.webp', isActive: true },
];
const flavors = [
  { id: 'fl-mint', name: 'Mint', image: '', compatibleTobaccoTypes: ['virginia', 'darkblend'], isActive: true },
  { id: 'fl-lemon', name: 'Lemon', image: '', compatibleTobaccoTypes: ['virginia'], isActive: true },
  { id: 'fl-cola', name: 'Cola', image: '', compatibleTobaccoTypes: ['darkblend'], isActive: true },
  { id: 'fl-gone', name: 'Peach', image: '', compatibleTobaccoTypes: ['virginia'], isActive: false },
];
const recommendedMixes = [
  { id: 'mx-turbo', name: 'Turbo Mix', price: 100, category: 'mix', mainImage: 't.webp', flavorImages: [], bgColor: '#000', isActive: true },
  { id: 'mx-off', name: 'Old Mix', price: 90, category: 'mix', mainImage: 'o.webp', flavorImages: [], bgColor: '#000', isActive: false },
];
const menu = { hookahs, flavors, recommendedMixes };
// The implementation wants Date stamps; the JSON menu carries none.
const liveMenu = {
  hookahs: hookahs.map((h) => ({ ...h, ...stamp })),
  flavors: flavors.map((f) => ({ ...f, ...stamp })),
  recommendedMixes: recommendedMixes.map((m) => ({ ...m, ...stamp })),
} as unknown as Parameters<typeof resolveReorder>[1];

const TABLE = '/table-7';
const long = (n: number) => 'x'.repeat(n);

// -------------------------------------------------------------------- files
const files: Record<string, VectorFile> = {
  constants: {
    description: 'Numbers every client must share. firestore.rules enforces several of them.',
    functions: {
      constants: [{
        name: 'all',
        input: null,
        expected: {
          MAX_LABEL_LENGTH, MAX_FAVORITES, POKE_COOLDOWN_MS, NOW_SMOKING_MAX_ITEMS, NOW_SMOKING_TTL_MS,
          MAX_PROMO_TEXT_LENGTH, ADDON_PRICES,
        },
      }],
    },
  },

  comboId: {
    description: 'Combo identity. fnv1a64 hashes UTF-16 code units (not UTF-8 bytes) and returns 16 lowercase hex digits. '
      + 'comboIdForCustom sorts flavorIds by UTF-16 code unit order before joining.',
    functions: {
      fnv1a64: build([
        { name: 'empty', input: '' },
        { name: 'ascii', input: 'hello' },
        { name: 'separator characters', input: 'a|b,c:d' },
        { name: 'romanian diacritics', input: 'Lămâie și mentă' },
        { name: 'emoji is two code units', input: 'Mint 🍃' },
        { name: 'long', input: long(500) },
      ], (s) => fnv1a64(s)),
      comboIdForMix: build([
        { name: 'plain id', input: 'mx-turbo' },
        { name: 'firestore auto id', input: 'Zk3PqLm0aBcD9eFgHiJk' },
      ], (id) => comboIdForMix(id)),
      comboIdForCustom: build([
        { name: 'one flavour', input: { hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia'] } },
        { name: 'two flavours', input: { hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-lemon:virginia', 'fl-mint:virginia'] } },
        { name: 'same two flavours, other order, same id', input: { hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia', 'fl-lemon:virginia'] } },
        { name: 'other tobacco is another combo', input: { hookahId: 'hk-virginia', tobaccoType: 'mix', flavorIds: ['fl-mint:virginia', 'fl-mint:darkblend'] } },
        { name: 'no flavours', input: { hookahId: 'hk-darkblend', tobaccoType: 'darkblend', flavorIds: [] } },
        { name: 'uppercase sorts before lowercase', input: { hookahId: 'H1', tobaccoType: 'virginia', flavorIds: ['b:virginia', 'B:virginia', 'a:virginia', 'Z:virginia', '9:virginia'] } },
      ], ({ hookahId, tobaccoType, flavorIds }) => comboIdForCustom(hookahId, tobaccoType, flavorIds)),
      truncateLabel: build([
        { name: 'short stays', input: 'Darkblend · Mint, Lemon' },
        { name: 'exactly 200 stays', input: long(200) },
        { name: '201 becomes 199 + ellipsis', input: long(201) },
        { name: 'very long', input: `${long(150)} · ${long(150)}` },
        { name: 'emoji well before the cut', input: `🍃${long(250)}` },
      ], (s) => truncateLabel(s)),
    },
  },

  favoriteLimit: {
    description: 'The cap of 20 favourites. favoritesThatFit: newest first, undated sorts as oldest (createdAtMs absent), stable for ties.',
    functions: {
      hasRoomForFavorite: build([0, 19, 20, 23].map((n) => ({ name: `count ${n}`, input: n })), (n) => hasRoomForFavorite(n)),
      formatFavoriteCount: build([0, 7, 20, 23].map((n) => ({ name: `count ${n}`, input: n })), (n) => formatFavoriteCount(n)),
      describeFavoritesThatDidNotFit: build([0, 1, 2, -1].map((n) => ({ name: `count ${n}`, input: n })), (n) => describeFavoritesThatDidNotFit(n)),
      favoritesThatFit: build([
        { name: 'all fit', input: { count: 0, candidates: [{ id: 'a', createdAtMs: T0 }, { id: 'b', createdAtMs: T0 + 1 }] } },
        { name: 'room for one: newest wins', input: { count: 19, candidates: [{ id: 'old', createdAtMs: T0 }, { id: 'new', createdAtMs: T0 + 5 }, { id: 'undated' }] } },
        { name: 'full account', input: { count: 20, candidates: [{ id: 'a', createdAtMs: T0 }] } },
        { name: 'over the limit already', input: { count: 23, candidates: [{ id: 'a', createdAtMs: T0 }] } },
        { name: 'none', input: { count: 5, candidates: [] } },
      ], ({ count, candidates }) => {
        const { fit, left } = favoritesThatFit(
          candidates.map((c: { id: string; createdAtMs?: number }) => ({ id: c.id, createdAt: date(c.createdAtMs) })),
          count,
        );
        return { fit: fit.map((c) => c.id), left: left.map((c) => c.id) };
      }),
    },
  },

  pokes: {
    description: 'Poke cooldown (10 minutes, also enforced by firestore.rules) and the unseen test.',
    functions: {
      pokeCooldownRemainingMs: build([
        { name: 'never poked', input: { lastAtMs: null, nowMs: T0 } },
        { name: 'just poked', input: { lastAtMs: T0, nowMs: T0 } },
        { name: 'four minutes in', input: { lastAtMs: T0, nowMs: T0 + 4 * 60_000 } },
        { name: 'exactly ten minutes', input: { lastAtMs: T0, nowMs: T0 + 10 * 60_000 } },
        { name: 'long ago', input: { lastAtMs: T0, nowMs: T0 + 60 * 60_000 } },
        { name: 'device clock behind server', input: { lastAtMs: T0 + 5_000, nowMs: T0 } },
      ], ({ lastAtMs, nowMs }) => pokeCooldownRemainingMs(date(lastAtMs), new Date(nowMs))),
      isPokeUnseen: build([
        { name: 'never seen', input: { atMs: T0 } },
        { name: 'seen after', input: { atMs: T0, seenAtMs: T0 + 1 } },
        { name: 'seen at the same instant', input: { atMs: T0, seenAtMs: T0 } },
        { name: 'poked again since seen', input: { atMs: T0 + 10, seenAtMs: T0 } },
      ], ({ atMs, seenAtMs }: { atMs: number; seenAtMs?: number }) => isPokeUnseen({ at: new Date(atMs), seenAt: date(seenAtMs) })),
    },
  },

  nowSmoking: {
    description: 'What an order shares with friends. At most 5 items, deduplicated by comboId, flavorIds capped at 10, never any personalisation.',
    functions: {
      buildNowSmokingItems: build([
        { name: 'a mix', input: [{ type: 'mix', comboId: 'mix:mx-turbo', comboLabel: 'Turbo Mix', name: 'Turbo Mix (Virginia)', tobaccoType: 'virginia' }] },
        { name: 'a custom build shares its recipe', input: [{ type: 'custom', comboId: 'custom:abc', comboLabel: 'Virginia · Mint, Lemon', name: 'Custom Mix', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia', 'fl-lemon:virginia'] }] },
        { name: 'label falls back to name', input: [{ type: 'mix', comboId: 'mix:x', name: 'Only Name' }] },
        { name: 'no comboId is skipped; duplicates collapse', input: [{ type: 'mix', name: 'Legacy' }, { type: 'mix', comboId: 'mix:a', name: 'A' }, { type: 'mix', comboId: 'mix:a', name: 'A again' }] },
        { name: 'custom without flavours shares no recipe', input: [{ type: 'custom', comboId: 'custom:nof', name: 'Custom Mix', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: [] }] },
        { name: 'hookah of the day (type mix) shares no recipe', input: [{ type: 'mix', comboId: 'hotd:0123456789abcdef', comboLabel: 'Hookah of the day: Virginia', name: 'Hookah of the day: Virginia', hookahId: 'hk-virginia', tobaccoType: 'virginia' }] },
        { name: 'six items keeps five', input: [1, 2, 3, 4, 5, 6].map((n) => ({ type: 'mix', comboId: `mix:${n}`, name: `M${n}` })) },
        { name: 'twelve flavours keeps ten', input: [{ type: 'custom', comboId: 'custom:many', name: 'Custom Mix', hookahId: 'h', tobaccoType: 'virginia', flavorIds: Array.from({ length: 12 }, (_, i) => `f${i}:virginia`) }] },
        { name: 'long label is truncated', input: [{ type: 'mix', comboId: 'mix:long', name: long(300) }] },
      ], (items) => buildNowSmokingItems(items as Parameters<typeof buildNowSmokingItems>[0])),
      isNowSmokingFresh: build([
        { name: 'missing', input: { sinceMs: null, nowMs: T0 } },
        { name: 'just now', input: { sinceMs: T0, nowMs: T0 } },
        { name: 'one millisecond before expiry', input: { sinceMs: T0, nowMs: T0 + NOW_SMOKING_TTL_MS - 1 } },
        { name: 'exactly two hours is stale', input: { sinceMs: T0, nowMs: T0 + NOW_SMOKING_TTL_MS } },
        { name: 'server time ahead of device', input: { sinceMs: T0 + 30_000, nowMs: T0 } },
      ], ({ sinceMs, nowMs }) => isNowSmokingFresh(date(sinceMs), new Date(nowMs))),
      nowSmokingItemToFavorite: build([
        { name: 'mix', input: { comboId: 'mix:mx-turbo', label: 'Turbo Mix' } },
        { name: 'custom with recipe', input: { comboId: 'custom:abc', label: 'Virginia · Mint', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia'] } },
        { name: 'custom without recipe', input: { comboId: 'custom:abc', label: 'Virginia · Mint' } },
        { name: 'hookah of the day cannot be re-ordered', input: { comboId: 'hotd:0123456789abcdef', label: 'Hookah of the day: Virginia' } },
      ], (item) => nowSmokingItemToFavorite(item)),
    },
  },

  comboDisplay: {
    description: 'Flavour display names and the combo label. Percentages show with 2+ flavours or with ice; the variant tag shows only when tobaccoType is "mix".',
    functions: {
      buildFlavorDisplayNames: build([
        { name: 'single flavour, no ice: bare name', input: { flavors: [{ name: 'Mint', variantType: 'virginia', percentage: 100 }], tobaccoType: 'virginia', withIce: false } },
        { name: 'two flavours show percentages', input: { flavors: [{ name: 'Mint', variantType: 'virginia', percentage: 60 }, { name: 'Lemon', variantType: 'virginia', percentage: 40 }], tobaccoType: 'virginia', withIce: false } },
        { name: 'mix tobacco shows variant tags', input: { flavors: [{ name: 'Mint', variantType: 'virginia', percentage: 50 }, { name: 'Cola', variantType: 'darkblend', percentage: 50 }], tobaccoType: 'mix', withIce: false } },
        { name: 'single flavour with ice', input: { flavors: [{ name: 'Mint', variantType: 'virginia', percentage: 80 }], tobaccoType: 'virginia', withIce: true, icePercentage: 20 } },
        { name: 'ice with unknown share', input: { flavors: [{ name: 'Mint', variantType: 'virginia' }], tobaccoType: 'virginia', withIce: true } },
        { name: 'unknown percentages are left off', input: { flavors: [{ name: 'Mint' }, { name: 'Lemon', percentage: 40 }], tobaccoType: 'virginia', withIce: false } },
        { name: 'no flavours', input: { flavors: [], tobaccoType: 'virginia', withIce: false } },
      ], ({ flavors: f, tobaccoType, withIce, icePercentage }: { flavors: Parameters<typeof buildFlavorDisplayNames>[0]; tobaccoType: string; withIce: boolean; icePercentage?: number }) =>
        buildFlavorDisplayNames(f, tobaccoType, withIce, icePercentage)),
      buildComboLabel: build([
        { name: 'two flavours', input: { hookahName: 'Darkblend', flavorNames: ['Mint 60%', 'Lemon 40%'] } },
        { name: 'no flavours', input: { hookahName: 'Virginia', flavorNames: [] } },
      ], ({ hookahName, flavorNames }) => buildComboLabel(hookahName, flavorNames)),
    },
  },

  reorder: {
    description: 'Turning a favourite back into a cart item against the current menu (input.menu applies to every case). '
      + 'Prices always come from the menu. A custom item id is "custom-<epoch millis>"; vectors carry "custom-<now>" and clients compare everything else.',
    functions: {
      resolveReorder: build([
        { name: 'mix never ordered defaults to category mix', favorite: { comboId: 'mix:mx-turbo', label: 'Turbo Mix', kind: 'mix', mixId: 'mx-turbo' } },
        { name: 'mix with last-ordered category', favorite: { comboId: 'mix:mx-turbo', label: 'Turbo Mix', kind: 'mix', mixId: 'mx-turbo', tobaccoType: 'darkblend' } },
        { name: 'mix with unknown category falls back to mix', favorite: { comboId: 'mix:mx-turbo', label: 'Turbo Mix', kind: 'mix', mixId: 'mx-turbo', tobaccoType: 'cigarleaf' } },
        { name: 'inactive mix', favorite: { comboId: 'mix:mx-off', label: 'Old Mix', kind: 'mix', mixId: 'mx-off' } },
        { name: 'deleted mix', favorite: { comboId: 'mix:nope', label: 'Vanished', kind: 'mix', mixId: 'nope' } },
        { name: 'custom, one flavour', favorite: { comboId: 'custom:x', label: 'Virginia · Mint', kind: 'custom', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia'], tobaccoStrength: 3 } },
        { name: 'custom, two flavours with current percentage keys', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia', 'fl-lemon:virginia'], flavorPercentages: { 'fl-mint:virginia': 60, 'fl-lemon:virginia': 40 } } },
        { name: 'custom, legacy percentage keys', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia', 'fl-lemon:virginia'], flavorPercentages: { 'fl-mint-virginia': 70, 'fl-lemon': 30 } } },
        { name: 'custom with ice: share derived from the rest', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia', 'fl-lemon:virginia'], flavorPercentages: { 'fl-mint:virginia': 50, 'fl-lemon:virginia': 30 }, withIce: true } },
        { name: 'custom with ice, share unknown', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia'], withIce: true } },
        { name: 'custom on mix tobacco shows variants', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-darkblend', tobaccoType: 'mix', flavorIds: ['fl-mint:virginia', 'fl-cola:darkblend'], flavorPercentages: { 'fl-mint:virginia': 50, 'fl-cola:darkblend': 50 } } },
        { name: 'custom with every add-on', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-darkblend', tobaccoType: 'darkblend', flavorIds: ['fl-cola:darkblend'], hasLED: true, hasColoredWater: true, hasAlcohol: true, hasFruits: true } },
        { name: 'custom on a free hookah with one add-on', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-free', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia'], hasLED: true } },
        { name: 'inactive hookah and inactive flavour are both named', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-retired', tobaccoType: 'virginia', flavorIds: ['fl-gone:virginia', 'fl-mint:virginia'] } },
        { name: 'deleted flavour is named by id', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-deleted:virginia'] } },
        { name: 'flavour no longer compatible with the variant', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-lemon:darkblend'] } },
        { name: 'flavour id without a variant', favorite: { comboId: 'custom:x', label: 'l', kind: 'custom', hookahId: 'hk-virginia', tobaccoType: 'virginia', flavorIds: ['fl-mint'] } },
        { name: 'custom missing its hookah id', favorite: { comboId: 'custom:x', label: 'Broken build', kind: 'custom', tobaccoType: 'virginia', flavorIds: ['fl-mint:virginia'] } },
      ].map(({ name, favorite }) => ({ name, input: { favorite, table: TABLE } })), ({ favorite, table }) => {
        const resolution = resolveReorder(favorite as Parameters<typeof resolveReorder>[0], liveMenu, table);
        if (resolution.status === 'ok' && resolution.item.type === 'custom') {
          return { ...resolution, item: { ...resolution.item, id: 'custom-<now>' } };
        }
        return resolution;
      }),
    },
  },

  hookahOfTheDay: {
    description: 'The promoted hookah. input.hookahs for resolve cases is the reorder menu\'s hookah list. The cart item is type "mix" with a "hotd:" combo id covering hookah id and promo text.',
    functions: {
      clampPromoText: build([
        { name: 'absent', input: null },
        { name: 'blank', input: '   ' },
        { name: 'trimmed', input: '  Red Tea | Blackberry  ' },
        { name: 'exactly 140', input: long(140) },
        { name: '141 is cut to 140', input: long(141) },
      ], (s) => clampPromoText(s ?? undefined)),
      resolveHookahOfTheDay: build([
        { name: 'no pointer', input: { featured: null } },
        { name: 'active hookah with promo', input: { featured: { hookahId: 'hk-virginia', promoText: ' Red Tea | Blackberry ' } } },
        { name: 'active hookah, blank promo', input: { featured: { hookahId: 'hk-darkblend', promoText: '  ' } } },
        { name: 'inactive hookah', input: { featured: { hookahId: 'hk-retired' } } },
        { name: 'dangling pointer', input: { featured: { hookahId: 'nope' } } },
      ], ({ featured }) => {
        const resolved = resolveHookahOfTheDay(liveMenu.hookahs, featured ?? undefined);
        return resolved && { hookahId: resolved.hookah.id, promoText: resolved.promoText };
      }),
      hookahOfTheDayCartItem: build([
        { name: 'with promo and tobacco', input: { hookahId: 'hk-virginia', promoText: 'Red Tea | Blackberry', tobaccoType: 'virginia', table: TABLE } },
        { name: 'no promo, no tobacco', input: { hookahId: 'hk-darkblend', tobaccoType: null, table: '/bar' } },
        { name: 'same hookah, new promo, new combo id', input: { hookahId: 'hk-virginia', promoText: 'Lămâie | Mentă 🍃', tobaccoType: 'mix', table: TABLE } },
        { name: 'promo long enough to truncate the label', input: { hookahId: 'hk-virginia', promoText: long(190), tobaccoType: null, table: TABLE } },
      ], ({ hookahId, promoText, tobaccoType, table }: { hookahId: string; promoText?: string; tobaccoType: string | null; table: string }) => hookahOfTheDayCartItem(
        { hookah: liveMenu.hookahs.find((h) => h.id === hookahId)!, promoText },
        tobaccoType as Parameters<typeof hookahOfTheDayCartItem>[1],
        table,
      )),
    },
  },

  misc: {
    description: 'Small shared rules: table ids from the QR code, friendship document ids, and the order-item shape (never the image, never the table).',
    functions: {
      isValidTableId: build([
        { name: 'null', input: null }, { name: 'empty', input: '' }, { name: 'table path', input: '/table-7' },
        { name: 'bare table', input: 'table-12' }, { name: 'bar', input: '/bar' }, { name: 'garbage', input: '/menu' },
        { name: 'table without a dash', input: 'table7' },
      ], (s) => isValidTableId(s)),
      pairIdFor: build([
        { name: 'already ordered', input: { a: 'alice', b: 'bob' } },
        { name: 'reversed gives the same id', input: { a: 'bob', b: 'alice' } },
        { name: 'uppercase sorts before lowercase', input: { a: 'aUid', b: 'Zuid' } },
        { name: 'firebase uids', input: { a: 'x9Kq2LmN8pQrStUvWxYz01234567', b: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4' } },
      ], ({ a, b }) => pairIdFor(a, b)),
      convertCartItemToDbItem: build([
        { name: 'custom build', input: { id: 'custom-1', type: 'custom', name: 'Custom Mix', price: 110, quantity: 2, image: 'data:image/webp;base64,AAAA', comboId: 'custom:abc', comboLabel: 'Virginia · Mint', hookahId: 'hk-virginia', flavorIds: ['fl-mint:virginia'], table: TABLE, tobaccoType: 'virginia', tobaccoStrength: 3, hookah: 'Virginia', flavors: ['Mint'], hasLED: true } },
        { name: 'mix', input: { id: 'mix-mx-turbo-mix', type: 'mix', name: 'Turbo Mix (Mix)', price: 100, quantity: 1, image: 't.webp', comboId: 'mix:mx-turbo', comboLabel: 'Turbo Mix', mixId: 'mx-turbo', table: TABLE, tobaccoType: 'mix' } },
      ], (item) => convertCartItemToDbItem(item as Parameters<typeof convertCartItemToDbItem>[0])),
    },
  },
};

// The menu every reorder and hookah-of-the-day case resolves against.
const fixtures = { description: 'Shared menu fixture for reorder.json and hookahOfTheDay.json.', menu };

const serialise = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe('cross-platform contract vectors', () => {
  const all: Record<string, unknown> = { ...files, fixtures };

  for (const [name, content] of Object.entries(all)) {
    it(`${name}.json matches the TypeScript implementation`, () => {
      const file = path.join(VECTOR_DIR, `${name}.json`);
      if (UPDATE) {
        fs.mkdirSync(VECTOR_DIR, { recursive: true });
        fs.writeFileSync(file, serialise(content));
      }
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(plain(content));
    });
  }

  it('has no vector file without a generator', () => {
    const onDisk = fs.readdirSync(VECTOR_DIR).filter((f) => f.endsWith('.json')).sort();
    expect(onDisk).toEqual(Object.keys(all).map((n) => `${n}.json`).sort());
  });
});
