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
