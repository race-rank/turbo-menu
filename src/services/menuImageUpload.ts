import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { app } from '@/lib/firebase';
import {
  MENU_IMAGE_CACHE_CONTROL, extensionForContentType, fitWithin, menuImagePath, menuImageUrl,
  replaceInlineImages,
} from '@/services/menuImages';

/**
 * The browser half of menuImages.ts: resize a picture the admin picked and
 * put it in Storage. Admin-only in practice - storage.rules refuses anyone
 * without the admin claim.
 */

const loadImage = (dataUrl: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Could not read the picture'));
  image.src = dataUrl;
});

/**
 * WebP where the browser can encode it. Safari cannot, and hands back a PNG
 * for the same request; that is kept as is (still resized) rather than forced
 * to JPEG, because flavour pictures rely on transparency.
 */
const resizeToBlob = async (dataUrl: string): Promise<Blob> => {
  const image = await loadImage(dataUrl);
  const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not process the picture');
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the picture'))),
      'image/webp',
      0.8,
    );
  });
};

// Not crypto.randomUUID: it is undefined outside a secure context and has
// already taken this app down once (see comboId.ts).
const randomName = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const uploadMenuImage = async (collection: string, dataUrl: string): Promise<string> => {
  const blob = await resizeToBlob(dataUrl);
  const path = menuImagePath(collection, randomName(), extensionForContentType(blob.type));
  const storage = getStorage(app);
  await uploadBytes(ref(storage, path), blob, {
    contentType: blob.type,
    cacheControl: MENU_IMAGE_CACHE_CONTROL,
  });
  return menuImageUrl(storage.app.options.storageBucket ?? '', path);
};

/**
 * Every menu write goes through this, so an inline picture can never reach
 * Firestore again whatever a form hands over. Throws if an upload fails, so
 * the document is not saved pointing at nothing.
 */
export const externaliseMenuImages = <T extends Record<string, unknown>>(
  collection: string,
  data: T,
): Promise<T> => replaceInlineImages(data, (dataUrl) => uploadMenuImage(collection, dataUrl));
