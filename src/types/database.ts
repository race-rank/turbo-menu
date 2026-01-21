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
  tobaccoType?: 'virginia' | 'darkblend' | 'mix';
  tobaccoStrength?: number;
  flavors?: string[];
  table?: string;
  hasLED?: boolean;
  hasColoredWater?: boolean;
  hasAlcohol?: boolean;
  hasFruits?: boolean;
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

export interface DatabaseHookah {
  id: string;
  name: string;
  price: number;
  image: string;
  isActive: boolean;
  hasLED?: boolean;
  hasColoredWater?: boolean;
  hasAlcohol?: boolean;
  hasFruits?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseTobaccoType {
  id: string;
  name: string;
  description: string;
  type: 'virginia' | 'darkblend' | 'mix';
  image: string;
  strengthRange: {
    min: number;
    max: number;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseFlavor {
  id: string;
  name: string;
  image: string;
  compatibleTobaccoTypes: ('virginia' | 'darkblend')[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseRecommendedMix {
  id: string;
  name: string;
  price: number;
  category: string;
  mainImage: string;
  flavorImages: string[];
  bgColor: string;
  promoText?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}