import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { getAdminNotifications } from '@/services/orderService';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';

const getDefaultRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start, end };
};

const Statistics = () => {
  const [{ start, end }, setRange] = useState(getDefaultRange());
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchNotifications = async () => {
      setLoading(true);
      try {
        const { notifications } = await getAdminNotifications();
        setNotifications(notifications);
      } catch (e) {
        setNotifications([]);
      }
      setLoading(false);
    };
    fetchNotifications();
  }, []);

  // Filter notifications for new orders in selected date range
  const filtered = notifications.filter(n => 
    n.type === 'new_order' &&
    n.createdAt &&
    new Date(n.createdAt) >= start &&
    new Date(n.createdAt) <= end
  );

  // Orders per day
  const days = eachDayOfInterval({ start, end });
  const ordersPerDay = days.map(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return {
      date: format(day, 'MMM d'),
      count: filtered.filter(n => format(new Date(n.createdAt), 'yyyy-MM-dd') === dayStr).length,
    };
  });

  // Flavors usage: If flavor info is not in notification, skip or fetch order details if needed.
  // For now, this will be empty unless you extend notifications to include flavor info.
  const flavorCount: Record<string, number> = {};
  // Optionally, fetch order details here if you want flavor stats.

  const topFlavors = Object.entries(flavorCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Average order price (parse from notification message if possible)
  const totals: number[] = filtered.map(n => {
    // Try to extract price from message, e.g. "Order from table ... - 120 Lei"
    const match = n.message?.match(/(\d+(\.\d+)?)\s*Lei/);
    return match ? parseFloat(match[1]) : 0;
  }).filter(x => x > 0);

  const avgOrderPrice = totals.length
    ? (totals.reduce((sum, v) => sum + v, 0) / totals.length).toFixed(2)
    : '0.00';

  return (
    <div className="min-h-screen bg-turbo-dark text-turbo-text">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <NavigationSidebar />
        <h1 className="text-2xl font-bold tracking-wider">STATISTICS</h1>
        <div className="w-10" />
      </header>
      <div className="container mx-auto px-4 py-6 space-y-8">
        <Card>
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
            <div>
              <label className="block text-sm mb-1">Start Date</label>
              <Input
                type="date"
                value={format(start, 'yyyy-MM-dd')}
                onChange={e => setRange(r => ({ ...r, start: new Date(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">End Date</label>
              <Input
                type="date"
                value={format(end, 'yyyy-MM-dd')}
                onChange={e => setRange(r => ({ ...r, end: new Date(e.target.value) }))}
              />
            </div>
            <Button onClick={() => setRange(getDefaultRange())}>Reset</Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card>
            <CardContent className="p-4">
              <h2 className="font-semibold mb-2">Orders per Day</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ordersPerDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#fbbf24">
                    <LabelList dataKey="count" position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h2 className="font-semibold mb-2">Most Used Flavors</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topFlavors}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#38bdf8">
                    <LabelList dataKey="count" position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {topFlavors.length === 0 && (
                <div className="text-xs text-turbo-muted mt-2">Flavor stats unavailable from notifications.</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center h-full">
              <h2 className="font-semibold mb-2">Average Order Price</h2>
              <div className="text-4xl font-bold text-amber-400">{avgOrderPrice} Lei</div>
              <div className="text-xs text-turbo-muted mt-2">{filtered.length} orders</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
