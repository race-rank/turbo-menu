import { useState, useEffect } from 'react';
import { Bell, MoreHorizontal, RefreshCw, Filter, Clock, CheckCircle, Package, Sparkles, List, History } from 'lucide-react';
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

  const formatDate = (timestamp?: number | string | Date) => {
    console.log("Formatting date for timestamp:", timestamp);
    if (!timestamp) return '';
    try {
      let date: Date;
      if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        return '';
      }
      
      if (isNaN(date.getTime())) return '';
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return '';
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
    <div className="min-h-screen bg-turbo-dark text-turbo-text pb-20">
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
                          <p className="text-xs text-turbo-muted">{formatDate(notif?.timestamp)}</p>
                        </div>
                      )}
                      {notif.type === 'status-change' && (
                        <div>
                          <p className="font-medium">Status Change: {notif.data?.orderId || 'Unknown'}</p>
                          <p className="text-xs">{notif.data?.previousStatus || 'Unknown'} → {notif.data?.status || 'Unknown'}</p>
                          <p className="text-xs text-turbo-muted">{formatDate(notif?.timestamp)}</p>
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
          <TabsList className="hidden">
            <TabsTrigger value="all">All Orders</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
            <TabsTrigger value="preparing">Preparing</TabsTrigger>
            <TabsTrigger value="ready">Ready</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

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
                            Created: {formatDate(order?.timestamp) || '—'}
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
                            <div key={index} className="flex flex-col gap-1 text-sm p-2 bg-muted/30 rounded">
                              <div className="flex items-center justify-between">
                                <span className="flex-1">• 1x {item.name}</span>
                                <span className="font-medium">{item.price} Lei</span>
                              </div>
                              {item.type === 'custom' && (
                                <>
                                  {item.hookah && (
                                    <span className="text-xs text-turbo-muted ml-4">Hookah: {item.hookah}</span>
                                  )}
                                  {item.flavors && item.flavors.length > 0 && (
                                    <span className="text-xs text-turbo-muted ml-4">Flavors: {item.flavors.join(', ')}</span>
                                  )}
                                  {(item.hasLED || item.hasColoredWater || item.hasAlcohol || item.hasFruits) && (
                                    <div className="flex flex-wrap gap-1 ml-4 mt-1">
                                      {item.hasLED && (
                                        <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">💡 LED</span>
                                      )}
                                      {item.hasColoredWater && (
                                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">🎨 Colored</span>
                                      )}
                                      {item.hasAlcohol && (
                                        <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">🍷 Alcohol</span>
                                      )}
                                      {item.hasFruits && (
                                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">🍊 Fruits</span>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
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

      {/* Bottom Tab Bar Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-turbo-card border-t border-border z-50">
        <div className="flex justify-around items-center h-16">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeTab === 'all' ? 'text-turbo-accent' : 'text-turbo-muted'
            }`}
          >
            <List className="h-5 w-5 mb-1" />
            <span className="text-xs">All</span>
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeTab === 'pending' ? 'text-turbo-accent' : 'text-turbo-muted'
            }`}
          >
            <Clock className="h-5 w-5 mb-1" />
            <span className="text-xs">Pending</span>
          </button>
          <button
            onClick={() => setActiveTab('confirmed')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeTab === 'confirmed' ? 'text-turbo-accent' : 'text-turbo-muted'
            }`}
          >
            <CheckCircle className="h-5 w-5 mb-1" />
            <span className="text-xs">Confirmed</span>
          </button>
          <button
            onClick={() => setActiveTab('preparing')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeTab === 'preparing' ? 'text-turbo-accent' : 'text-turbo-muted'
            }`}
          >
            <Package className="h-5 w-5 mb-1" />
            <span className="text-xs">Preparing</span>
          </button>
          <button
            onClick={() => setActiveTab('ready')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeTab === 'ready' ? 'text-turbo-accent' : 'text-turbo-muted'
            }`}
          >
            <Sparkles className="h-5 w-5 mb-1" />
            <span className="text-xs">Ready</span>
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              activeTab === 'completed' ? 'text-turbo-accent' : 'text-turbo-muted'
            }`}
          >
            <History className="h-5 w-5 mb-1" />
            <span className="text-xs">Completed</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Admin;