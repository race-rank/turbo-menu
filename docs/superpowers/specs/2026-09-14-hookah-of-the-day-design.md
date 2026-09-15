# Hookah of the Day — Design

**Date:** 2026-09-14
**Status:** Approved

## Goal

Let an admin promote one hookah at a time on the customer menu. Promotion only — no
special price, no discount, no automatic rotation.

## Why it is small

A recommended mix is its own entity: own type, own collection, full CRUD, own admin
section, own carousel. A hookah of the day is not a new entity. Hookahs already exist
as first-class records with `isActive`, an admin form and a grid on the menu. This
feature *marks* one of them.

The cost is therefore a pointer, a resolver, and two pieces of UI.

## Scope

**In:** an admin control to pick and clear the featured hookah, an optional promo line,
a hero card on the menu, a badge in the hookah grid.

**Out:** pricing of any kind, scheduling, automatic rotation, expiry, per-day history,
customer-facing anything beyond display. No changes to ordering, favourites, ratings or
friends.

---

## 1. Data

One document, `menu/featured`:

```ts
interface FeaturedHookah {
  hookahId: string;
  promoText?: string;
}
```

Clearing the promotion deletes the document.

### Why a pointer document rather than a flag on each hookah

The requirement is "exactly one, enforced". A boolean `isHookahOfTheDay` on the hookah
record cannot enforce that: setting a new one means clearing the old one, two writes
that can half-fail and leave two hookahs featured, or none. With a pointer, two featured
hookahs are unrepresentable rather than merely discouraged, and picking a new one *is*
the unset of the previous one — a single write, atomic by construction.

### Why `menu/featured` specifically

`firestore.rules` already has:

```
match /menu/{document} { allow read: if true; allow write: if isAdmin(); }
```

A document under `menu/` is therefore public-read and admin-write with **no rules change
and no rules deploy**. That matters: every other feature shipped this week needed a
deploy, and this one does not.

### `promoText` is bounded

Capped at 140 characters, enforced in the admin form and in the type's documentation.
It rides inside the public menu snapshot that every customer downloads on every visit.
This project has already had order documents bloat to 91% of the 1MiB limit by carrying
base64 images; an unbounded free-text field on the hottest read path in the app is the
same mistake in a smaller coat.

### No `featuredSince`

Deliberately omitted. A promotion that is performing well should be able to run
indefinitely, and a timestamp implies a decay that does not exist here. There is no
expiry, no staleness warning, and no scheduled job.

---

## 2. Propagation

`getMenuData()` reads a single published snapshot document, `menu/current`, and falls
back to per-collection queries only when the snapshot is missing or denied.
`publishMenuSnapshot()` rebuilds that snapshot and already runs after every menu
mutation in the admin screen.

`publishMenuSnapshot()` will read `menu/featured` and embed it in the snapshot as
`hookahOfTheDay`. `fetchMenuCollections()` — the fallback path — reads it too, so both
routes return the same shape.

The `MenuData` interface in `src/services/menuService.ts` therefore gains one optional
field, `hookahOfTheDay?: FeaturedHookah`. Optional because a menu published before this
ships carries no such key, and the resolver must treat that as "nothing featured" rather
than as an error.

Consequence: customers still load the entire menu in **one document read**. The featured
hookah costs no extra round trip.

Consequence to be aware of: a change to `menu/featured` is invisible to customers until
the snapshot is republished. This is already true of every other menu edit, and the
admin screen already republishes after each mutation, so the featured control must do
the same.

---

## 3. Resolution

A pure function, in its own module:

```ts
resolveHookahOfTheDay(menu: MenuData): { hookah: DatabaseHookah; promoText?: string } | null
```

It returns `null` when:

- the snapshot carries no `hookahOfTheDay`,
- the pointer names a hookah that no longer exists in the menu,
- the pointer names a hookah with `isActive === false`.

The last two are the cases that matter. An admin deactivates or deletes a hookah without
remembering it is the featured one; the promotion must disappear rather than render a
card for something the bar will not serve. Resolution stays a display concern — nothing
writes back to clean up the dangling pointer, because a hookah that is deactivated today
may be switched on again tomorrow, and silently dropping the promotion would be a
surprise.

Pure and dependency-free so it unit-tests directly, following the precedent of
`src/services/comboId.ts` and `src/services/reorderService.ts`.

---

## 4. Customer UI

Both placements, as chosen.

**Hero card**, above the recommended-mixes carousel: image, hookah name, promo line when
present, price, and a button. The button sets `selectedHookah` and scrolls to the
existing `step1Ref` in `Index.tsx`, so the promotion leads into the builder the customer
was going to use anyway.

**Badge** on that hookah's card in the Step 1 grid: a marker and a highlighted border,
so the hookah stays identifiable once the customer is choosing.

The hero lives in its own component file rather than inside `Index.tsx`, which is already
around 1200 lines and has been flagged in review for it. The component takes the resolved
result and a select callback; it holds no data fetching and no Firestore access.

When resolution returns `null`, neither the hero nor the badge renders and the page is
exactly what it is today.

---

## 5. Admin UI

A "Hookah of the day" control in `MenuManagement`:

- a picker listing active hookahs,
- an optional promo line with the 140-character cap surfaced in the field,
- a clear button,
- the current selection shown plainly.

Setting a new hookah replaces the pointer. Clearing deletes the document. Both republish
the menu snapshot, matching how every other mutation on that screen behaves.

The picker lists only active hookahs, so the ordinary path cannot create a dangling
pointer. The resolver still guards the case, because a hookah can be deactivated after
it was featured.

---

## 6. Testing

Unit tests on `resolveHookahOfTheDay`, which is where the logic actually lives:

- a valid pointer resolves to the hookah and its promo text
- a missing `hookahOfTheDay` resolves to `null`
- a pointer to an unknown id resolves to `null`
- a pointer to a deactivated hookah resolves to `null`
- a pointer with no `promoText` resolves with the hookah and no text

No emulator tests: this feature adds no rule, and `match /menu/{document}` is already
covered by the existing suite.

---

## 7. Risks

**Forgotten promotion.** With no expiry, a featured hookah runs until someone changes it.
Accepted deliberately — see §1.

**Snapshot staleness.** A featured change that does not republish is invisible to
customers. Mitigated by republishing in the same handler, exactly as the existing menu
mutations do.

**Dangling pointer.** Covered by the resolver, tested explicitly.

---

## 8. What this does not touch

Ordering, cart, orders, favourites, ratings, friends, the claim flow, `firestore.rules`,
and `firestore.indexes.json`. It ships on its own branch and its own PR, and needs no
deploy beyond the normal Vercel build.
