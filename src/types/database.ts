export interface DatabaseOrder {
  orderId: string;
  items: DatabaseOrderItem[];
  total: number;
  timestamp: number | Date;
  table?: string;
  customerInfo: {
    uid: string;
    id?: string;
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
  quantity: number;
  // No `image` here on purpose. Menu images are base64 data URIs of roughly
  // 900KB, so carrying one per item put order documents at 91% of Firestore's
  // 1MiB limit. Staff need the name, hookah and flavors, never a photo.
  hookah?: string;
  tobaccoType?: 'virginia' | 'darkblend' | 'cigarleaf' | 'mix';
  tobaccoStrength?: number;
  flavors?: string[];
  flavorPercentages?: Record<string, number>;
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
  type: 'virginia' | 'darkblend' | 'cigarleaf' | 'mix';
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
  compatibleTobaccoTypes: ('virginia' | 'darkblend' | 'cigarleaf')[];
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