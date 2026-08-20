import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForms } from '@/components/auth/AuthForms';
import { logout } from '@/services/authService';

const Account: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();

  return (
    // pb-24 clears the OrderStatusTracker, which App.tsx pins to the bottom of
    // every page while an order is live.
    <div className="min-h-screen pb-24">
      {/* Outside the loading branch on purpose: an early return here used to
          take the navigation menu with it while auth resolved. */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <NavigationSidebar />
        <h1 className="text-2xl font-bold tracking-wider">ACCOUNT</h1>
        {/* Balances the menu button so the title stays centred. */}
        <div className="w-10" />
      </header>

      <div className="px-4 py-10">
        {loading ? (
          <p className="text-turbo-muted text-center">Loading…</p>
        ) : (
          <Card className="w-full max-w-md mx-auto bg-turbo-card border-border">
            <CardContent className="p-8">
              {isAnonymous || !user ? (
                <>
                  <h2 className="text-2xl font-bold mb-2 text-center">Create your account</h2>
                  <p className="text-sm text-turbo-muted mb-6 text-center">
                    Keep your order history and get offers. Orders you already placed on this
                    device come with you.
                  </p>
                  <AuthForms onDone={() => navigate('/my-orders')} />
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold mb-2 text-center">
                    {user.displayName || user.email}
                  </h2>
                  <p className="text-sm text-turbo-muted mb-6 text-center">{user.email}</p>
                  <Button className="w-full mb-3" onClick={() => navigate('/my-orders')}>
                    My orders
                  </Button>
                  <Button variant="outline" className="w-full"
                    onClick={async () => { await logout(); navigate('/'); }}>
                    Sign out
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Account;
