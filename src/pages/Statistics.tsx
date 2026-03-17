import { useState, useEffect } from 'react';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { getAdminOrders, OrderDetails } from '@/services/orderService';
import { toast } from '@/hooks/use-toast';

const Statistics = () => {
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initial load with loading state
  useEffect(() => {
    const loadOrders = async () => {
      setIsLoading(true);
      try {
        const response = await getAdminOrders();
        setOrders(response.orders);
      } catch (error) {
        console.error('Failed to load orders:', error);
        toast({
          title: "Error",
          description: "Failed to load orders. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadOrders();
  }, []);

  // Silent refresh of orders only (no loading state, no toast)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await getAdminOrders();
        setOrders(response.orders);
      } catch (error) {
        console.error('Failed to refresh orders:', error);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-turbo-dark text-turbo-text pb-20">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <NavigationSidebar />
        <h1 className="text-2xl font-bold tracking-wider">STATISTICS</h1>
        <div className="w-10" />
      </header>

      <div className="container mx-auto px-4 py-6">
        <AnalyticsDashboard orders={orders} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default Statistics;
