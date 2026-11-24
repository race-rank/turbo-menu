# Cross-platform contract

The web app, the iOS app and the Android app share one Firestore database.
This folder is what keeps them in agreement.

| Path | What it is |
|---|---|
| `vectors/*.json` | Inputs and expected outputs for every pure rule the clients must implement identically |
| `design-tokens.json` | Colours, radii, spacing and type sizes |
| `../docs/contract/data-model.md` | Every collection: fields, who may read and write, required transactions |

## Vector files

```json
{
  "description": "What this file covers and any rule that applies to all cases",
  "functions": {
    "functionName": [
      { "name": "case name", "input": <any JSON>, "expected": <any JSON> }
    ]
  }
}
```

- The reference implementation is TypeScript, in `src/services/`. Function
  names in the vectors are the TypeScript names.
- `input` is either the single argument or an object of named arguments.
- Dates are epoch milliseconds in fields ending in `Ms`.
- A field that is absent means "not set". Clients must not write `null` where
  the reference leaves a field out; Firestore rules reject unknown or null
  fields in several collections.
- `fixtures.json` holds the menu that `reorder.json` and
  `hookahOfTheDay.json` resolve against.

## Rules that are easy to get wrong natively

- **Strings are UTF-16.** `fnv1a64` hashes UTF-16 code units, not UTF-8
  bytes. Lengths (label 200, promo 140) count UTF-16 code units. In Swift use
  `string.utf16`; in Kotlin a `String` already is UTF-16.
- **Sorting is by UTF-16 code unit**, so uppercase sorts before lowercase
  (`comboIdForCustom`, `pairIdFor`). Kotlin's `String.compareTo` matches. In
  Swift compare `Array(string.utf16)` lexicographically; do not use
  `localizedCompare`.
- **64-bit arithmetic wraps.** FNV-1a multiplies modulo 2^64: `&*` on `UInt64`
  in Swift, plain `*` on `ULong` in Kotlin.
- **Truncation that would split a surrogate pair is unspecified.** The web cuts
  at code unit 199 regardless. Native clients may cut one unit earlier to keep
  the string valid; the result must never exceed 200 units.

## Changing behaviour

1. Change the TypeScript and, if needed, the cases in
   `tests/contractVectors.test.ts`.
2. `UPDATE_VECTORS=1 npx vitest run tests/contractVectors.test.ts`
3. Commit the changed JSON, then port the change to `ios/` and `android/`
   until their vector tests pass.

A plain `npm test` fails if the TypeScript and the committed vectors disagree.
