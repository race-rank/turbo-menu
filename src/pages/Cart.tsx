import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { submitOrder } from '@/services/orderService';
import { useState } from 'react';

const Cart = () => {
  const navigate = useNavigate();
  const { state, removeItem, updateQuantity, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigateBack = () => {
    navigate('/');
  };

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
    if (state.items.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Please add items to your cart before submitting an order.",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const orderData = {
        items: state.items,
        total: state.total,
        customerInfo: {
          id: `customer-${Date.now()}`,
          // In a real app, these would come from user input or authentication
          name: 'Anonymous Customer',
          table: 'Table 1'
        }
      };

      const submittedOrder = await submitOrder(orderData);
      
      // Clear the cart after successful submission
      clearCart();
      
      // Show success message with order ID
      toast({
        title: "Order complete!",
        description: `Order ${submittedOrder.orderId} is being reviewed. Someone will contact you soon.`,
        duration: 5000,
      });

      // Navigate back to main page after a short delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
      
    } catch (error) {
      toast({
        title: "Order failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-klaud-dark text-klaud-text">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="icon" className="text-klaud-text" onClick={navigateBack}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        
        <h1 className="text-2xl font-bold tracking-wider">TURBO</h1>
        
        <div className="w-10" />
      </header>

      <div className="container mx-auto px-4 py-6">
        {state.items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-klaud-muted text-lg mb-4">Your cart is empty</p>
            <Button onClick={navigateBack} className="bg-primary hover:bg-primary/90">
              Start Shopping
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              {state.items.map((item) => (
                <Card key={item.id} className="bg-klaud-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <img 
                        src={item.image} 
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                      
                      <div className="flex-1">
                        <h3 className="font-semibold text-klaud-text">{item.name}</h3>
                        {item.type === 'custom' && (
                          <div className="text-sm text-klaud-muted mt-1">
                            <p>Hookah: {item.hookah}</p>
                            <p>Flavors: {item.flavors?.join(', ')}</p>
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

            <Card className="bg-klaud-card border-border">
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
                    {isSubmitting ? 'Submitting Order...' : 'Submit Order'}
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={clearCart}
                    disabled={isSubmitting}
                  >
                    Clear Cart
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cart;
