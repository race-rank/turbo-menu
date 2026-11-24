import { describe, expect, it } from 'vitest';
import {
  MENU_IMAGE_CACHE_CONTROL, MENU_IMAGE_MAX_DIMENSION, extensionForContentType, fitWithin, isInlineImage,
  menuImagePath, menuImageUrl, replaceInlineImages,
} from '../src/services/menuImages';
// @ts-expect-error - a plain .mjs script with no type declarations.
import * as script from '../scripts/move-menu-images-to-storage.mjs';

const INLINE = 'data:image/png;base64,AAAA';
const URL_ALREADY = 'https://firebasestorage.googleapis.com/v0/b/b/o/menu%2Fflavors%2Fx.webp?alt=media';

describe('menu images: pure rules', () => {
  it('recognises only inline pictures', () => {
    expect(isInlineImage(INLINE)).toBe(true);
    expect(isInlineImage(URL_ALREADY)).toBe(false);
    expect(isInlineImage('/img/led.webp')).toBe(false);
    expect(isInlineImage('')).toBe(false);
    expect(isInlineImage(undefined)).toBe(false);
    expect(isInlineImage('data:text/html;base64,AAAA')).toBe(false);
  });

  it('builds a token-free URL with the path encoded as one segment', () => {
    expect(menuImageUrl('turbo-menu-30079.firebasestorage.app', menuImagePath('flavors', 'abc', 'webp')))
      .toBe('https://firebasestorage.googleapis.com/v0/b/turbo-menu-30079.firebasestorage.app/o/menu%2Fflavors%2Fabc.webp?alt=media');
  });

  it('names the extension after what the browser actually encoded', () => {
    expect(extensionForContentType('image/webp')).toBe('webp');
    expect(extensionForContentType('image/png')).toBe('png');
    expect(extensionForContentType('image/jpeg')).toBe('jpg');
    expect(extensionForContentType('')).toBe('img');
  });

  it('scales down to fit and never up', () => {
    expect(fitWithin(1800, 900)).toEqual({ width: 900, height: 450 });
    expect(fitWithin(600, 2400)).toEqual({ width: 225, height: 900 });
    expect(fitWithin(900, 900)).toEqual({ width: 900, height: 900 });
    expect(fitWithin(200, 100)).toEqual({ width: 200, height: 100 });
    expect(fitWithin(10000, 1)).toEqual({ width: 900, height: 1 });
  });

  it('replaces inline pictures in strings and lists, and nothing else', async () => {
    const uploaded: string[] = [];
    const upload = async (dataUrl: string) => { uploaded.push(dataUrl); return `url-${uploaded.length}`; };
    const data = {
      name: 'Mint', price: 10, isActive: true,
      image: INLINE,
      mainImage: URL_ALREADY,
      flavorImages: [INLINE, URL_ALREADY, 'data:image/webp;base64,BBBB'],
      compatibleTobaccoTypes: ['virginia'],
      strengthRange: { min: 1, max: 5 },
    };
    const out = await replaceInlineImages(data, upload);
    expect(out).toEqual({
      ...data, image: 'url-1', flavorImages: ['url-2', URL_ALREADY, 'url-3'],
    });
    expect(uploaded).toHaveLength(3);
    // The caller's object is a form's state; it must not be mutated.
    expect(data.image).toBe(INLINE);
  });

  it('uploads nothing for a document that already holds URLs', async () => {
    const upload = async () => { throw new Error('must not upload'); };
    const data = { image: URL_ALREADY, flavorImages: [URL_ALREADY] };
    expect(await replaceInlineImages(data, upload)).toEqual(data);
  });

  it('stops at the first failed upload instead of saving a half-moved document', async () => {
    const upload = async () => { throw new Error('offline'); };
    await expect(replaceInlineImages({ image: INLINE }, upload)).rejects.toThrow('offline');
  });
});

describe('menu images: the migration script mirrors the app', () => {
  it('agrees on the constants, the path and the URL', () => {
    expect(script.MAX_DIMENSION).toBe(MENU_IMAGE_MAX_DIMENSION);
    expect(script.CACHE_CONTROL).toBe(MENU_IMAGE_CACHE_CONTROL);
    expect(script.menuImagePath('hookahs', 'n', 'webp')).toBe(menuImagePath('hookahs', 'n', 'webp'));
    expect(script.menuImageUrl('bucket', 'menu/hookahs/n.webp')).toBe(menuImageUrl('bucket', 'menu/hookahs/n.webp'));
    for (const value of [INLINE, URL_ALREADY, '', undefined, 7]) {
      expect(script.isInlineImage(value)).toBe(isInlineImage(value));
    }
  });

  it('refuses a data URL that is not base64', () => {
    expect(() => script.decodeDataUrl('data:image/svg+xml,<svg/>')).toThrow(/Not a base64/);
  });
});
