import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Home, ShoppingCart, Settings, LogOut, Utensils, Star, BarChart2 } from 'lucide-react';
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
              
              {loggedIn && hasAdminRights && (
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
              
              {(!loggedIn || !hasAdminRights) && (
                <Button
                  variant="ghost"
                  onClick={handleAdminClick}
                  className="w-full justify-start gap-3 px-3 py-2 h-auto text-sm font-medium"
                >
                  <Settings className="h-4 w-4" />
                  Admin Panel
                </Button>
              )}
              
              <a
                href="https://www.google.com/search?sca_esv=a420dcef264fc5ad&tbm=lcl&sxsrf=AE3TifPiQBSvRxmNeGro4O_nsZzQcPG1XA:1760021518520&q=Hookah+Tabacu+Recenzii&rflfq=1&num=20&stick=H4sIAAAAAAAAAONgkxIxNDMxtDC2NDAwMTczszQyMLQ0MtrAyPiKUcwjPz87MUMhJDEpMblUISg1OTWvKjNzESsOCQCs8uH2TQAAAA&rldimm=16418390047669201922&hl=ro-RO&sa=X&ved=2ahUKEwiK9qGLr5eQAxWL87sIHQK3KIIQ9fQKegQIVBAF&biw=2056&bih=1290&dpr=2#lkt=LocalPoiReviews"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Star className="h-4 w-4" />
                Google Reviews
              </a>
              <a
                href="https://www.tripadvisor.com/Restaurant_Review-g298474-d26352926-Reviews-Hookah_Tabacu-Cluj_Napoca_Cluj_County_Northwest_Romania_Transylvania.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Star className="h-4 w-4" />
                Trip Advisor
              </a>
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