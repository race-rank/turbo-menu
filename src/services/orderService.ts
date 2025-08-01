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

// API endpoint - using the dev server on port 3001
const API_BASE_URL = 'http://192.168.1.144:3001/api';

// Customer-facing functions
export const submitOrder = async (orderData: Omit<OrderDetails, 'orderId' | 'timestamp' | 'status'>): Promise<OrderDetails> => {
  try {
    // Log for debugging
    console.log('=== ORDER SUBMITTING TO ADMIN ===');
    console.log('Customer:', orderData.customerInfo);
    console.log('Items:', orderData.items);
    console.log('Total:', orderData.total, 'Lei');
    console.log('================================');
    
    // Make the actual API call
    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit order: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Log the successful response
    console.log('=== ORDER SUBMITTED TO ADMIN ===');
    console.log('Order ID:', result.order?.orderId);
    console.log('Timestamp:', new Date(result.order?.timestamp).toLocaleString());
    console.log('================================');
    
    return result.order;
  } catch (error) {
    console.error('Error submitting order:', error);
    throw new Error('Failed to submit order. Please try again.');
  }
};

export const getOrderStatus = async (orderId: string): Promise<OrderDetails> => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get order status: ${response.statusText}`);
    }

    const result = await response.json();
    return result.order;
  } catch (error) {
    console.error('Error getting order status:', error);
    throw error;
  }
};

// Admin-facing functions
export const getAdminOrders = async (status?: string): Promise<{orders: OrderDetails[]}> => {
  try {
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
    console.log(`Updating order ${orderId} status to ${status}`);
    
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

    const result = await response.json();
    return result.order;
  } catch (error) {
    console.error('Error updating order status:', error);
    throw error;
  }
};

export const getAdminNotifications = async (): Promise<{notifications: any[]}> => {
  try {
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