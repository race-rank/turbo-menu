import { expect, test } from 'vitest';
import { convertCartItemToDbItem } from '../src/services/orderItem';
import type { CartItem } from '../src/contexts/CartContext';

const cartItem: CartItem = {
  id: 'item-1',
  type: 'custom',
  name: 'Khalil Mamoon',
  price: 60,
  quantity: 2,
  // Stand-in for the real thing: menu images are base64 data URIs of ~900KB.
  image: 'data:image/webp;base64,AAAAAAAAAAAAAAAA',
  comboId: 'custom:0000000000000000',
  table: '7',
  hookah: 'Khalil Mamoon',
  tobaccoType: 'virginia',
  tobaccoStrength: 6,
  flavors: ['Mint', 'Lemon'],
  flavorPercentages: { Mint: 60, Lemon: 40 },
  hasLED: true,
};

test('the persisted order item carries no image', () => {
  const dbItem = convertCartItemToDbItem(cartItem);

  // Not toBeUndefined: an `image: undefined` key would still be a regression,
  // since a later spread or a change to cleanObject could revive it.
  expect(Object.keys(dbItem)).not.toContain('image');
  expect(JSON.stringify(dbItem)).not.toContain('base64');
});

test('the persisted order item keeps what staff need to make the order', () => {
  const dbItem = convertCartItemToDbItem(cartItem);

  expect(dbItem).toMatchObject({
    id: 'item-1',
    type: 'custom',
    name: 'Khalil Mamoon',
    price: 60,
    quantity: 2,
    hookah: 'Khalil Mamoon',
    tobaccoType: 'virginia',
    tobaccoStrength: 6,
    flavors: ['Mint', 'Lemon'],
    hasLED: true,
  });
});

test('a persisted order item stays far below the 1MiB document limit', () => {
  const dbItem = convertCartItemToDbItem(cartItem);

  // The bug this guards: at ~940KB per item, a two-item order exceeded the
  // limit outright and Firestore rejected the write at checkout.
  expect(JSON.stringify(dbItem).length).toBeLessThan(2048);
});

test('the persisted order item carries combo identity', () => {
  const dbItem = convertCartItemToDbItem({
    ...cartItem,
    comboId: 'custom:0123456789abcdef',
    hookahId: 'hookah-1',
    flavorIds: ['mint:virginia', 'lemon:virginia'],
  });

  expect(dbItem.comboId).toBe('custom:0123456789abcdef');
  expect(dbItem.hookahId).toBe('hookah-1');
  expect(dbItem.flavorIds).toEqual(['mint:virginia', 'lemon:virginia']);
});

test('a curated mix item carries its mix id', () => {
  const dbItem = convertCartItemToDbItem({
    ...cartItem,
    type: 'mix',
    comboId: 'mix:abc123',
    mixId: 'abc123',
  });

  expect(dbItem.comboId).toBe('mix:abc123');
  expect(dbItem.mixId).toBe('abc123');
});

// Regression guard from the previous perf work: images are ~900KB base64 and
// must never reach Firestore again.
test('combo identity did not smuggle the image back in', () => {
  const dbItem = convertCartItemToDbItem({ ...cartItem, comboId: 'mix:abc123' });
  expect(Object.keys(dbItem)).not.toContain('image');
});
