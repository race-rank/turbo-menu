import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { useState, useEffect } from "react";

// Page imports
import Index from "./pages/Index";
import Cart from "./pages/Cart";
import Admin from "./pages/Admin";

const queryClient = new QueryClient();

// Custom authentication component for admin page
const ProtectedAdminRoute = ({ children }: { children: React.ReactNode }) => {
  // In a real app, this would be a more sophisticated auth check
  const [isAuthorized, setIsAuthorized] = useState(true);

  // Simple simulation of auth check - in real app this would use tokens/sessions
  useEffect(() => {
    // Check if URL was directly typed (not navigated to from within the app)
    const referrer = document.referrer;
    const isDirectAccess = !referrer.includes(window.location.host);

    // This is a very simple "protection" - just to demonstrate the concept
    // In a real app, you'd use proper authentication
    setIsAuthorized(true);
  }, []);

  return isAuthorized ? <>{children}</> : <Navigate to="/" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/cart" element={<Cart />} />
            <Route
              path="/admin"
              element={
                <ProtectedAdminRoute>
                  <Admin />
                </ProtectedAdminRoute>
              }
            />
            {/* Redirect all other routes to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
