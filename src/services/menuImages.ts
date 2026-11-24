/**
 * Menu pictures live in Firebase Storage; menu documents hold their URLs.
 *
 * They used to be stored inline, as base64 data URIs of up to ~1MB each. With
 * 126 flavours the menu weighed about 35MB, every guest downloaded all of it,
 * and the one-document snapshot (menu/current) could never be published
 * because a Firestore document is capped at 1MiB.
 *
 * This is the pure half - no Firebase import - so it unit tests directly.
 * scripts/move-menu-images-to-storage.mjs mirrors these functions, and
 * tests/menuImages.test.ts holds the two to the same output.
 */

/** Longest side, in pixels. Enough for a full-width card on a 3x phone. */
export const MENU_IMAGE_MAX_DIMENSION = 900;

/** Safe because a file is never overwritten: a new picture is a new name. */
export const MENU_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const isInlineImage = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:image/');

export const menuImagePath = (collection: string, name: string, extension: string): string =>
  `menu/${collection}/${name}.${extension}`;

/**
 * Token-free URL. storage.rules makes menu/** world-readable, so no download
 * token is needed, and the URL is a pure function of bucket and path.
 */
export const menuImageUrl = (bucket: string, path: string): string =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;

export const extensionForContentType = (contentType: string): string => {
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  return 'img';
};

/** Scales down to fit, never up, keeping the aspect ratio. */
export const fitWithin = (
  width: number,
  height: number,
  max: number = MENU_IMAGE_MAX_DIMENSION,
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/**
 * Returns a copy of a menu document with every inline picture replaced by the
 * URL `upload` returns for it. Covers top-level strings (image, mainImage) and
 * top-level lists of strings (flavorImages) - the only places the menu keeps
 * pictures. Anything else, including a value that is already a URL, is left
 * exactly as it was. Uploads run one at a time so a failure stops the rest.
 */
export const replaceInlineImages = async <T extends Record<string, unknown>>(
  data: T,
  upload: (dataUrl: string) => Promise<string>,
): Promise<T> => {
  const out: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (isInlineImage(value)) {
      out[key] = await upload(value);
    } else if (Array.isArray(value) && value.some(isInlineImage)) {
      const replaced: unknown[] = [];
      for (const entry of value) {
        replaced.push(isInlineImage(entry) ? await upload(entry) : entry);
      }
      out[key] = replaced;
    }
  }
  return out as T;
};
