import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrderTrackingProvider } from "@/contexts/OrderTrackingContext";
import { TableProvider } from '@/contexts/TableContext';
import { AdminGuard } from "@/components/AdminGuard";
import { OrderStatusTracker } from "@/components/OrderStatusTracker";
import Index from "./pages/Index";
import RedirectPage from "./pages/RedirectPage";

// Index and RedirectPage stay eager: they are the first paint for guests.
// Everything below is off the guest path, so it must not ship in the entry chunk.
const Cart = lazy(() => import("./pages/Cart"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const MenuManagement = lazy(() => import("./pages/MenuManagement"));
const Statistics = lazy(() => import("./pages/Statistics"));
const Account = lazy(() => import("./pages/Account"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <p className="text-lg text-turbo-muted">Loading…</p>
  </div>
);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <TableProvider>
              <OrderTrackingProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Suspense fallback={<RouteFallback />}>
                    <Routes>
                      <Route path="/" element={<RedirectPage />} />
                      <Route path="/cart" element={<Cart />} />
                      <Route path="/hookah-bar-admin" element={<AdminLogin />} />
                      <Route
                        path="/admin"
                        element={
                          <AdminGuard>
                            <Admin />
                          </AdminGuard>
                        }
                      />
                      <Route
                        path="/menu-management"
                        element={
                          <AdminGuard>
                            <MenuManagement />
                          </AdminGuard>
                        }
                      />
                      <Route
                        path="/statistics"
                        element={
                          <AdminGuard>
                            <Statistics />
                          </AdminGuard>
                        }
                      />
                      <Route path="/account" element={<Account />} />
                      <Route path="*" element={<Index />} />
                    </Routes>
                  </Suspense>
                  <OrderStatusTracker />
                </BrowserRouter>
              </OrderTrackingProvider>
            </TableProvider>
          </CartProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;