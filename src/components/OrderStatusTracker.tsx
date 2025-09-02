import React, { useState } from 'react';
import { X, Clock, CheckCircle2, Coffee, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useOrderTracking } from '@/contexts/OrderTrackingContext';
import { cn } from '@/lib/utils';

export const OrderStatusTracker: React.FC = () => {
  const { activeOrders, removeOrder } = useOrderTracking();
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  
  if (activeOrders.length === 0) return null;
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'confirmed':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'preparing':
        return <Coffee className="h-5 w-5 text-orange-500" />;
      case 'ready':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'confirmed': return 'bg-blue-500';
      case 'preparing': return 'bg-orange-500';
      case 'ready': return 'bg-green-500';
      case 'completed': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'confirmed': return 'Confirmed';
      case 'preparing': return 'Preparing';
      case 'ready': return 'Ready';
      case 'completed': return 'Completed';
      default: return 'Unknown';
    }
  };

  const formatOrderId = (orderId: string) => {
    return orderId.substring(0, 8).toUpperCase();
  };

  const toggleOrderDetails = (orderId: string) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-4 px-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
      {activeOrders.map(order => (
        <Card 
          key={order.orderId}
          className={cn(
            "bg-turbo-card border shadow-lg",
            order.status === 'completed' ? "border-green-500" : "border-primary"
          )}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(order.status)}
                <span className="font-medium">Order #{formatOrderId(order.orderId)}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => toggleOrderDetails(order.orderId)}
                >
                  {expandedOrder === order.orderId ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => removeOrder(order.orderId)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Dismiss</span>
                </Button>
              </div>
            </div>
            
            <div className="w-full bg-muted rounded-full h-2.5">
              <div 
                className={cn(
                  "h-2.5 rounded-full transition-all duration-1000",
                  getStatusColor(order.status)
                )}
                style={{ 
                  width: order.status === 'pending' ? '20%' : 
                         order.status === 'confirmed' ? '40%' : 
                         order.status === 'preparing' ? '60%' : 
                         order.status === 'ready' ? '80%' : '100%' 
                }}
              />
            </div>
            
            <div className="mt-2 text-sm text-turbo-muted">
              Status: <span className="font-medium">{getStatusText(order.status)}</span>
            </div>
            
            {/* Order details section */}
            {expandedOrder === order.orderId && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-sm mb-2">
                  {order.customerInfo.table && (
                    <div className="font-medium">Table: {order.customerInfo.table}</div>
                  )}
                  {order.customerInfo.name && (
                    <div>Name: {order.customerInfo.name}</div>
                  )}
                  <div className="text-right font-bold">Total: {order.total} Lei</div>
                </div>
                
                <div className="space-y-2 mt-3">
                  <h4 className="text-xs font-medium uppercase text-turbo-muted">Order Items:</h4>
                  <ul className="text-sm space-y-2">
                    {order.items.map((item, index) => (
                      <li key={index} className="flex justify-between">
                        <div>
                          <span className="font-medium">{item.name}</span>
                          {item.type === 'custom' && item.flavors && (
                            <div className="text-xs text-turbo-muted">
                              {item.tobaccoType && (
                                <span className="capitalize">{item.tobaccoType} tobacco • </span>
                              )}
                              {item.flavors.join(', ')}
                            </div>
                          )}
                        </div>
                        <span>{item.price} Lei</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="mt-3 text-xs text-turbo-muted">
                  Ordered at: {new Date(order.timestamp).toLocaleString()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
