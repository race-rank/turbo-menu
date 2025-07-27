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
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

export const submitOrder = async (orderData: Omit<OrderDetails, 'orderId' | 'timestamp' | 'status'>): Promise<OrderDetails> => {
  try {
    const orderDetails: OrderDetails = {
      orderId: `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      status: 'pending',
      ...orderData
    };

    // In development, we'll simulate the API call
    if (process.env.NODE_ENV === 'development') {
      console.log('=== ORDER SUBMITTED TO ADMIN ===');
      console.log('Order ID:', orderDetails.orderId);
      console.log('Customer:', orderDetails.customerInfo);
      console.log('Items:', orderDetails.items);
      console.log('Total:', orderDetails.total, 'Lei');
      console.log('Timestamp:', new Date(orderDetails.timestamp).toLocaleString());
      console.log('================================');
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
    if (process.env.NODE_ENV === 'development') {
      await new Promise(resolve => setTimeout(resolve, 500));
      throw new Error('Order not found in development mode');
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
