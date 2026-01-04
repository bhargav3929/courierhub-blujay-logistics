import { useState, useEffect } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  IndianRupee,
  Users,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle
} from "lucide-react";
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
  ResponsiveContainer
} from "recharts";
import { getDashboardMetrics, getShipmentTrend, getTopClients } from "@/services/metricsService";
import { getRecentShipments } from "@/services/shipmentService";
import { DashboardMetrics, ShipmentTrend, TopClient, Shipment } from "@/types/types";
import { toast } from "sonner";
import SEO from "@/components/SEO";

const getStatusBadge = (status: string) => {
  const badges = {
    delivered: { icon: CheckCircle, label: "Delivered", className: "bg-status-delivered/10 text-status-delivered border-status-delivered/20" },
    transit: { icon: Clock, label: "In Transit", className: "bg-status-transit/10 text-status-transit border-status-transit/20" },
    pending: { icon: AlertCircle, label: "Pending", className: "bg-status-pending/10 text-status-pending border-status-pending/20" },
    cancelled: { icon: XCircle, label: "Cancelled", className: "bg-status-cancelled/10 text-status-cancelled border-status-cancelled/20" }
  };

  const badge = badges[status as keyof typeof badges];
  const Icon = badge.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.className}`}>
      <Icon className="h-3 w-3" />
      {badge.label}
    </span>
  );
};

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [shipmentTrend, setShipmentTrend] = useState<ShipmentTrend[]>([]);
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [revenueByType, setRevenueByType] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        // Fetch all dashboard data in parallel
        // NOTE: getDashboardMetrics now returns revenueByType and shipmentsByStatus internally
        // so we don't need to fetch them separately.
        const [
          metricsData,
          trendData,
          topClientsData,
          recentShipmentsData
        ] = await Promise.all([
          getDashboardMetrics(),
          getShipmentTrend(7),
          getTopClients(5),
          getRecentShipments(10)
        ]);

        setMetrics(metricsData);
        setShipmentTrend(trendData);
        setTopClients(topClientsData);
        setRecentShipments(recentShipmentsData);

        // Format revenue data for chart from metricsData
        setRevenueByType([
          { type: "Franchise", revenue: metricsData.revenueByType.franchise },
          { type: "Shopify", revenue: metricsData.revenueByType.shopify }
        ]);

        // Format status data for pie chart from metricsData
        setStatusData([
          { name: "Delivered", value: metricsData.shipmentsByStatus.delivered, color: "hsl(var(--status-delivered))" },
          { name: "In Transit", value: metricsData.shipmentsByStatus.transit, color: "hsl(var(--status-transit))" },
          { name: "Pending", value: metricsData.shipmentsByStatus.pending, color: "hsl(var(--status-pending))" },
          { name: "Cancelled", value: metricsData.shipmentsByStatus.cancelled, color: "hsl(var(--status-cancelled))" }
        ]);

      } catch (error: any) {
        console.error("Error fetching dashboard data:", error);
        toast.error("Failed to load dashboard data. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const statsCards = [
    {
      title: "Total Shipments",
      value: metrics?.totalShipments.toLocaleString() || "0",
      change: "+12%",
      icon: Package,
      color: "text-primary"
    },
    {
      title: "Total Revenue",
      value: `₹${metrics?.totalRevenue.toLocaleString() || "0"}`,
      change: "+8%",
      icon: IndianRupee,
      color: "text-primary"
    },
    {
      title: "Active Clients",
      value: metrics?.activeClients.toString() || "0",
      subtitle: `${metrics?.franchiseClients || 0} Franchise / ${metrics?.shopifyClients || 0} Shopify`,
      icon: Users,
      color: "text-primary"
    },
    {
      title: "Delivered This Month",
      value: metrics?.deliveredThisMonth.toLocaleString() || "0",
      change: `${metrics?.deliveredPercentage || 0}%`,
      icon: TrendingUp,
      color: "text-status-delivered"
    }
  ];

  return (
    <DashboardLayout>
      <SEO title="Admin Dashboard" description="Overview of Shipments, Revenue, and Client Activity." />
      <div className="space-y-6">
        {/* Page Header */}
        <div className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-xl p-6 text-white shadow-lg">
          <h1 className="text-3xl font-bold mb-2">Dashboard Overview</h1>
          <p className="text-white/80">Welcome back! Here's what's happening with your shipping operations today.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map((stat, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                {stat.change && (
                  <p className="text-xs text-status-delivered font-medium mt-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {stat.change} from last month
                  </p>
                )}
                {stat.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Shipments Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Shipments Trend (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={shipmentTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="shipments"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    fill="url(#colorShipments)"
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                  />
                  <defs>
                    <linearGradient id="colorShipments" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Shipment Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Revenue by Client Type */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Client Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueByType}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="type" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Clients Table */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Clients by Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-semibold text-sm">Client Name</th>
                    <th className="text-left p-3 font-semibold text-sm">Type</th>
                    <th className="text-right p-3 font-semibold text-sm">Shipments</th>
                    <th className="text-right p-3 font-semibold text-sm">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((client, index) => (
                    <tr key={index} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{client.name}</td>
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${client.type === "franchise"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-secondary/10 text-secondary border border-secondary/20"
                          }`}>
                          {client.type === "franchise" ? "Franchise" : "Shopify"}
                        </span>
                      </td>
                      <td className="p-3 text-right font-semibold">{client.shipments}</td>
                      <td className="p-3 text-right font-semibold text-primary">₹{client.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Shipments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Shipments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-semibold text-sm">Shipment ID</th>
                    <th className="text-left p-3 font-semibold text-sm">Client</th>
                    <th className="text-left p-3 font-semibold text-sm">Courier</th>
                    <th className="text-left p-3 font-semibold text-sm">Status</th>
                    <th className="text-right p-3 font-semibold text-sm">Amount</th>
                    <th className="text-right p-3 font-semibold text-sm">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentShipments.map((shipment) => (
                    <tr key={shipment.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-sm font-medium text-primary">{shipment.id.substring(0, 8)}</td>
                      <td className="p-3">{shipment.clientName}</td>
                      <td className="p-3 font-medium">{shipment.courier}</td>
                      <td className="p-3">{getStatusBadge(shipment.status)}</td>
                      <td className="p-3 text-right font-semibold">₹{shipment.chargedAmount}</td>
                      <td className="p-3 text-right text-muted-foreground text-sm">
                        {shipment.createdAt.toDate().toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
