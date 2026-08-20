import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { getOrdersForUser } from '@/services/orderService';
import type { OrderDetails } from '@/services/orderService';

const MyOrders: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    getOrdersForUser(user.uid)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setBusy(false));
  }, [user, loading]);

  return (
    <div className="min-h-screen px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold mb-6">My orders</h1>

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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default MyOrders;
