import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { useOrderTracking } from '@/contexts/OrderTrackingContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { submitOrder } from '@/services/orderService';
import { ensureSignedIn } from '@/services/authService';
import { recordOrderPlaced } from '@/services/userService';
import { OrderFooter } from '@/components/layout/OrderFooter';
import { OrderPlacedOverlay } from '@/components/OrderPlacedOverlay';

const Cart = () => {
  const navigate = useNavigate();
  const { state, removeItem, updateQuantity, clearCart } = useCart();
  const { addOrder } = useOrderTracking();
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{
    orderId: string;
    total: number;
    table?: string;
  } | null>(null);

  const getTableHome = () => {
    const stored = localStorage.getItem('turbo-table') || '';
    return stored && (stored.includes('table-') || stored.includes('bar'))
      ? (stored.startsWith('/') ? stored : `/${stored}`)
      : '/';
  };

  const navigateBack = () => {
    navigate(getTableHome());
  };

  // Stable identity: the overlay restarts its countdown timer whenever this
  // changes, so a fresh arrow every render would keep resetting it.
  const returnToMenu = useCallback(() => {
    navigate(getTableHome());
  }, [navigate]);

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeItem(itemId);
      toast({
        title: "Item removed",
        description: "Item has been removed from your cart.",
      });
    } else {
      updateQuantity(itemId, newQuantity);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    removeItem(itemId);
    toast({
      title: "Item removed",
      description: "Item has been removed from your cart.",
    });
  };

  const handleOrderSubmission = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const user = await ensureSignedIn();
      const tableId = localStorage.getItem('turbo-table') || '';

      const orderData = {
        items: state.items,
        total: state.total,
        table: tableId,
        customerInfo: {
          uid: user.uid
        }
      };

      const result = await submitOrder(orderData);
      await recordOrderPlaced(user).catch(() => undefined);

      // Add the order to tracking
      addOrder(result);

      clearCart();

      // The overlay owns the confirmation and the trip back to the menu, so no
      // toast and no bare timer here. isSubmitting deliberately stays set: the
      // overlay covers the page until it navigates away, so there is nothing
      // left to double-submit.
      setPlacedOrder({
        orderId: result.orderId,
        total: result.total,
        table: result.table,
      });

    } catch (error) {
      console.error('Error submitting order:', error);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      toast({
        title: "Order submission failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    }
  };

  if (placedOrder) {
    return (
      <OrderPlacedOverlay
        orderId={placedOrder.orderId}
        total={placedOrder.total}
        table={placedOrder.table}
        onDone={returnToMenu}
      />
    );
  }

  return (
    <div className="min-h-screen bg-turbo-dark text-turbo-text pb-24">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="icon" className="text-turbo-text" onClick={navigateBack}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        
        <h1 className="text-2xl font-bold tracking-wider">CART</h1>
        
        <div className="w-10" />
      </header>

      <div className="container mx-auto px-4 py-6">
        {state.items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-turbo-muted text-lg mb-4">Your cart is empty</p>
            <Button onClick={navigateBack} className="bg-primary hover:bg-primary/90">
              Start Shopping
            </Button>

          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              {state.items.map((item) => (
                <Card key={item.id} className="bg-turbo-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <img 
                        src={item.image} 
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                      
                      <div className="flex-1">
                        <h3 className="font-semibold text-turbo-text">{item.name}</h3>
                        {item.type === 'custom' && (
                          <div className="text-sm text-turbo-muted mt-1">
                            <p>Hookah: {item.hookah}</p>
                            <p>Flavors: {item.flavors?.join(', ')}</p>
                            {(item.hasLED || item.hasColoredWater || item.hasAlcohol || item.hasFruits) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.hasLED && (
                                  <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">LED</span>
                                )}
                                {item.hasColoredWater && (
                                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Colored Water</span>
                                )}
                                {item.hasAlcohol && (
                                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Alcohol</span>
                                )}
                                {item.hasFruits && (
                                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Fruits</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <p className="text-amber-400 font-bold mt-2">{item.price} Lei</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-turbo-card border-border">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg font-semibold">Total:</span>
                  <span className="text-2xl font-bold text-amber-400">{state.total} Lei</span>
                </div>
                <div className="space-y-2">
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={handleOrderSubmission}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Order'}
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={clearCart}
                  >
                    Clear Cart
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      {state.items.length > 0 && (
        <OrderFooter
          primaryAction={{
            label: isSubmitting ? 'Submitting...' : 'Submit Order',
            onClick: handleOrderSubmission,
            disabled: isSubmitting
          }}
        />
      )}
    </div>
  );
};

export default Cart;
