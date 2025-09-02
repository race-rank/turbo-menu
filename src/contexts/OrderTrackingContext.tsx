import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { OrderDetails, getOrderStatus } from '@/services/orderService';
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
  pollingInterval?: number;
}

export const OrderTrackingProvider: React.FC<OrderTrackingProviderProps> = ({ 
  children, 
  pollingInterval = 30000 // Default poll every 30 seconds
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

  // Save active orders to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('turboActiveOrders', JSON.stringify(activeOrders));
  }, [activeOrders]);

  // Poll for updates on active orders
  useEffect(() => {
    if (activeOrders.length === 0) return;

    const updateOrderStatuses = async () => {
      const updatedOrders = [...activeOrders];
      let hasChanges = false;

      for (let i = 0; i < updatedOrders.length; i++) {
        try {
          const orderDetails = await getOrderStatus(updatedOrders[i].orderId);
          
          // If status changed or order is complete, update it
          if (orderDetails.status !== updatedOrders[i].status) {
            updatedOrders[i] = {
              orderId: orderDetails.orderId,
              status: orderDetails.status,
              timestamp: orderDetails.timestamp,
              items: orderDetails.items,
              total: orderDetails.total,
              customerInfo: orderDetails.customerInfo
            };
            hasChanges = true;
          }
          
          // Remove completed orders after 2 minutes
          if (orderDetails.status === 'completed') {
            const completionTime = new Date(orderDetails.timestamp).getTime();
            const currentTime = new Date().getTime();
            
            if ((currentTime - completionTime) > 2 * 60 * 1000) {
              updatedOrders.splice(i, 1);
              i--; // Adjust index after removal
              hasChanges = true;
            }
          }
        } catch (error) {
          console.error(`Failed to update status for order ${updatedOrders[i].orderId}`, error);
        }
      }

      if (hasChanges) {
        setActiveOrders(updatedOrders);
      }
    };

    const intervalId = setInterval(updateOrderStatuses, pollingInterval);
    return () => clearInterval(intervalId);
  }, [activeOrders, pollingInterval]);

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
