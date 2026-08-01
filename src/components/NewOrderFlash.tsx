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
    <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center bg-amber-500/30 animate-pulse">
      <div className="bg-turbo-dark/90 border-2 border-amber-400 rounded-xl px-8 py-6 text-center shadow-2xl">
        <p className="text-3xl font-bold text-amber-400">🔔 New Order</p>
        <p className="text-lg text-turbo-text mt-2">
          Table {order.table ?? '—'} · {order.total} Lei
        </p>
      </div>
    </div>
  );
};
