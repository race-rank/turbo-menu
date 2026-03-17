export interface FlavorAnalytics {
  flavor: string;
  count: number;
  percentage: number;
}

export interface TobaccoStrengthAnalytics {
  strength: number;
  count: number;
  percentage: number;
}

export interface AddOnAnalytics {
  name: string;
  count: number;
  percentage: number;
}

export interface HookahAnalytics {
  hookahName: string;
  count: number;
  revenue: number;
}

export interface TimeBasedAnalytics {
  hour: number;
  orders: number;
  revenue: number;
}

export interface OrderAnalytics {
  total: number;
  completed: number;
  pending: number;
  preparing: number;
  confirmed: number;
  ready: number;
}

export interface RevenueAnalytics {
  totalRevenue: number;
  averageOrderValue: number;
  dailyRevenue: number;
  lowestOrderValue: number;
  highestOrderValue: number;
}

export interface ProductAnalytics {
  productName: string;
  quantity: number;
  revenue: number;
  percentage: number;
}

export interface DailyAnalytics {
  date: string;
  orders: number;
  revenue: number;
  averageOrder: number;
}

export interface AnalyticsDataPoint {
  date: string;
  orders: number;
  revenue: number;
  completed: number;
}

export interface ComprehensiveAnalytics {
  dateRange: {
    start: Date;
    end: Date;
  };
  orderAnalytics: OrderAnalytics;
  revenueAnalytics: RevenueAnalytics;
  flavorAnalytics: FlavorAnalytics[];
  tobaccoStrengthAnalytics: TobaccoStrengthAnalytics[];
  addOnAnalytics: AddOnAnalytics[];
  hookahAnalytics: HookahAnalytics[];
  productAnalytics: ProductAnalytics[];
  timeBasedAnalytics: TimeBasedAnalytics[];
  dailyAnalytics: DailyAnalytics[];
}
