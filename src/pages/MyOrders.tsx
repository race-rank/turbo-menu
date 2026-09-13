import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { getOrdersForUser } from '@/services/orderService';
import type { OrderDetails } from '@/services/orderService';
import { StarRating } from '@/components/StarRating';
import { rateOrder } from '@/services/ratingsService';
import { toast } from '@/hooks/use-toast';

const MyOrders: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [busy, setBusy] = useState(true);
  // Optimistic local scores, keyed by orderId. The list is fetched once, so
  // without this a freshly given rating would not appear until a reload.
  const [scores, setScores] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    getOrdersForUser(user.uid)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setBusy(false));
  }, [user, loading]);

  const handleRate = async (order: OrderDetails, score: number) => {
    if (!user) return;
    const firstItem = order.items?.[0] as { comboId?: string; name?: string } | undefined;
    if (!firstItem?.comboId) return;

    setSaving(order.orderId);
    const previous = scores[order.orderId];
    setScores((current) => ({ ...current, [order.orderId]: score }));
    try {
      await rateOrder(
        user.uid,
        order.orderId,
        firstItem.comboId,
        firstItem.name ?? 'Your order',
        score,
      );
      toast({ title: 'Thanks for rating' });
    } catch (error) {
      setScores((current) => ({ ...current, [order.orderId]: previous ?? 0 }));
      toast({
        title: 'Could not save your rating',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    // pb-24 clears the OrderStatusTracker, which App.tsx pins to the bottom of
    // every page while an order is live.
    <div className="min-h-screen pb-24">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <NavigationSidebar />
        <h1 className="text-2xl font-bold tracking-wider">MY ORDERS</h1>
        {/* Balances the menu button so the title stays centred. */}
        <div className="w-10" />
      </header>

      <div className="px-4 py-6">
        {isAnonymous && (
          <Card className="bg-turbo-card border-primary mb-6">
            <CardContent className="p-4">
              <p className="text-sm mb-3">
                You're browsing as a guest. Create an account to keep this history on any device.
              </p>
              <Button className="w-full" onClick={() => navigate('/account')}>
                Sign up to keep your history
              </Button>
            </CardContent>
          </Card>
        )}

        {busy && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!busy && orders.length === 0 && (
          <p className="text-turbo-muted">No orders yet.</p>
        )}

        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.orderId} className="bg-turbo-card border-border">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs text-turbo-muted">
                    {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">{order.status}</span>
                </div>
                <p className="text-sm mb-2">
                  {order.items.map((item) => item.name).join(', ')}
                </p>
                <p className="text-lg font-bold text-amber-400">{order.total} Lei</p>
                {(order.items?.[0] as { comboId?: string } | undefined)?.comboId && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-xs uppercase text-turbo-muted">
                      {scores[order.orderId] ?? (order as { rating?: number }).rating
                        ? 'Your rating'
                        : 'Rate this'}
                    </p>
                    <StarRating
                      size="sm"
                      value={
                        scores[order.orderId]
                        ?? (order as { rating?: number }).rating
                        ?? 0
                      }
                      disabled={saving === order.orderId}
                      onChange={(score) => handleRate(order, score)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MyOrders;
