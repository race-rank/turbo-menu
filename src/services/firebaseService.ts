import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase'
import { DatabaseOrder, DatabaseNotification } from '@/types/database';

const COLLECTIONS = {
  ORDERS: 'orders',
  PRODUCTS: 'products',
  TABLES: 'tables',
  NOTIFICATIONS: 'notifications',
  SESSIONS: 'sessions'
} as const;

const cleanObject = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanObject);
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanObject(value);
      }
    }
    return cleaned;
  }
  return obj;
};

const safeConvertTimestamp = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return new Date(timestamp);
};

export const createOrderRecord = async (orderData: Omit<DatabaseOrder, 'orderId' | 'createdAt' | 'updatedAt'>) => {
  try {
    const cleanedOrderData = cleanObject({
      ...orderData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    const docRef = await addDoc(collection(firestore, COLLECTIONS.ORDERS), cleanedOrderData);
    
    await updateDoc(docRef, { orderId: docRef.id });
    
    return docRef.id;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
};

export const updateOrderRecord = async (orderId: string, updates: Partial<DatabaseOrder>) => {
  try {
    const orderRef = doc(firestore, COLLECTIONS.ORDERS, orderId);
    await updateDoc(orderRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
};

export const getOrderRecord = async (orderId: string): Promise<DatabaseOrder | null> => {
  try {
    const orderRef = doc(firestore, COLLECTIONS.ORDERS, orderId);
    const orderSnap = await getDoc(orderRef);
    
    if (orderSnap.exists()) {
      const data = orderSnap.data();
      return {
        ...data,
        timestamp: safeConvertTimestamp(data.timestamp),
        createdAt: safeConvertTimestamp(data.createdAt),
        updatedAt: safeConvertTimestamp(data.updatedAt)
      } as DatabaseOrder;
    }
    return null;
  } catch (error) {
    console.error('Error getting order:', error);
    throw error;
  }
};

export const getOrdersByStatus = async (status?: string): Promise<DatabaseOrder[]> => {
  try {
    let ordersQuery = query(
      collection(firestore, COLLECTIONS.ORDERS),
      orderBy('createdAt', 'desc')
    );
    
    if (status) {
      ordersQuery = query(
        collection(firestore, COLLECTIONS.ORDERS),
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
    }
    
    const querySnapshot = await getDocs(ordersQuery);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        timestamp: safeConvertTimestamp(data.timestamp),
        createdAt: safeConvertTimestamp(data.createdAt),
        updatedAt: safeConvertTimestamp(data.updatedAt)
      } as DatabaseOrder;
    });
  } catch (error) {
    console.error('Error getting orders by status:', error);
    throw error;
  }
};

export const subscribeToOrders = (callback: (orders: DatabaseOrder[]) => void, status?: string) => {
  let ordersQuery = query(
    collection(firestore, COLLECTIONS.ORDERS),
    orderBy('createdAt', 'desc')
  );
  
  if (status) {
    ordersQuery = query(
      collection(firestore, COLLECTIONS.ORDERS),
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
  }
  
  return onSnapshot(ordersQuery, (querySnapshot) => {
    const orders = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        timestamp: safeConvertTimestamp(data.timestamp),
        createdAt: safeConvertTimestamp(data.createdAt),
        updatedAt: safeConvertTimestamp(data.updatedAt)
      } as DatabaseOrder;
    });
    callback(orders);
  });
};

export const updateTableStatus = async (tableId: string, isOccupied: boolean) => {
  try {
    const tableRef = doc(firestore, COLLECTIONS.TABLES, tableId);
    await updateDoc(tableRef, {
      isOccupied,
      lastUpdated: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating table status:', error);
    throw error;
  }
};

export const createNotificationRecord = async (notification: Omit<DatabaseNotification, 'id' | 'createdAt'>) => {
  try {
    await addDoc(collection(firestore, COLLECTIONS.NOTIFICATIONS), {
      ...notification,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

export const getUnreadNotifications = async (): Promise<DatabaseNotification[]> => {
  try {
    let notificationsQuery;
    
    try {
      notificationsQuery = query(
        collection(firestore, COLLECTIONS.NOTIFICATIONS),
        where('isRead', '==', false),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(notificationsQuery);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: safeConvertTimestamp(data.createdAt)
        } as DatabaseNotification;
      });
    } catch (indexError) {
      console.warn('Composite index not available, using simple query');
      
      // Fallback to simple query without orderBy
      notificationsQuery = query(
        collection(firestore, COLLECTIONS.NOTIFICATIONS),
        where('isRead', '==', false)
      );
      
      const querySnapshot = await getDocs(notificationsQuery);
      const notifications = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: safeConvertTimestamp(data.createdAt)
        } as DatabaseNotification;
      });
      
      // Sort manually by createdAt descending
      return notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
  } catch (error) {
    console.error('Error getting notifications:', error);
    throw error;
  }
};

export const generateOrderId = (): string => {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
};

export const convertTimestampToDate = (timestamp: Timestamp | Date): Date => {
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
};