import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { OrderDetails } from '@/services/orderService';
import { analyticsService } from '@/services/analyticsService';
import { ComprehensiveAnalytics } from '@/types/analytics';
import { Calendar, TrendingUp, DollarSign, Package, AlertCircle } from 'lucide-react';

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
  '#FFC658',
  '#FF7C7C',
  '#A4DE6C',
  '#D084D0',
];

interface AnalyticsDashboardProps {
  orders: OrderDetails[];
  isLoading?: boolean;
}

export const AnalyticsDashboard = ({ orders, isLoading = false }: AnalyticsDashboardProps) => {
  const [analytics, setAnalytics] = useState<ComprehensiveAnalytics | null>(null);
  const [dateRange, setDateRange] = useState<'7days' | '30days' | 'all'>('30days');

  useEffect(() => {
    if (!orders.length) return;

    const now = new Date();
    let startDate = new Date();

    switch (dateRange) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case 'all':
        startDate = new Date(0);
        break;
    }

    const filteredOrders = orders.filter(order => {
      const orderDate = new Date(order.createdAt || 0);
      return orderDate >= startDate && orderDate <= now;
    });

    const data = analyticsService.calculateComprehensiveAnalytics(filteredOrders, startDate, now);
    setAnalytics(data);
  }, [orders, dateRange]);

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  const { orderAnalytics, revenueAnalytics, flavorAnalytics, productAnalytics, timeBasedAnalytics, hookahAnalytics, tobaccoStrengthAnalytics, addOnAnalytics } = analytics;

  // Prepare chart data
  const orderStatusData = [
    { name: 'Completed', value: orderAnalytics.completed, color: '#10b981' },
    { name: 'Pending', value: orderAnalytics.pending, color: '#f59e0b' },
    { name: 'Preparing', value: orderAnalytics.preparing, color: '#8b5cf6' },
    { name: 'Confirmed', value: orderAnalytics.confirmed, color: '#3b82f6' },
    { name: 'Ready', value: orderAnalytics.ready, color: '#06b6d4' },
  ].filter(item => item.value > 0);

  return (
    <div className="w-full space-y-6">
      {/* Header and Date Range Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Detailed insights into orders and revenue metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={dateRange === '7days' ? 'default' : 'outline'}
            onClick={() => setDateRange('7days')}
            className="text-sm"
          >
            7 Days
          </Button>
          <Button
            variant={dateRange === '30days' ? 'default' : 'outline'}
            onClick={() => setDateRange('30days')}
            className="text-sm"
          >
            30 Days
          </Button>
          <Button
            variant={dateRange === 'all' ? 'default' : 'outline'}
            onClick={() => setDateRange('all')}
            className="text-sm"
          >
            All Time
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsService.formatCurrency(revenueAnalytics.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {orderAnalytics.total} total orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Order</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsService.formatCurrency(revenueAnalytics.averageOrderValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              from {orderAnalytics.total} orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderAnalytics.completed}</div>
            <p className="text-xs text-muted-foreground">
              {orderAnalytics.total > 0 ? analyticsService.formatPercentage((orderAnalytics.completed / orderAnalytics.total) * 100) : '0%'} completion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderAnalytics.pending + orderAnalytics.confirmed + orderAnalytics.preparing}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting completion
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="flavors">Flavors</TabsTrigger>
          <TabsTrigger value="addons">Add-ons</TabsTrigger>
          <TabsTrigger value="time">Peak Hours</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Order Status Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Order Status Distribution</CardTitle>
                <CardDescription>Current orders by status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={orderStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {orderStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Daily Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Daily revenue over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.dailyAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      formatter={(value: number) => analyticsService.formatCurrency(value)}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#0088FE" 
                      dot={false}
                      name="Revenue"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Hourly Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Orders by Hour</CardTitle>
              <CardDescription>Order volume and revenue distribution throughout the day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeBasedAnalytics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="hour"
                    label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5 }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      if (name === 'revenue') return [analyticsService.formatCurrency(value), name];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="orders" fill="#8884d8" name="Orders" />
                  <Bar yAxisId="right" dataKey="revenue" fill="#82ca9d" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Products</CardTitle>
              <CardDescription>Best-selling products by revenue</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart 
                  data={analyticsService.getTopProducts(productAnalytics, 10)}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="productName" type="category" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      if (name === 'revenue') return [analyticsService.formatCurrency(value), 'Revenue'];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="quantity" fill="#8884d8" name="Quantity" />
                  <Bar dataKey="revenue" fill="#82ca9d" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {hookahAnalytics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Hookah Preferences</CardTitle>
                <CardDescription>Most popular hookahs by order count and revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hookahAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hookahName" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                    <Tooltip 
                      formatter={(value: number, name: string) => {
                        if (name === 'revenue') return [analyticsService.formatCurrency(value), 'Revenue'];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="count" fill="#8884d8" name="Orders" />
                    <Bar yAxisId="right" dataKey="revenue" fill="#82ca9d" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Flavors Tab */}
        <TabsContent value="flavors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flavor Preferences</CardTitle>
              <CardDescription>Most popular tobacco flavors</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={analyticsService.getTopFlavors(flavorAnalytics, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="flavor" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => value} />
                  <Legend />
                  <Bar dataKey="count" fill="#0088FE" name="Times Selected" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {tobaccoStrengthAnalytics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tobacco Strength Distribution</CardTitle>
                <CardDescription>Customer preference for tobacco strength levels</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={tobaccoStrengthAnalytics}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="strength" />
                    <PolarRadiusAxis />
                    <Radar name="Orders" dataKey="count" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Add-ons Tab */}
        <TabsContent value="addons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add-on Popularity</CardTitle>
              <CardDescription>Premium add-ons usage</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={addOnAnalytics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      if (name === 'percentage') return [analyticsService.formatPercentage(value), 'Percentage'];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="count" fill="#00C49F" name="Usage Count" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Add-ons Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Add-on Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {addOnAnalytics.map((addon) => (
                  <div key={addon.name} className="flex items-center justify-between border-b pb-4 last:border-b-0">
                    <div>
                      <p className="font-medium">{addon.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {addon.count} times selected
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{analyticsService.formatPercentage(addon.percentage)}</p>
                      <div className="w-24 h-2 bg-gray-200 rounded-full mt-1">
                        <div 
                          className="h-full bg-blue-500 rounded-full" 
                          style={{ width: `${addon.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Peak Hours Tab */}
        <TabsContent value="time" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Peak Order Times</CardTitle>
              <CardDescription>When customers place the most orders</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={timeBasedAnalytics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="hour"
                    label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5 }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="orders" 
                    stroke="#8884d8"
                    dot={{ r: 4 }}
                    name="Orders"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
