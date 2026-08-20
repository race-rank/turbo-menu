# Order Rate Limiting + New-Order Flash Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop spam-clicking "Submit Order" from creating duplicate Firestore orders, and give Admin a full-screen flashing alert (fed by a real-time listener instead of 10s polling) when a new order arrives.

**Architecture:** Client-only changes (no backend server exists — Firestore is written to directly). Cart gets a ref+state submit guard with a post-success cooldown. Admin swaps its polling `setInterval` for the existing-but-unused `subscribeToOrders` Firestore listener, and a new `NewOrderFlash` overlay component is triggered from the existing "unseen order ID" diff logic.

**Tech Stack:** Vite + React 18 + TypeScript, Firebase Firestore (`onSnapshot`), Tailwind CSS.

**No automated test suite exists in this repo** (no test runner, no `*.test.*` files, no `test` script in `package.json`). Verification in this plan is: TypeScript compiles clean (`npx tsc --noEmit`), ESLint passes (`npm run lint`), and manual exercise of the feature via `npm run dev`. This matches the existing codebase convention — do not introduce a test framework as part of this work, that's a separate decision for the user to make.

---

### Task 1: Rate-limit the Cart submit button

**Files:**
- Modify: `src/pages/Cart.tsx`

- [ ] **Step 1: Add the submit guard state and ref**

In `src/pages/Cart.tsx`, change the React import and add two new hooks right after the existing `useOrderTracking` line:

```tsx
import { useRef, useState } from 'react';
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react';
```

```tsx
const Cart = () => {
  const navigate = useNavigate();
  const { state, removeItem, updateQuantity, clearCart } = useCart();
  const { addOrder } = useOrderTracking();
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
```

- [ ] **Step 2: Guard `handleOrderSubmission` and add a post-success cooldown**

Replace the full `handleOrderSubmission` function with:

```tsx
  const handleOrderSubmission = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const customerId = `customer-${Math.random().toString(36).substr(2, 9)}`;
      const tableId = localStorage.getItem('turbo-table') || '';

      const orderData = {
        items: state.items,
        total: state.total,
        table: tableId,
        customerInfo: {
          id: customerId
        }
      };

      const result = await submitOrder(orderData);

      // Add the order to tracking
      addOrder(result);

      clearCart();

      toast({
        title: "Order complete!",
        description: "Someone is actively reviewing it.",
        duration: 5000,
      });

      setTimeout(() => {
        navigate(getTableHome());
      }, 2000);

      // Keep the button disabled for a short cooldown after success,
      // in case the user re-opens the cart before the redirect above fires.
      setTimeout(() => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }, 3000);

    } catch (error) {
      console.error('Error submitting order:', error);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      toast({
        title: "Order submission failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    }
  };
```

- [ ] **Step 3: Disable both submit buttons while submitting**

Replace the "Submit Order" `Button` (currently `Cart.tsx:190-195`):

```tsx
                  <Button 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={handleOrderSubmission}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Order'}
                  </Button>
```

Replace the `OrderFooter` usage (currently `Cart.tsx:210-212`) — `OrderFooter`'s `primaryAction` prop already supports `disabled` (see `src/components/layout/OrderFooter.tsx:21`, `:97`), it's just never been passed:

```tsx
      {state.items.length > 0 && (
        <OrderFooter
          primaryAction={{
            label: isSubmitting ? 'Submitting...' : 'Submit Order',
            onClick: handleOrderSubmission,
            disabled: isSubmitting
          }}
        />
      )}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors in `src/pages/Cart.tsx`.

- [ ] **Step 5: Manually verify**

Run: `npm run dev`

In the browser: add an item to the cart, open the Firestore console (or the Network tab) to the `orders` collection, then click "Submit Order" 5-10 times as fast as possible.

Expected:
- Only one new document appears in `orders`.
- The button immediately shows "Submitting..." and is unclickable after the first click.
- The button re-enables ~3s after success (or immediately if you simulate a failure, e.g. by going offline before submitting).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Cart.tsx
git commit -m "fix(cart): guard submit order button against spam-clicks"
```

---

### Task 2: Add a real-time order subscription helper

**Files:**
- Modify: `src/services/orderService.ts`

- [ ] **Step 1: Import `subscribeToOrders` from the Firebase service**

In `src/services/orderService.ts`, change the import block at the top:

```ts
import { CartItem } from '@/contexts/CartContext';
import { 
  createOrderRecord, 
  getOrderRecord, 
  getOrdersByStatus, 
  updateOrderRecord,
  createNotificationRecord,
  getUnreadNotifications,
  getOrdersByDateRange,
  subscribeToOrders
} from './firebaseService';
```

- [ ] **Step 2: Add `subscribeToAdminOrders`, mapping `DatabaseOrder` to `OrderDetails` the same way `getAdminOrders` does**

Add this new function directly after `getAdminOrders` (after the closing brace that currently ends at `src/services/orderService.ts:115`):

```ts
export const subscribeToAdminOrders = (
  callback: (orders: OrderDetails[]) => void
): (() => void) => {
  return subscribeToOrders((dbOrders) => {
    const orders = dbOrders.map(order => ({
      orderId: order.orderId,
      items: order.items as CartItem[],
      total: order.total,
      table: order.table,
      customerInfo: order.customerInfo,
      status: order.status,
      updatedAt: order.updatedAt,
      createdAt: order.createdAt
    }));
    callback(orders);
  });
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`subscribeToAdminOrders` is unused until Task 3 — that's expected here, TypeScript won't flag unused exports.)

- [ ] **Step 4: Commit**

```bash
git add src/services/orderService.ts
git commit -m "feat(orders): add subscribeToAdminOrders real-time helper"
```

---

### Task 3: Switch Admin to the real-time order subscription

**Files:**
- Modify: `src/pages/Admin.tsx`

- [ ] **Step 1: Import the new subscription helper**

In `src/pages/Admin.tsx`, update the import from `orderService`:

```tsx
import {
  getAdminOrders,
  getAdminNotifications,
  updateOrderStatus,
  subscribeToAdminOrders,
  OrderDetails
} from '@/services/orderService';
```

- [ ] **Step 2: Stop fetching orders on tab change (tab filtering is already client-side)**

Replace the effect currently at `Admin.tsx:154-157`:

```tsx
  useEffect(() => {
    loadOrders();
    loadNotifications();
  }, [activeTab]);
```

with:

```tsx
  useEffect(() => {
    loadNotifications();
  }, [activeTab]);
```

(`getAdminOrders()` is always called with no status argument — tab filtering happens client-side at render via `orders.filter(order => activeTab === 'all' || order.status === activeTab)` — so re-fetching all orders on every tab change was redundant. `loadOrders` itself is untouched and stays in use by the manual refresh button and `handleStatusChange`.)

- [ ] **Step 3: Replace the 10s polling interval with a live subscription**

Delete this effect (currently `Admin.tsx:171-183`):

```tsx
  // Silent refresh of orders only (no loading state)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await getAdminOrders();
        setOrders(response.orders);
      } catch (error) {
        console.error('Failed to refresh orders:', error);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);
```

Replace it with:

```tsx
  useEffect(() => {
    const unsubscribe = subscribeToAdminOrders((newOrders) => {
      setOrders(newOrders);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors in `src/pages/Admin.tsx`.

- [ ] **Step 5: Manually verify**

Run: `npm run dev`, open `/admin` logged in as admin, and in a second tab/window place an order as a customer.

Expected:
- The new order appears in the Admin order list within ~1s (not up to 10s).
- The existing new-order sound (`playNewOrderSound`) still plays.
- Switching tabs (All/Pending/Confirmed/...) still filters correctly and doesn't cause a flash of "Loading orders...".

- [ ] **Step 6: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat(admin): use real-time Firestore subscription instead of 10s polling"
```

---

### Task 4: Full-screen flashing new-order alert

**Files:**
- Create: `src/components/NewOrderFlash.tsx`
- Modify: `src/pages/Admin.tsx`

- [ ] **Step 1: Create the flash overlay component**

Create `src/components/NewOrderFlash.tsx`:

```tsx
import { useEffect } from 'react';

export interface FlashOrder {
  orderId: string;
  table?: string;
  total: number;
}

interface NewOrderFlashProps {
  order: FlashOrder | null;
  onDismiss: () => void;
}

export const NewOrderFlash = ({ order, onDismiss }: NewOrderFlashProps) => {
  useEffect(() => {
    if (!order) return;
    const timeout = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timeout);
  }, [order, onDismiss]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-amber-500/30 animate-pulse">
      <div className="bg-turbo-dark/90 border-2 border-amber-400 rounded-xl px-8 py-6 text-center shadow-2xl">
        <p className="text-3xl font-bold text-amber-400">🔔 New Order</p>
        <p className="text-lg text-turbo-text mt-2">
          Table {order.table ?? '—'} · {order.total} Lei
        </p>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire it into Admin**

In `src/pages/Admin.tsx`, add the import:

```tsx
import { NewOrderFlash, FlashOrder } from '@/components/NewOrderFlash';
```

Add state right after the existing `audioCtxRef` declaration:

```tsx
  const [flashOrder, setFlashOrder] = useState<FlashOrder | null>(null);
```

Update the `knownOrderIds` diff effect to also trigger the flash, using the most recent fresh order (`orders` is sorted `createdAt desc` per `getOrdersByStatus`/`subscribeToOrders`, so `fresh[0]` is the newest):

```tsx
  useEffect(() => {
    if (knownOrderIds.current === null) {
      knownOrderIds.current = new Set(orders.map(o => o.orderId));
      return;
    }
    const fresh = orders.filter(o => !knownOrderIds.current!.has(o.orderId));
    if (fresh.length > 0) {
      playNewOrderSound();
      setFlashOrder({
        orderId: fresh[0].orderId,
        table: fresh[0].table,
        total: fresh[0].total
      });
    }
    knownOrderIds.current = new Set(orders.map(o => o.orderId));
  }, [orders]);
```

Render the overlay near the top of the returned JSX, as the first child of the outermost `div` (right before the `<header>` at `Admin.tsx:186`):

```tsx
    <div className="min-h-screen bg-turbo-dark text-turbo-text pb-20">
      <NewOrderFlash order={flashOrder} onDismiss={() => setFlashOrder(null)} />
      <header className="flex items-center justify-between p-4 border-b border-border">
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manually verify**

Run: `npm run dev`, open `/admin`, and place an order from another tab/window as a customer.

Expected:
- A full-screen amber-tinted overlay pulses in, showing "🔔 New Order" and the correct table + total.
- It disappears on its own after ~4.5s, no click needed.
- While it's showing, you can still click order rows/buttons underneath it (`pointer-events-none` is working).
- Placing two orders back-to-back only shows the latest one flashing (no stacking) — this is expected per the design.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewOrderFlash.tsx src/pages/Admin.tsx
git commit -m "feat(admin): add full-screen flashing alert for new orders"
```
