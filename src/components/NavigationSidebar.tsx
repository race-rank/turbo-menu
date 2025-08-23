import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Home, ShoppingCart, Settings, LogOut } from 'lucide-react';
import { useAuth } from "@/contexts/AuthContext";
import { LoginDialog } from "./LoginDialog";
import { cn } from "@/lib/utils";

export const NavigationSidebar = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { loggedIn, hasAdminRights, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleAdminClick = () => {
    if (!loggedIn || !hasAdminRights) {
      setLoginOpen(true);
    }
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    setSidebarOpen(false);
  };

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/cart', label: 'Cart', icon: ShoppingCart },
  ];

  return (
    <>
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="relative m-4 z-40">
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <div className="flex flex-col h-full">
            <div className="mb-8">
              <h2 className="text-2xl font-bold">Turbo Menu</h2>
            </div>
            
            <nav className="flex-1 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    location.pathname === item.path
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
              
              {loggedIn && hasAdminRights ? (
                <Link
                  to="/admin"
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    location.pathname === "/admin"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Settings className="h-4 w-4" />
                  Admin Panel
                </Link>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleAdminClick}
                  className="w-full justify-start gap-3 px-3 py-2 h-auto text-sm font-medium"
                >
                  <Settings className="h-4 w-4" />
                  Admin Panel
                </Button>
              )}
            </nav>
            
            {loggedIn && (
              <div className="mt-auto pt-4 border-t">
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-start gap-3 px-3 py-2 h-auto text-sm font-medium"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
};