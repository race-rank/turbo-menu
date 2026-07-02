# Order submit rate limiting + full-screen new-order alert

## Problem

1. Users can spam-click "Submit Order" in the cart. There is no guard on `handleOrderSubmission`, and `createOrderRecord` does a plain `addDoc` with no idempotency check, so each click creates a new duplicate order in Firestore.
2. Admin currently has no visual indication when a new order arrives — only an audio beep (`playNewOrderSound`, added in commit `a4556ce`). Staff can miss it in a noisy environment or if the tab isn't focused. Admin also polls Firestore every 10s, adding up to 10s of latency before staff even learn about an order.

## Constraints

- No backend server exists — the client (Vite + React + TypeScript) writes directly to Firestore via the `firebase/firestore` SDK. There are no Cloud Functions, so server-side rate limiting/idempotency is out of scope for this change.
- Styling is Tailwind + shadcn/ui. No debounce/throttle utility exists in the codebase today.
- A real-time listener (`subscribeToOrders`, using `onSnapshot`) already exists in `src/services/firebaseService.ts` but is currently only used for customer-side order tracking, not on the admin screen.

## 1. Rate limit the Submit Order button

**File:** `src/pages/Cart.tsx`

- Add `isSubmittingRef = useRef(false)` for a synchronous guard (refs update immediately, unlike state, so a second click fired before re-render is still blocked) and `isSubmitting` state to drive the UI.
- `handleOrderSubmission`:
  - At the top: if `isSubmittingRef.current` is true, return immediately.
  - Set `isSubmittingRef.current = true` and `setIsSubmitting(true)` before calling `submitOrder`.
  - On success: keep the guard active for a 3-second cooldown via `setTimeout` before resetting both the ref and state. This covers the window before the existing 2-second auto-navigate fires, in case the user re-opens the cart quickly.
  - On error (existing `catch` block): reset the ref and state immediately, so the user can retry right away without waiting out a cooldown for a failed request.
- Pass `disabled={isSubmitting}` to the "Submit Order" button (`Cart.tsx:190-195`) and to `OrderFooter`'s `primaryAction` (`Cart.tsx:210-212`) — `OrderFooter` already supports a `disabled` prop (`OrderFooter.tsx:93-99`), it's just never been wired up.
- While `isSubmitting` is true, change the button label to "Submitting..." so the disabled state is visually obvious, not just inert.

No backend changes. This fixes the actual reported bug (duplicate orders from rapid clicks) at its source — there was no debounce guard at all before this change.

## 2. Switch Admin to a real-time order feed

**Files:** `src/services/firebaseService.ts` (already has what's needed), `src/services/orderService.ts`, `src/pages/Admin.tsx`

- Add `subscribeToAdminOrders(callback: (orders: OrderDetails[]) => void): Unsubscribe` to `orderService.ts`. It wraps `firebaseService.subscribeToOrders` (no status filter, matching current `getAdminOrders()` usage) and maps `DatabaseOrder[]` to `OrderDetails[]` using the same field mapping `getAdminOrders` already performs.
- In `Admin.tsx`, replace the polling `useEffect` (`Admin.tsx:172-183`, the 10s `setInterval`) with a single mount-time subscription:
  ```
  useEffect(() => {
    const unsubscribe = subscribeToAdminOrders((newOrders) => {
      setOrders(newOrders);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
  ```
- The existing `activeTab`-keyed effect (`Admin.tsx:154-157`) still calls `loadOrders()` once on mount/tab change today, but `getAdminOrders()` is always called with no status argument (tab filtering happens client-side at render via `orders.filter(...)`, `Admin.tsx:288`), so this call is redundant once the subscription is in place. Remove `loadOrders()` from that effect; keep `loadNotifications()` there as-is (notifications are unaffected by this change).
- The manual refresh button (`Admin.tsx:243-256`) keeps calling `loadOrders()` + `loadNotifications()` — harmless (the subscription will just receive the same data), and still meaningfully refreshes notifications.
- The existing `knownOrderIds` diff effect (`Admin.tsx:159-169`) is unchanged — it already fires `playNewOrderSound()` when unseen order IDs appear in `orders`. It now reacts to push updates (≈1s latency) instead of poll results (≤10s latency).

## 3. Full-screen flashing alert on new order

**New file:** `src/components/NewOrderFlash.tsx`

- Props: `order: { orderId: string; table?: string; total: number } | null`, `onDismiss: () => void`.
- Renders `null` when `order` is `null`.
- Otherwise renders a `fixed inset-0 z-[100] pointer-events-none` overlay with an amber-tinted pulsing background (Tailwind's built-in `animate-pulse` utility — no custom keyframes needed) and a centered card: "🔔 New Order" heading plus "Table {order.table ?? '—'} · {order.total} Lei".
- `pointer-events-none` on the overlay so staff can keep interacting with the page underneath while it flashes.
- Internally, a `useEffect` keyed on `order?.orderId` starts a `setTimeout(onDismiss, 4500)` and clears it on cleanup/re-trigger — self-dismisses after ~4.5s, no manual acknowledgement required.

**Wiring in `Admin.tsx`:**

- Add `const [flashOrder, setFlashOrder] = useState<...|null>(null)`.
- In the `knownOrderIds` diff effect, alongside the existing `playNewOrderSound()` call, add `setFlashOrder(fresh[0])` (the most recent fresh order, since results are ordered by `createdAt desc`).
- Render `<NewOrderFlash order={flashOrder} onDismiss={() => setFlashOrder(null)} />` once near the top of the page.
- If multiple orders arrive in the same diff tick, only the latest is flashed — showing a queue of overlapping flashes isn't worth the complexity for what should be a rare edge case.

## Testing

- Manual: rapid-click "Submit Order" in the cart with dev tools open on the Firestore `orders` collection — confirm only one document is created, button visibly disables/relabels, re-enables after ~3s or immediately on a simulated failure.
- Manual: with Admin open in one tab and the customer cart in another, submit an order and confirm the flash appears within ~1s (not up to 10s), pulses, shows correct table/total, and clears itself after ~4.5s without blocking clicks on the order list underneath.
- No existing automated test suite covers this flow (none found in the repo) — manual verification only.
