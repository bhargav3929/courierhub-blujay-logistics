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

const statsCards = [
  {
    title: "Total Shipments",
    value: "1,247",
    change: "+12%",
    icon: Package,
    color: "text-primary"
  },
  {
    title: "Total Revenue",
    value: "₹3,45,678",
    change: "+8%",
    icon: IndianRupee,
    color: "text-primary"
  },
  {
    title: "Active Clients",
    value: "45",
    subtitle: "24 Franchise / 21 Shopify",
    icon: Users,
    color: "text-primary"
  },
  {
    title: "Delivered This Month",
    value: "1,089",
    change: "+15%",
    icon: TrendingUp,
    color: "text-status-delivered"
  }
];

const shipmentTrendData = [
  { day: "Mon", shipments: 145 },
  { day: "Tue", shipments: 178 },
  { day: "Wed", shipments: 156 },
  { day: "Thu", shipments: 189 },
  { day: "Fri", shipments: 201 },
  { day: "Sat", shipments: 167 },
  { day: "Sun", shipments: 211 }
];

const statusData = [
  { name: "Delivered", value: 65, color: "hsl(var(--status-delivered))" },
  { name: "In Transit", value: 25, color: "hsl(var(--status-transit))" },
  { name: "Pending", value: 8, color: "hsl(var(--status-pending))" },
  { name: "Cancelled", value: 2, color: "hsl(var(--status-cancelled))" }
];

const revenueByTypeData = [
  { type: "Franchise", revenue: 210000 },
  { type: "Shopify", revenue: 135678 }
];

const topClients = [
  { name: "Express Logistics Pvt Ltd", type: "Franchise", shipments: 234, revenue: 78430 },
  { name: "FashionHub Store", type: "Shopify", shipments: 189, revenue: 45230 },
  { name: "QuickShip Enterprises", type: "Franchise", shipments: 156, revenue: 52100 },
  { name: "TechGadgets India", type: "Shopify", shipments: 143, revenue: 38950 },
  { name: "Metro Courier Services", type: "Franchise", shipments: 128, revenue: 41200 }
];

const recentShipments = [
  { id: "SHP001", client: "Express Logistics", courier: "DTDC", status: "delivered", amount: 450, date: "25 Nov 2025" },
  { id: "SHP002", client: "FashionHub Store", courier: "Blue Dart", status: "transit", amount: 320, date: "25 Nov 2025" },
  { id: "SHP003", client: "QuickShip", courier: "Delhivery", status: "delivered", amount: 280, date: "24 Nov 2025" },
  { id: "SHP004", client: "TechGadgets", courier: "India Post", status: "pending", amount: 190, date: "24 Nov 2025" },
  { id: "SHP005", client: "Metro Courier", courier: "DTDC", status: "transit", amount: 560, date: "23 Nov 2025" },
  { id: "SHP006", client: "HomeDecor Hub", courier: "Blue Dart", status: "delivered", amount: 410, date: "23 Nov 2025" },
  { id: "SHP007", client: "Fashion Vista", courier: "Ecom Express", status: "cancelled", amount: 230, date: "22 Nov 2025" },
  { id: "SHP008", client: "Express Logistics", courier: "Delhivery", status: "delivered", amount: 380, date: "22 Nov 2025" },
  { id: "SHP009", client: "QuickShip", courier: "DTDC", status: "transit", amount: 295, date: "21 Nov 2025" },
  { id: "SHP010", client: "TechGadgets", courier: "Blue Dart", status: "pending", amount: 175, date: "21 Nov 2025" }
];

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
  return (
    <DashboardLayout>
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
                <LineChart data={shipmentTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
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
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
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
              <BarChart data={revenueByTypeData}>
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
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          client.type === "Franchise" 
                            ? "bg-primary/10 text-primary border border-primary/20" 
                            : "bg-secondary/10 text-secondary border border-secondary/20"
                        }`}>
                          {client.type}
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
                      <td className="p-3 font-mono text-sm font-medium text-primary">{shipment.id}</td>
                      <td className="p-3">{shipment.client}</td>
                      <td className="p-3 font-medium">{shipment.courier}</td>
                      <td className="p-3">{getStatusBadge(shipment.status)}</td>
                      <td className="p-3 text-right font-semibold">₹{shipment.amount}</td>
                      <td className="p-3 text-right text-muted-foreground text-sm">{shipment.date}</td>
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
