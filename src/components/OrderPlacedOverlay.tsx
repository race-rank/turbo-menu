import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const RETURN_AFTER_SECONDS = 3;

interface OrderPlacedOverlayProps {
  orderId: string;
  total: number;
  table?: string;
  onDone: () => void;
}

/**
 * Shown for a beat after checkout so placing an order registers as an event.
 * The previous flow fired a toast and yanked the customer back to the menu on a
 * bare 2s timer, which read as the app dropping them.
 *
 * The countdown is escapable: "Back to menu now" leaves immediately, and the
 * live status card stays pinned to the bottom of every page regardless, so
 * nothing here is the only route to order status.
 */
export const OrderPlacedOverlay: React.FC<OrderPlacedOverlayProps> = ({
  orderId,
  total,
  table,
  onDone,
}) => {
  const [remaining, setRemaining] = useState(RETURN_AFTER_SECONDS);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return;
    }
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onDone]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-turbo-dark px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="animate-ring-in mb-8 flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary">
        <svg viewBox="0 0 52 52" className="h-12 w-12" aria-hidden="true">
          <path
            className="animate-check-draw"
            d="M14 27 L22 35 L38 18"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="animate-rise-in">
        <h1 className="mb-2 text-3xl font-bold tracking-wide">Order placed</h1>
        <p className="mb-6 text-turbo-muted">Someone is reviewing it now.</p>

        <div className="mb-8 space-y-1 text-sm">
          <p className="font-mono text-base">#{orderId.substring(0, 8).toUpperCase()}</p>
          {table && <p className="text-turbo-muted">Table {table}</p>}
          <p className="font-bold text-amber-400">{total} Lei</p>
        </div>

        <Button variant="outline" className="w-full max-w-xs" onClick={onDone}>
          Back to menu now
        </Button>
        <p className="mt-3 text-xs text-turbo-muted">
          {remaining > 0
            ? `Returning to the menu in ${remaining}…`
            : 'Returning to the menu…'}
        </p>
      </div>
    </div>
  );
};
