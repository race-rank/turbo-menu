import { OrderDetails } from './orderService';
import {
  ComprehensiveAnalytics,
  FlavorAnalytics,
  TobaccoStrengthAnalytics,
  AddOnAnalytics,
  HookahAnalytics,
  ProductAnalytics,
  TimeBasedAnalytics,
  DailyAnalytics,
  OrderAnalytics,
  RevenueAnalytics,
} from '@/types/analytics';
import { CartItem } from '@/contexts/CartContext';

export const analyticsService = {
  /**
   * Calculate all analytics from a list of orders
   */
  calculateComprehensiveAnalytics(orders: OrderDetails[], startDate: Date, endDate: Date): ComprehensiveAnalytics {
    return {
      dateRange: { start: startDate, end: endDate },
      orderAnalytics: this.calculateOrderAnalytics(orders),
      revenueAnalytics: this.calculateRevenueAnalytics(orders),
      flavorAnalytics: this.calculateFlavorAnalytics(orders),
      tobaccoStrengthAnalytics: this.calculateTobaccoStrengthAnalytics(orders),
      addOnAnalytics: this.calculateAddOnAnalytics(orders),
      hookahAnalytics: this.calculateHookahAnalytics(orders),
      productAnalytics: this.calculateProductAnalytics(orders),
      timeBasedAnalytics: this.calculateTimeBasedAnalytics(orders),
      dailyAnalytics: this.calculateDailyAnalytics(orders),
    };
  },

  /**
   * Calculate order status distribution
   */
  calculateOrderAnalytics(orders: OrderDetails[]): OrderAnalytics {
    return {
      total: orders.length,
      completed: orders.filter(o => o.status === 'completed').length,
      pending: orders.filter(o => o.status === 'pending').length,
      preparing: orders.filter(o => o.status === 'preparing').length,
      confirmed: orders.filter(o => o.status === 'confirmed').length,
      ready: orders.filter(o => o.status === 'ready').length,
    };
  },

  /**
   * Calculate revenue metrics
   */
  calculateRevenueAnalytics(orders: OrderDetails[]): RevenueAnalytics {
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
    const orderValues = orders.map(o => o.total).filter(v => v > 0);
    
    return {
      totalRevenue,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      dailyRevenue: totalRevenue,
      lowestOrderValue: orderValues.length > 0 ? Math.min(...orderValues) : 0,
      highestOrderValue: orderValues.length > 0 ? Math.max(...orderValues) : 0,
    };
  },

  /**
   * Analyze flavor preferences
   */
  calculateFlavorAnalytics(orders: OrderDetails[]): FlavorAnalytics[] {
    const flavorMap = new Map<string, number>();
    let totalFlavors = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.flavors && Array.isArray(item.flavors)) {
          item.flavors.forEach(flavor => {
            flavorMap.set(flavor, (flavorMap.get(flavor) || 0) + 1);
            totalFlavors++;
          });
        }
      });
    });

    return Array.from(flavorMap.entries())
      .map(([flavor, count]) => ({
        flavor,
        count,
        percentage: totalFlavors > 0 ? (count / totalFlavors) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  },

  /**
   * Analyze tobacco strength preferences
   */
  calculateTobaccoStrengthAnalytics(orders: OrderDetails[]): TobaccoStrengthAnalytics[] {
    const strengthMap = new Map<number, number>();
    let totalStrengths = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.tobaccoStrength !== undefined) {
          strengthMap.set(item.tobaccoStrength, (strengthMap.get(item.tobaccoStrength) || 0) + 1);
          totalStrengths++;
        }
      });
    });

    return Array.from(strengthMap.entries())
      .map(([strength, count]) => ({
        strength,
        count,
        percentage: totalStrengths > 0 ? (count / totalStrengths) * 100 : 0,
      }))
      .sort((a, b) => a.strength - b.strength);
  },

  /**
   * Analyze add-on preferences (LED, colored water, alcohol, fruits)
   */
  calculateAddOnAnalytics(orders: OrderDetails[]): AddOnAnalytics[] {
    const addOns = {
      'LED': 0,
      'Colored Water': 0,
      'Alcohol': 0,
      'Fruits': 0,
    };

    let totalItems = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        totalItems++;
        if (item.hasLED) addOns['LED']++;
        if (item.hasColoredWater) addOns['Colored Water']++;
        if (item.hasAlcohol) addOns['Alcohol']++;
        if (item.hasFruits) addOns['Fruits']++;
      });
    });

    return Object.entries(addOns)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalItems > 0 ? (count / totalItems) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  },

  /**
   * Analyze hookah preferences
   */
  calculateHookahAnalytics(orders: OrderDetails[]): HookahAnalytics[] {
    const hookahMap = new Map<string, { count: number; revenue: number }>();

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.hookah) {
          const existing = hookahMap.get(item.hookah) || { count: 0, revenue: 0 };
          existing.count++;
          existing.revenue += item.price;
          hookahMap.set(item.hookah, existing);
        }
      });
    });

    return Array.from(hookahMap.entries())
      .map(([hookahName, { count, revenue }]) => ({
        hookahName,
        count,
        revenue,
      }))
      .sort((a, b) => b.count - a.count);
  },

  /**
   * Analyze product sales and revenue
   */
  calculateProductAnalytics(orders: OrderDetails[]): ProductAnalytics[] {
    const productMap = new Map<string, { quantity: number; revenue: number }>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const existing = productMap.get(item.name) || { quantity: 0, revenue: 0 };
        existing.quantity++;
        existing.revenue += item.price;
        productMap.set(item.name, existing);
      });
    });

    const totalRevenue = Array.from(productMap.values()).reduce((sum, p) => sum + p.revenue, 0);

    return Array.from(productMap.entries())
      .map(([productName, { quantity, revenue }]) => ({
        productName,
        quantity,
        revenue,
        percentage: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  },

  /**
   * Analyze orders by hour of day
   */
  calculateTimeBasedAnalytics(orders: OrderDetails[]): TimeBasedAnalytics[] {
    const hourlyData = new Map<number, { orders: number; revenue: number }>();

    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourlyData.set(i, { orders: 0, revenue: 0 });
    }

    orders.forEach(order => {
      const date = new Date(order.timestamp || 0);
      const hour = date.getHours();
      const existing = hourlyData.get(hour) || { orders: 0, revenue: 0 };
      existing.orders++;
      existing.revenue += order.total;
      hourlyData.set(hour, existing);
    });

    return Array.from(hourlyData.entries())
      .map(([hour, { orders: orderCount, revenue }]) => ({
        hour,
        orders: orderCount,
        revenue,
      }))
      .sort((a, b) => a.hour - b.hour);
  },

  /**
   * Analyze daily trends
   */
  calculateDailyAnalytics(orders: OrderDetails[]): DailyAnalytics[] {
    const dailyMap = new Map<string, { orders: number; revenue: number }>();

    orders.forEach(order => {
      const date = new Date(order.timestamp || 0);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      const existing = dailyMap.get(dateStr) || { orders: 0, revenue: 0 };
      existing.orders++;
      existing.revenue += order.total;
      dailyMap.set(dateStr, existing);
    });

    return Array.from(dailyMap.entries())
      .map(([date, { orders: orderCount, revenue }]) => ({
        date,
        orders: orderCount,
        revenue,
        averageOrder: orderCount > 0 ? revenue / orderCount : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  /**
   * Get top flavors
   */
  getTopFlavors(flavorAnalytics: FlavorAnalytics[], limit: number = 5): FlavorAnalytics[] {
    return flavorAnalytics.slice(0, limit);
  },

  /**
   * Get top products
   */
  getTopProducts(productAnalytics: ProductAnalytics[], limit: number = 10): ProductAnalytics[] {
    return productAnalytics.slice(0, limit);
  },

  /**
   * Format currency
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'RON',
    }).format(amount);
  },

  /**
   * Format percentage
   */
  formatPercentage(percentage: number): string {
    return `${percentage.toFixed(1)}%`;
  },
};
