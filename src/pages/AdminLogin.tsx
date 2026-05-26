import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const AdminLogin: React.FC = () => {
  const [userInput, setUserInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, loggedIn, hasAdminRights } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loggedIn && hasAdminRights) {
      navigate('/admin', { replace: true });
    }
  }, [loggedIn, hasAdminRights, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(userInput, passInput);
    setSubmitting(false);
    if (ok) {
      toast.success('Access granted!');
      navigate('/admin', { replace: true });
    } else {
      toast.error('Access denied - check credentials');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <h1 className="text-2xl font-bold mb-6 text-center">Hookah Bar Admin</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user">Username</Label>
              <Input
                id="user"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass">Password</Label>
              <Input
                id="pass"
                type="password"
                value={passInput}
                onChange={(e) => setPassInput(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
