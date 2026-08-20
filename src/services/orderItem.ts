import { CartItem } from '@/contexts/CartContext';
import { DatabaseOrderItem } from '@/types/database';

/**
 * Maps a cart item to the shape persisted on an order.
 *
 * Deliberately free of Firebase imports so it can be unit tested directly, and
 * deliberately NOT a spread of `item`: the cart carries an `image` that must
 * never reach Firestore. Menu images are base64 data URIs of roughly 900KB, so
 * copying one per item took order documents to 91% of the 1MiB document limit
 * and made the admin dashboard stream hundreds of megabytes per load. The
 * declared return type makes re-adding `image` a compile error.
 */
export const convertCartItemToDbItem = (item: CartItem): DatabaseOrderItem => ({
  id: item.id,
  type: item.type,
  name: item.name,
  price: item.price,
  quantity: item.quantity,
  hookah: item.hookah,
  tobaccoType: item.tobaccoType,
  tobaccoStrength: item.tobaccoStrength,
  flavors: item.flavors,
  flavorPercentages: item.flavorPercentages,
  hasLED: item.hasLED,
  hasColoredWater: item.hasColoredWater,
  hasAlcohol: item.hasAlcohol,
  hasFruits: item.hasFruits,
});
