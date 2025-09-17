export interface DatabaseOrder {
  orderId: string;
  items: DatabaseOrderItem[];
  total: number;
  timestamp: Date;
  table?: string;
  customerInfo: {
    id: string;
    name?: string;
    phone?: string;
  };
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseOrderItem {
  id: string;
  type: 'mix' | 'custom';
  name: string;
  price: number;
  image: string;
  hookah?: string;
  tobaccoType?: 'blond' | 'dark';
  tobaccoStrength?: number;
  flavors?: string[];
  table?: string;
}

export interface DatabaseProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  description?: string;
  image: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseTable {
  id: string;
  number: string;
  isOccupied: boolean;
  currentSession?: string;
  lastUpdated: Date;
}

export interface DatabaseSession {
  id: string;
  tableId: string;
  startTime: Date;
  endTime?: Date;
  totalAmount: number;
  orders: string[];
  isActive: boolean;
}

export interface DatabaseNotification {
  id: string;
  type: 'new_order' | 'order_update' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  orderId?: string;
}