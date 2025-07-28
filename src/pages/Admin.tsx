import { useState, useEffect } from 'react';
import { Check, X, MoreHorizontal, RefreshCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

import {
  getAdminOrders,
  updateOrderStatus,
  OrderDetails,
  getAdminNotifications
} from '@/services/orderService';

const Admin = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingOrders, setPendingOrders] = useState<OrderDetails[]>([]);
  const [confirmedOrders, setConfirmedOrders] = useState<OrderDetails[]>([]);
  const [completedOrders, setCompletedOrders] = useState<OrderDetails[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Function to load orders based on status
  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const response = await getAdminOrders();
      
      // Group orders by status
      const pending = response.orders.filter(order => order.status === 'pending');
      const confirmed = response.orders.filter(order => ['confirmed', 'preparing', 'ready'].includes(order.status));
      const completed = response.orders.filter(order => order.status === 'completed');
      
      setPendingOrders(pending);
      setConfirmedOrders(confirmed);
      setCompletedOrders(completed);
      
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast({
        title: "Failed to load orders",
        description: "Please try refreshing the page.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to load notifications
  const loadNotifications = async () => {
    try {
      const response = await getAdminNotifications();
      setNotifications(response.notifications);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  // Function to handle order status updates
  const handleStatusUpdate = async (orderId: string, status: string) => {
    try {
      await updateOrderStatus(orderId, status);
      
      toast({
        title: "Status updated",
        description: `Order ${orderId.split('-')[1]} has been ${status}`,
      });
      
      // Reload orders to reflect changes
      loadOrders();
      
    } catch (error) {
      console.error('Failed to update order status:', error);
      toast({
        title: "Status update failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  // Load orders on initial render and when activeTab changes
  useEffect(() => {
    loadOrders();
    loadNotifications();
    
    // Set up polling for new orders every 30 seconds
    const interval = setInterval(() => {
      loadOrders();
      loadNotifications();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Function to format currency
  const formatCurrency = (amount: number) => `${amount} Lei`;

  // Function to render status badge
  const renderStatusBadge = (status: string) => {
    let color = "";
    switch (status) {
      case 'pending': color = "bg-yellow-500"; break;
      case 'confirmed': color = "bg-blue-500"; break;
      case 'preparing': color = "bg-purple-500"; break;
      case 'ready': color = "bg-green-500"; break;
      case 'completed': color = "bg-gray-500"; break;
      default: color = "bg-gray-500";
    }
    
    return <Badge className={`${color} text-white`}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-klaud-dark text-klaud-text p-6">
      <header className="mb-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <Button variant="outline" onClick={() => loadOrders()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <p className="text-klaud-muted mt-2">Manage orders and view statistics</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main content - orders */}
        <div className="lg:col-span-3">
          <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
            <div className="flex justify-between items-center mb-6">
              <TabsList className="bg-klaud-card">
                <TabsTrigger value="pending" className="data-[state=active]:bg-amber-600">
                  Pending
                  {pendingOrders.length > 0 && (
                    <span className="ml-2 bg-amber-600 text-white rounded-full h-5 min-w-[20px] px-1 text-xs flex items-center justify-center">
                      {pendingOrders.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="confirmed" className="data-[state=active]:bg-primary">
                  In Progress
                  {confirmedOrders.length > 0 && (
                    <span className="ml-2 bg-primary text-white rounded-full h-5 min-w-[20px] px-1 text-xs flex items-center justify-center">
                      {confirmedOrders.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="completed">
                  History
                </TabsTrigger>
              </TabsList>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>All Orders</DropdownMenuItem>
                  <DropdownMenuItem>Last 24 Hours</DropdownMenuItem>
                  <DropdownMenuItem>This Week</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <TabsContent value="pending" className="mt-0">
              <div className="space-y-4">
                {isLoading ? (
                  <Card className="bg-klaud-card border-border">
                    <CardContent className="p-6 flex justify-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-klaud-muted" />
                    </CardContent>
                  </Card>
                ) : pendingOrders.length === 0 ? (
                  <Card className="bg-klaud-card border-border">
                    <CardContent className="p-6 text-center text-klaud-muted">
                      No pending orders at the moment.
                    </CardContent>
                  </Card>
                ) : (
                  pendingOrders.map((order) => (
                    <Card key={order.orderId} className="bg-klaud-card border-border">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-semibold">Order #{order.orderId.split('-')[1]}</h3>
                            <p className="text-klaud-muted text-sm">
                              {formatDistanceToNow(new Date(order.timestamp), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-green-600 hover:bg-green-700 text-white border-none"
                              onClick={() => handleStatusUpdate(order.orderId, 'confirmed')}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-red-600 hover:bg-red-700 text-white border-none"
                              onClick={() => handleStatusUpdate(order.orderId, 'completed')}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Dismiss
                            </Button>
                          </div>
                        </div>
                        
                        <div className="border-t border-border pt-4 mt-4">
                          <h4 className="text-sm font-medium mb-2">Items:</h4>
                          <ul className="space-y-2">
                            {order.items.map((item, index) => (
                              <li key={index} className="flex justify-between items-center">
                                <div className="flex items-center">
                                  <span className="text-sm">
                                    {item.quantity}x {item.name}
                                    {item.type === 'custom' && (
                                      <span className="text-klaud-muted ml-2 text-xs">
                                        ({item.hookah} - {item.flavors?.join(', ')})
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <span className="text-amber-400">{formatCurrency(item.price * item.quantity)}</span>
                              </li>
                            ))}
                          </ul>
                          
                          <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                            <span className="font-semibold">Total:</span>
                            <span className="font-semibold text-amber-400 text-lg">{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="confirmed" className="mt-0">
              <div className="space-y-4">
                {isLoading ? (
                  <Card className="bg-klaud-card border-border">
                    <CardContent className="p-6 flex justify-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-klaud-muted" />
                    </CardContent>
                  </Card>
                ) : confirmedOrders.length === 0 ? (
                  <Card className="bg-klaud-card border-border">
                    <CardContent className="p-6 text-center text-klaud-muted">
                      No orders in progress.
                    </CardContent>
                  </Card>
                ) : (
                  confirmedOrders.map((order) => (
                    <Card key={order.orderId} className="bg-klaud-card border-border">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-semibold">Order #{order.orderId.split('-')[1]}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              {renderStatusBadge(order.status)}
                              <span className="text-klaud-muted text-sm">
                                {formatDistanceToNow(new Date(order.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleStatusUpdate(order.orderId, 'preparing')}>
                                Mark as Preparing
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusUpdate(order.orderId, 'ready')}>
                                Mark as Ready
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusUpdate(order.orderId, 'completed')}>
                                Mark as Completed
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        
                        <div className="border-t border-border pt-4 mt-4">
                          <h4 className="text-sm font-medium mb-2">Items:</h4>
                          <ul className="space-y-2">
                            {order.items.map((item, index) => (
                              <li key={index} className="flex justify-between items-center">
                                <div className="flex items-center">
                                  <span className="text-sm">
                                    {item.quantity}x {item.name}
                                    {item.type === 'custom' && (
                                      <span className="text-klaud-muted ml-2 text-xs">
                                        ({item.hookah} - {item.flavors?.join(', ')})
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <span className="text-amber-400">{formatCurrency(item.price * item.quantity)}</span>
                              </li>
                            ))}
                          </ul>
                          
                          <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                            <span className="font-semibold">Total:</span>
                            <span className="font-semibold text-amber-400 text-lg">{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="completed" className="mt-0">
              <div className="space-y-4">
                {isLoading ? (
                  <Card className="bg-klaud-card border-border">
                    <CardContent className="p-6 flex justify-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-klaud-muted" />
                    </CardContent>
                  </Card>
                ) : completedOrders.length === 0 ? (
                  <Card className="bg-klaud-card border-border">
                    <CardContent className="p-6 text-center text-klaud-muted">
                      No order history available.
                    </CardContent>
                  </Card>
                ) : (
                  completedOrders.map((order) => (
                    <Card key={order.orderId} className="bg-klaud-card border-border opacity-75">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-semibold">Order #{order.orderId.split('-')[1]}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              {renderStatusBadge(order.status)}
                              <span className="text-klaud-muted text-sm">
                                {formatDistanceToNow(new Date(order.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border-t border-border pt-4 mt-4">
                          <div className="flex justify-between items-center">
                            <span>{order.items.length} items</span>
                            <span className="text-amber-400">{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Sidebar - notifications and stats */}
        <div className="lg:col-span-1">
          <Card className="bg-klaud-card border-border">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <p className="text-klaud-muted text-sm">No recent activity</p>
              ) : (
                <div className="space-y-4">
                  {notifications.slice(0, 5).map((notification) => (
                    <div key={notification.id} className="border-b border-border pb-3 last:border-0">
                      <p className="text-sm">
                        {notification.type === 'new-order' && 'New order received'}
                        {notification.type === 'status-change' && `Order status changed to ${notification.data.status}`}
                      </p>
                      <p className="text-xs text-klaud-muted">
                        {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-klaud-card border-border mt-6">
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-klaud-muted">Pending Orders</span>
                  <span className="font-semibold">{pendingOrders.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-klaud-muted">In Progress</span>
                  <span className="font-semibold">{confirmedOrders.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-klaud-muted">Completed Today</span>
                  <span className="font-semibold">
                    {completedOrders.filter(order => {
                      const today = new Date();
                      const orderDate = new Date(order.timestamp);
                      return today.toDateString() === orderDate.toDateString();
                    }).length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Admin;
