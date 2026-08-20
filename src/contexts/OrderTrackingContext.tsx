import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { OrderDetails } from '@/services/orderService';
import { subscribeToOrder } from '@/services/firebaseService';
import { CartItem } from '@/contexts/CartContext';

interface ActiveOrder {
  orderId: string;
  status: string;
  timestamp: number;
  items: CartItem[];
  total: number;
  customerInfo: {
    uid: string;
    id?: string;
    name?: string;
    table?: string;
  };
}

interface OrderTrackingContextType {
  activeOrders: ActiveOrder[];
  addOrder: (order: OrderDetails) => void;
  removeOrder: (orderId: string) => void;
}

const OrderTrackingContext = createContext<OrderTrackingContextType | undefined>(undefined);

export const useOrderTracking = () => {
  const context = useContext(OrderTrackingContext);
  if (!context) {
    throw new Error('useOrderTracking must be used within an OrderTrackingProvider');
  }
  return context;
};

interface OrderTrackingProviderProps {
  children: ReactNode;
}

const safeToEpochTime = (timestamp: any): number => {
  if (!timestamp) {
    return Date.now();
  }
  
  if (typeof timestamp === 'number') {
    return timestamp;
  }
  
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  
  if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
    // Firestore Timestamp object
    return timestamp.toDate().getTime();
  }
  
  try {
    return new Date(timestamp).getTime();
  } catch (e) {
    console.error('Failed to convert timestamp:', timestamp, e);
    return Date.now();
  }
};

export const OrderTrackingProvider: React.FC<OrderTrackingProviderProps> = ({ 
  children
}) => {
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  
  // Load active orders from localStorage on startup
  useEffect(() => {
    const savedOrders = localStorage.getItem('turboActiveOrders');
    if (savedOrders) {
      try {
        const parsed = JSON.parse(savedOrders);
        const validatedOrders = (Array.isArray(parsed) ? parsed : []).map((order: any) => ({
          ...order,
          timestamp: typeof order.timestamp === 'number' ? order.timestamp : safeToEpochTime(order.timestamp)
        }));
        setActiveOrders(validatedOrders);
      } catch (e) {
        console.error('Failed to parse saved orders', e);
        localStorage.removeItem('turboActiveOrders');
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('turboActiveOrders', JSON.stringify(activeOrders));
  }, [activeOrders]);

  useEffect(() => {
    if (activeOrders.length === 0) return;

    // One listener per tracked order. A collection-wide listener would leak
    // every customer's order and is rejected by security rules.
    const unsubscribes = activeOrders.map((tracked) =>
      subscribeToOrder(tracked.orderId, (updated) => {
        if (!updated) return;
        setActiveOrders((prev) =>
          prev
            .map((order) =>
              order.orderId === updated.orderId
                ? {
                    orderId: updated.orderId,
                    status: updated.status,
                    timestamp: safeToEpochTime(updated.timestamp),
                    items: updated.items as CartItem[],
                    total: updated.total,
                    customerInfo: updated.customerInfo,
                  }
                : order,
            )
            .filter((order) => {
              if (order.status === 'completed') {
                return Date.now() - order.timestamp <= 2 * 60 * 1000;
              }
              return true;
            }),
        );
      }),
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [activeOrders.map((o) => o.orderId).join(',')]);

  const addOrder = (order: OrderDetails) => {
    const timestamp = order.createdAt || new Date();
    const epochTime = safeToEpochTime(timestamp);
    
    setActiveOrders(prev => [
      ...prev,
      {
        orderId: order.orderId,
        status: order.status,
        timestamp: epochTime,
        items: order.items,
        total: order.total,
        customerInfo: order.customerInfo
      }
    ]);
  };

  const removeOrder = (orderId: string) => {
    setActiveOrders(prev => prev.filter(order => order.orderId !== orderId));
  };

  return (
    <OrderTrackingContext.Provider value={{ activeOrders, addOrder, removeOrder }}>
      {children}
    </OrderTrackingContext.Provider>
  );
};
