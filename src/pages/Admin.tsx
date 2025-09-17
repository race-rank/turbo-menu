import { useState, useEffect } from 'react';
import { Bell, MoreHorizontal, RefreshCw, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getAdminOrders,
  getAdminNotifications,
  updateOrderStatus,
  OrderDetails
} from '@/services/orderService';
import { toast } from '@/hooks/use-toast';
import { NavigationSidebar } from '@/components/NavigationSidebar';

const Admin = () => {
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const statusOptions = [
    { value: 'pending', label: 'Pending', color: 'bg-yellow-500' },
    { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-500' },
    { value: 'preparing', label: 'Preparing', color: 'bg-purple-500' },
    { value: 'ready', label: 'Ready', color: 'bg-green-500' },
    { value: 'completed', label: 'Completed', color: 'bg-gray-500' }
  ];

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return 'N/A';
    }
  };

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const status = activeTab !== 'all' ? activeTab : undefined;
      const response = await getAdminOrders(status);
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

  const loadNotifications = async () => {
    try {
      const response = await getAdminNotifications();
      setNotifications(response.notifications);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast({
        title: "Status Updated",
        description: `Order ${orderId} status changed to ${newStatus}`,
      });
      loadOrders();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast({
        title: "Error",
        description: "Failed to update order status.",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    loadOrders();
    loadNotifications();

    const interval = setInterval(() => {
      loadOrders();
      loadNotifications();
    }, 30000);

    return () => clearInterval(interval);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-turbo-dark text-turbo-text">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <NavigationSidebar />

        <h1 className="text-2xl font-bold tracking-wider">TURBO ADMIN</h1>
        
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-turbo-muted">
                  No new notifications
                </div>
              ) : (
                <div className="max-h-[400px] overflow-auto">
                  {notifications.map((notif) => (
                    <DropdownMenuItem key={notif.id} className="p-3 border-b border-border">
                      {notif.type === 'new-order' && (
                        <div>
                          <p className="font-medium">New Order: {notif.data?.orderId || 'Unknown'}</p>
                          <p className="text-xs text-turbo-muted">{formatDate(notif.createdAt)}</p>
                        </div>
                      )}
                      {notif.type === 'status-change' && (
                        <div>
                          <p className="font-medium">Status Change: {notif.data?.orderId || 'Unknown'}</p>
                          <p className="text-xs">{notif.data?.previousStatus || 'Unknown'} → {notif.data?.status || 'Unknown'}</p>
                          <p className="text-xs text-turbo-muted">{formatDate(notif.createdAt)}</p>
                        </div>
                      )}
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              loadOrders();
              loadNotifications();
              toast({
                title: "Refreshed",
                description: "Order data has been updated."
              });
            }}
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs 
          defaultValue="all" 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="w-full"
        >
          <div className="flex items-center justify-between mb-6">
            <TabsList className="bg-turbo-card">
              <TabsTrigger value="all">All Orders</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
              <TabsTrigger value="preparing">Preparing</TabsTrigger>
              <TabsTrigger value="ready">Ready</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="mt-0">
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-turbo-muted">Loading orders...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-turbo-muted text-lg mb-4">No orders found</p>
              </div>
            ) : (
              <div className="space-y-6">
                {orders.map((order) => (
                  <Card key={order.orderId} className="bg-turbo-card border-border">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-bold">{order.orderId}</h3>
                            <span className={`px-2 py-1 text-xs rounded-full text-white ${
                              statusOptions.find(s => s.value === order.status)?.color || 'bg-gray-500'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-sm text-turbo-muted">
                            Created: {formatDate(new Date().toISOString())}
                          </p>
                          {order.table && (
                            <p className="text-sm text-turbo-muted">
                              Table: {order.table}
                            </p>
                          )}
                          <p className="font-semibold mt-2">
                            {order.items.length} items · {order.total} Lei
                          </p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                Update Status <MoreHorizontal className="ml-2 h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {statusOptions.map((status) => (
                                <DropdownMenuItem 
                                  key={status.value}
                                  disabled={order.status === status.value}
                                  onClick={() => handleStatusChange(order.orderId, status.value)}
                                >
                                  Set to {status.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              // Show order details in a modal or expand in-place
                              console.log("Order details:", order);
                              // This would be better implemented with a modal component
                              alert(`Order ${order.orderId} contains ${order.items.length} items.`);
                            }}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                      
                      {/* Order Items Summary (could be collapsible) */}
                      <div className="mt-4 border-t border-border pt-4">
                        <h4 className="text-sm font-medium mb-2">Items:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {order.items.map((item, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <span>• 1x</span>
                              <span className="flex-1">{item.name}</span>
                              <span className="font-medium">{item.price} Lei</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;