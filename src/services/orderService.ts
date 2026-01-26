import { CartItem } from '@/contexts/CartContext';
import { 
  createOrderRecord, 
  getOrderRecord, 
  getOrdersByStatus, 
  updateOrderRecord,
  createNotificationRecord,
  getUnreadNotifications,
  getOrdersByDateRange
} from './firebaseService';

export interface OrderDetails {
  orderId: string;
  items: CartItem[];
  timestamp?: number;
  total: number;
  table?: string;
  customerInfo: {
    id: string;
    name?: string;
    phone?: string;
    table?: string;
  };
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed';
  createdAt?: Date;
}

const convertCartItemToDbItem = (item: CartItem) => ({
  id: item.id,
  type: item.type,
  name: item.name,
  price: item.price,
  image: item.image,
  hookah: item.hookah,
  tobaccoType: item.tobaccoType,
  tobaccoStrength: item.tobaccoStrength,
  flavors: item.flavors,
  hasLED: item.hasLED,
  hasColoredWater: item.hasColoredWater,
  hasAlcohol: item.hasAlcohol,
  hasFruits: item.hasFruits
});

export const submitOrder = async (orderData: Omit<OrderDetails, 'orderId' | 'status'>): Promise<OrderDetails> => {
  try {
    console.log('=== SUBMITTING ORDER TO FIREBASE ===');
    console.log('Customer:', orderData.customerInfo);
    console.log('Items:', orderData.items);
    console.log('Total:', orderData.total, 'Lei');
    console.log('===================================');
    
    const timestamp = new Date();
    const epochTime = timestamp.getTime();
    const dbOrderData = {
      items: orderData.items.map(convertCartItemToDbItem),
      total: orderData.total,
      table: orderData.table,
      timestamp: epochTime,
      customerInfo: orderData.customerInfo,
      status: 'pending' as const
    };
    
    const orderId = await createOrderRecord(dbOrderData);
    
    // Create notification for admin
    await createNotificationRecord({
      type: 'new_order',
      title: 'New Order Received',
      message: `Order from table ${orderData.table || 'Unknown'} - ${orderData.total} Lei`,
      isRead: false,
      orderId: orderId
    });
    
    console.log('=== ORDER CREATED IN FIREBASE ===');
    console.log('Order ID:', orderId);
    console.log('================================');
    
    return {
      orderId,
      items: orderData.items,
      total: orderData.total,
      table: orderData.table,
      customerInfo: orderData.customerInfo,
      status: 'pending',
      createdAt: timestamp
    };
  } catch (error) {
    console.error('Error submitting order to Firebase:', error);
    throw new Error('Failed to submit order. Please try again.');
  }
};

export const getAdminOrders = async (status?: string): Promise<{orders: OrderDetails[]}> => {
  try {
    const dbOrders = await getOrdersByStatus(status);
    
    const orders = dbOrders.map(order => ({
      orderId: order.orderId,
      items: order.items as CartItem[],
      total: order.total,
      table: order.table,
      customerInfo: order.customerInfo,
      status: order.status
    }));
    
    return { orders };
  } catch (error) {
    console.error('Error getting admin orders from Firebase:', error);
    throw error;
  }
};

export const getOrderStatus = async (orderId: string): Promise<OrderDetails> => {
  try {
    const orderData = await getOrderRecord(orderId);
    
    if (!orderData) {
      throw new Error('Order not found');
    }
    
    return {
      orderId: orderData.orderId,
      items: orderData.items as CartItem[],
      total: orderData.total,
      table: orderData.table,
      customerInfo: orderData.customerInfo,
      status: orderData.status
    };
  } catch (error) {
    console.error('Error getting order status from Firebase:', error);
    throw error;
  }
};

export const updateOrderStatus = async (orderId: string, status: string): Promise<OrderDetails> => {
  try {
    console.log(`Updating Firebase order ${orderId} status to ${status}`);
    
    await updateOrderRecord(orderId, { 
      status: status as 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' 
    });
    
    await createNotificationRecord({
      type: 'order_update',
      title: 'Order Status Updated',
      message: `Order ${orderId.substring(0, 8)} is now ${status}`,
      isRead: false,
      orderId: orderId
    });
    
    const updatedOrder = await getOrderStatus(orderId);
    return updatedOrder;
  } catch (error) {
    console.error('Error updating order status in Firebase:', error);
    throw error;
  }
};

export const getAdminNotifications = async (): Promise<{notifications: any[]}> => {
  try {
    const dbNotifications = await getUnreadNotifications();
    
    const notifications = dbNotifications.map(notif => ({
      id: notif.id,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      isRead: notif.isRead,
      createdAt: notif.createdAt.toISOString(),
      orderId: notif.orderId
    }));
    
    return { notifications };
  } catch (error) {
    console.error('Error getting admin notifications from Firebase:', error);
    throw error;
  }
};

export const getOrdersInRange = async (start: Date, end: Date): Promise<OrderDetails[]> => {
  const dbOrders = await getOrdersByDateRange(start, end);
  return dbOrders.map(order => ({
    orderId: order.orderId,
    items: order.items as CartItem[],
    total: order.total,
    table: order.table,
    customerInfo: order.customerInfo,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    timestamp: order.timestamp,
  }));
};