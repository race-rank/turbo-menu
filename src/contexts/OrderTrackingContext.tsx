import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { OrderDetails } from '@/services/orderService';
import { subscribeToOrders } from '@/services/firebaseService';
import { CartItem } from '@/contexts/CartContext';

interface ActiveOrder {
  orderId: string;
  status: string;
  timestamp: string;
  items: CartItem[];
  total: number;
  customerInfo: {
    id: string;
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

export const OrderTrackingProvider: React.FC<OrderTrackingProviderProps> = ({ 
  children
}) => {
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  
  // Load active orders from localStorage on startup
  useEffect(() => {
    const savedOrders = localStorage.getItem('turboActiveOrders');
    if (savedOrders) {
      try {
        setActiveOrders(JSON.parse(savedOrders));
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

    const unsubscribe = subscribeToOrders((updatedOrders) => {
      setActiveOrders(prevOrders => {
        return prevOrders.map(prevOrder => {
          const updatedOrder = updatedOrders.find(order => order.orderId === prevOrder.orderId);
          if (updatedOrder) {
            return {
              orderId: updatedOrder.orderId,
              status: updatedOrder.status,
              timestamp: updatedOrder.timestamp.toISOString(),
              items: updatedOrder.items as CartItem[],
              total: updatedOrder.total,
              customerInfo: updatedOrder.customerInfo
            };
          }
          return prevOrder;
        }).filter(order => {
          if (order.status === 'completed') {
            const completionTime = new Date(order.timestamp).getTime();
            const currentTime = new Date().getTime();
            return (currentTime - completionTime) <= 2 * 60 * 1000;
          }
          return true;
        });
      });
    });

    return () => unsubscribe();
  }, [activeOrders.map(o => o.orderId).join(',')]);

  const addOrder = (order: OrderDetails) => {
    setActiveOrders(prev => [
      ...prev,
      {
        orderId: order.orderId,
        status: order.status,
        timestamp: order.timestamp,
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
