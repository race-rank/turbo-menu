import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForms } from '@/components/auth/AuthForms';
import { logout } from '@/services/authService';

const Account: React.FC = () => {
  const { user, isAnonymous, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <p className="text-turbo-muted">Loading…</p>
    </div>;
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <Card className="w-full max-w-md mx-auto bg-turbo-card border-border">
        <CardContent className="p-8">
          {isAnonymous || !user ? (
            <>
              <h1 className="text-2xl font-bold mb-2 text-center">Create your account</h1>
              <p className="text-sm text-turbo-muted mb-6 text-center">
                Keep your order history and get offers. Orders you already placed on this
                device come with you.
              </p>
              <AuthForms onDone={() => navigate('/my-orders')} />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2 text-center">
                {user.displayName || user.email}
              </h1>
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
    </div>
  );
};

export default Account;
