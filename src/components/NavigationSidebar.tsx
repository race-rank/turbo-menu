import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Home, ShoppingCart, Settings, LogOut, LogIn, Utensils, Star, BarChart2, Receipt, UserCircle } from 'lucide-react';
import { useAuth } from "@/contexts/AuthContext";
import { logout } from "@/services/authService";
import { cn } from "@/lib/utils";
import { performRedirect } from "@/utils/redirects";

export const NavigationSidebar = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAdmin, isAnonymous } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setSidebarOpen(false);
  };

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/cart', label: 'Cart', icon: ShoppingCart },
    { path: '/my-orders', label: 'My orders', icon: Receipt },
    // Account deliberately absent: it lives in the footer next to Sign Out,
    // where people look for it, rather than in the middle of the nav list.
  ];

  const footerItemClass = (path: string) => cn(
    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
    location.pathname === path
      ? "bg-primary text-primary-foreground"
      : "hover:bg-accent hover:text-accent-foreground",
  );

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
              
              {isAdmin && (
                <>
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
                  <Link
                    to="/menu-management"
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      location.pathname === "/menu-management"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Utensils className="h-4 w-4" />
                    Menu Management
                  </Link>
                  <Link
                    to="/statistics"
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      location.pathname === "/statistics"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <BarChart2 className="h-4 w-4" />
                    Statistics
                  </Link>
                </>
              )}
              
              <button
                onClick={() => performRedirect('google-reviews')}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground w-full text-left"
              >
                <Star className="h-4 w-4" />
                Google Reviews
              </button>
              <button
                onClick={() => performRedirect('tripadvisor')}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground w-full text-left"
              >
                <Star className="h-4 w-4" />
                Trip Advisor
              </button>
            </nav>
            
            <div className="mt-auto pt-4 border-t space-y-1">
              {user && !isAnonymous ? (
                <>
                  <Link
                    to="/account"
                    onClick={() => setSidebarOpen(false)}
                    className={footerItemClass('/account')}
                  >
                    <UserCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {user.displayName || user.email || 'Profile'}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={handleLogout}
                    className="w-full justify-start gap-3 px-3 py-2 h-auto text-sm font-medium"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </>
              ) : (
                // Anonymous visitors are signed in as far as Firebase is
                // concerned, so this keys off isAnonymous rather than !user.
                <Link
                  to="/account"
                  onClick={() => setSidebarOpen(false)}
                  className={footerItemClass('/account')}
                >
                  <LogIn className="h-4 w-4 shrink-0" />
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      
    </>
  );
};