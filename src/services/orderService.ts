import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { CartItem } from '@/contexts/CartContext';
import { firestore } from '@/lib/firebase';
import {
  createOrderRecord,
  getOrderRecord,
  getOrdersByStatus,
  updateOrderRecord,
  createNotificationRecord,
  getUnreadNotifications,
  getOrdersByDateRange,
  subscribeToOrders,
  safeConvertTimestamp
} from './firebaseService';
import { convertCartItemToDbItem } from './orderItem';

export interface OrderDetails {
  orderId: string;
  items: CartItem[];
  timestamp?: number;
  total: number;
  table?: string;
  customerInfo: {
    uid: string;
    id?: string;
    name?: string;
    table?: string;
  };
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed';
  createdAt?: Date;
}

export const submitOrder = async (orderData: Omit<OrderDetails, 'orderId' | 'status'>): Promise<OrderDetails> => {
  try {
    console.log('=== SUBMITTING ORDER TO FIREBASE ===');
    console.log('Customer:', orderData.customerInfo);
    console.log('Items:', orderData.items);
    console.log('Total:', orderData.total, 'Lei');
    console.log('===================================');
    
    const timestamp = new Date();
    const dbOrderData = {
      items: orderData.items.map(convertCartItemToDbItem),
      total: orderData.total,
      table: orderData.table,
      customerInfo: orderData.customerInfo,
      status: 'pending' as const
      // timestamp will be set by serverTimestamp() in createOrderRecord
    };
    
    const orderId = await createOrderRecord(dbOrderData);
    
    // Create notification for admin. Deliberately non-fatal: the order is
    // already committed, and a throw here would surface as "submission failed"
    // and get the same hookah ordered twice. Admin's new-order sound and flash
    // come from the orders listener, not from this record.
    await createNotificationRecord({
      type: 'new_order',
      title: 'New Order Received',
      message: `Order from table ${orderData.table || 'Unknown'} - ${orderData.total} Lei`,
      isRead: false,
      orderId: orderId
    }).catch(() => undefined);
    
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
      timestamp: timestamp.getTime(),
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
      status: order.status,
      updatedAt: order.updatedAt,
      createdAt: order.createdAt
    }));
    
    return { orders };
  } catch (error) {
    console.error('Error getting admin orders from Firebase:', error);
    throw error;
  }
};

export const subscribeToAdminOrders = (
  callback: (orders: OrderDetails[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  return subscribeToOrders(
    (dbOrders) => {
      const orders = dbOrders.map(order => ({
        orderId: order.orderId,
        items: order.items as CartItem[],
        total: order.total,
        table: order.table,
        customerInfo: order.customerInfo,
        status: order.status,
        updatedAt: order.updatedAt,
        createdAt: order.createdAt
      }));
      callback(orders);
    },
    undefined,
    onError
  );
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
  return dbOrders.map(order => {
    let timestamp: number | undefined;
    if (order.timestamp instanceof Date) {
      timestamp = order.timestamp.getTime();
    } else if (typeof order.timestamp === 'number') {
      timestamp = order.timestamp;
    }
    
    return {
      orderId: order.orderId,
      items: order.items as CartItem[],
      total: order.total,
      table: order.table,
      customerInfo: order.customerInfo,
      status: order.status,
      timestamp: timestamp,
      createdAt: order.createdAt,
    };
  });
};

export const getOrdersForUser = async (uid: string): Promise<OrderDetails[]> => {
  const ordersQuery = query(
    collection(firestore, 'orders'),
    where('customerInfo.uid', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snapshot = await getDocs(ordersQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      ...data,
      orderId: data.orderId ?? docSnap.id,
      // Without this the value stays a Firestore Timestamp and MyOrders
      // renders "Invalid Date".
      createdAt: safeConvertTimestamp(data.createdAt),
    } as OrderDetails;
  });
};
