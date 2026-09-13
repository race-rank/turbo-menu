/**
 * Stable identity for a combo, so a build can be favourited and rated.
 *
 * FNV-1a rather than SHA-256 on purpose. crypto.subtle only exists in a secure
 * context, and this project has already shipped a blank page from assuming a
 * crypto API was present - crypto.randomUUID() was undefined over plain http
 * on a LAN IP and took the whole React tree down with it. A combo id is an
 * identity key, not a security boundary: a collision merges two combos'
 * ratings, it grants access to nothing. So a plain deterministic hash is the
 * right tool, and it works everywhere.
 */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export const fnv1a64 = (input: string): string => {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
};

/**
 * Curated mixes already have a stable document id. The tobacco category picked
 * at order time is a variant of one combo, not three separate combos, so it is
 * deliberately not part of the id.
 */
export const comboIdForMix = (mixId: string): string => `mix:${mixId}`;

/**
 * `flavorIds` entries are `{flavorDocId}:{variantType}`.
 *
 * NOT the `variantId` the menu UI uses internally: that is the bare document id
 * for a single-compatibility flavour but `{id}-{type}` for a multi-compatibility
 * one, so it changes shape if an admin edits a flavour's compatible types -
 * which would orphan every favourite and rating referencing it.
 *
 * Strength, flavour percentages, ice and addons are excluded. They are
 * personalisation, not identity. Fold them in and 60/40 Mint-Lemon stops
 * matching 61/39 Mint-Lemon, and nothing ever accumulates.
 */
export const comboIdForCustom = (
  hookahId: string,
  tobaccoType: string,
  flavorIds: string[],
): string => {
  const canonical = [
    hookahId,
    tobaccoType,
    [...flavorIds].sort().join(','),
  ].join('|');
  return `custom:${fnv1a64(canonical)}`;
};

/**
 * Security rules cap a stored label at 200 characters, so anything longer is
 * rejected outright with a bare permission-denied. Labels are built from
 * admin-entered hookah and flavour names, which have no length limit of their
 * own, so a legitimate three-flavour custom build can exceed it. Truncating
 * here keeps a long name a cosmetic problem rather than a failed save.
 */
export const MAX_LABEL_LENGTH = 200;

export const truncateLabel = (label: string): string =>
  (label.length <= MAX_LABEL_LENGTH ? label : `${label.slice(0, MAX_LABEL_LENGTH - 1)}…`);
