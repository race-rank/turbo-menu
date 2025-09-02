import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrderTrackingProvider } from "@/contexts/OrderTrackingContext";
import { AdminGuard } from "@/components/AdminGuard";
import { OrderStatusTracker } from "@/components/OrderStatusTracker";
import Index from "./pages/Index";
import Cart from "./pages/Cart";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <OrderTrackingProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route 
                    path="/admin" 
                    element={
                      <AdminGuard>
                        <Admin />
                      </AdminGuard>
                    } 
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <OrderStatusTracker />
              </BrowserRouter>
            </OrderTrackingProvider>
          </CartProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;