import { CartItem } from '@/contexts/CartContext';

export interface OrderDetails {
  orderId: string;
  items: CartItem[];
  total: number;
  timestamp: string;
  customerInfo: {
    id: string;
    name?: string;
    phone?: string;
    table?: string;
  };
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed';
}

// Simulated API endpoint - replace with your actual backend URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Customer-facing functions
export const submitOrder = async (orderData: Omit<OrderDetails, 'orderId' | 'timestamp' | 'status'>): Promise<OrderDetails> => {
  try {
    const orderDetails: OrderDetails = {
      orderId: `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      status: 'pending',
      ...orderData
    };

    // In development, we'll simulate the API call
    if (import.meta.env.DEV) {
      console.log('=== ORDER SUBMITTED TO ADMIN ===');
      console.log('Order ID:', orderDetails.orderId);
      console.log('Customer:', orderDetails.customerInfo);
      console.log('Items:', orderDetails.items);
      console.log('Total:', orderDetails.total, 'Lei');
      console.log('Timestamp:', new Date(orderDetails.timestamp).toLocaleString());
      console.log('================================');
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Store in localStorage for development purposes
      const existingOrders = JSON.parse(localStorage.getItem('turbo_orders') || '[]');
      localStorage.setItem('turbo_orders', JSON.stringify([...existingOrders, orderDetails]));
      
      // Simulate successful response
      return orderDetails;
    }

    // Real API call for production
    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderDetails),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit order: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error submitting order:', error);
    throw new Error('Failed to submit order. Please try again.');
  }
};

export const getOrderStatus = async (orderId: string): Promise<OrderDetails> => {
  try {
    if (import.meta.env.DEV) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const existingOrders = JSON.parse(localStorage.getItem('turbo_orders') || '[]');
      const order = existingOrders.find((o: OrderDetails) => o.orderId === orderId);
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      return order;
    }

    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get order status: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting order status:', error);
    throw error;
  }
};

// Admin-facing functions
export const getAdminOrders = async (status?: string): Promise<{orders: OrderDetails[]}> => {
  try {
    if (import.meta.env.DEV) {
      await new Promise(resolve => setTimeout(resolve, 700));
      
      const existingOrders = JSON.parse(localStorage.getItem('turbo_orders') || '[]');
      const orders = status 
        ? existingOrders.filter((o: OrderDetails) => o.status === status)
        : existingOrders;
      
      return { orders };
    }

    const url = status 
      ? `${API_BASE_URL}/admin/orders?status=${status}`
      : `${API_BASE_URL}/admin/orders`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get admin orders: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting admin orders:', error);
    throw error;
  }
};

export const updateOrderStatus = async (orderId: string, status: string): Promise<OrderDetails> => {
  try {
    // In development mode, update in localStorage
    if (import.meta.env.DEV) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const existingOrders = JSON.parse(localStorage.getItem('turbo_orders') || '[]');
      const orderIndex = existingOrders.findIndex((o: OrderDetails) => o.orderId === orderId);
      
      if (orderIndex === -1) {
        throw new Error('Order not found');
      }
      
      // Update the order status
      existingOrders[orderIndex].previousStatus = existingOrders[orderIndex].status;
      existingOrders[orderIndex].status = status;
      existingOrders[orderIndex].statusUpdatedAt = new Date().toISOString();
      
      localStorage.setItem('turbo_orders', JSON.stringify(existingOrders));
      
      // Add notification
      const notifications = JSON.parse(localStorage.getItem('turbo_notifications') || '[]');
      notifications.unshift({
        id: `notif-${Date.now()}`,
        type: 'status-change',
        data: {
          orderId,
          status,
          previousStatus: existingOrders[orderIndex].previousStatus
        },
        timestamp: new Date().toISOString(),
        read: false
      });
      
      localStorage.setItem('turbo_notifications', JSON.stringify(notifications.slice(0, 100)));
      
      return existingOrders[orderIndex];
    }

    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update order status: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
};

export const getAdminNotifications = async (): Promise<{notifications: any[]}> => {
  try {
    // In development mode, get from localStorage
    if (import.meta.env.DEV) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const notifications = JSON.parse(localStorage.getItem('turbo_notifications') || '[]');
      return { notifications };
    }

    const response = await fetch(`${API_BASE_URL}/admin/notifications`);
    
    if (!response.ok) {
      throw new Error(`Failed to get admin notifications: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting admin notifications:', error);
    throw error;
  }
};
