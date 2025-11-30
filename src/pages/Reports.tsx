import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Download, 
  FileText, 
  TrendingUp,
  Package,
  IndianRupee,
  Users,
  BarChart3
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";

const revenueData = [
  { month: "Jan", revenue: 245000 },
  { month: "Feb", revenue: 289000 },
  { month: "Mar", revenue: 312000 },
  { month: "Apr", revenue: 298000 },
  { month: "May", revenue: 335000 },
  { month: "Jun", revenue: 345678 }
];

const clientData = [
  { month: "Jan", clients: 38 },
  { month: "Feb", clients: 40 },
  { month: "Mar", clients: 41 },
  { month: "Apr", clients: 43 },
  { month: "May", clients: 44 },
  { month: "Jun", clients: 45 }
];

const topPerformers = [
  { name: "Express Logistics Pvt Ltd", type: "Franchise", shipments: 1245, revenue: 187650, growth: "+18%" },
  { name: "FashionHub Store", type: "Shopify", shipments: 982, revenue: 147300, growth: "+24%" },
  { name: "QuickShip Enterprises", type: "Franchise", shipments: 876, revenue: 131400, growth: "+15%" },
  { name: "TechGadgets India", type: "Shopify", shipments: 745, revenue: 111750, growth: "+31%" },
  { name: "Metro Courier Services", type: "Franchise", shipments: 698, revenue: 104700, growth: "+12%" }
];

const Reports = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-xl p-6 text-white shadow-lg">
          <h1 className="text-3xl font-bold mb-2">Reports & Analytics</h1>
          <p className="text-white/80">Comprehensive insights into your shipping operations</p>
        </div>

        {/* Date Range and Export Section */}
        <Card className="bg-blujay-accent/30 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="outline" className="border-primary/30 hover:bg-primary/5">
                <Calendar className="h-4 w-4 mr-2 text-primary" />
                Select Date Range
              </Button>
              
              <div className="flex gap-3 ml-auto">
                <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/5">
                  <FileText className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button className="bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary">
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Shipments Processed
              </CardTitle>
              <Package className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">7,562</div>
              <p className="text-xs text-status-delivered font-medium mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                +22% from last period
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue Generated
              </CardTitle>
              <IndianRupee className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">₹18,94,428</div>
              <p className="text-xs text-status-delivered font-medium mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                +28% from last period
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average Shipment Value
              </CardTitle>
              <BarChart3 className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">₹250.63</div>
              <p className="text-xs text-muted-foreground mt-1">
                Per shipment average
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Client Acquisition
              </CardTitle>
              <Users className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">7</div>
              <p className="text-xs text-status-delivered font-medium mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                New clients this period
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                    formatter={(value) => [`₹${value.toLocaleString()}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Client Growth Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Client Growth Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={clientData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
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
                    dataKey="clients" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: "hsl(var(--primary))", r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Performers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-primary/5">
                    <th className="text-left p-3 font-semibold text-sm text-primary">Rank</th>
                    <th className="text-left p-3 font-semibold text-sm text-primary">Client Name</th>
                    <th className="text-left p-3 font-semibold text-sm text-primary">Type</th>
                    <th className="text-right p-3 font-semibold text-sm text-primary">Total Shipments</th>
                    <th className="text-right p-3 font-semibold text-sm text-primary">Revenue Generated</th>
                    <th className="text-right p-3 font-semibold text-sm text-primary">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {topPerformers.map((client, index) => (
                    <tr key={index} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold ${
                          index === 0 ? "bg-amber-500 text-white" :
                          index === 1 ? "bg-gray-400 text-white" :
                          index === 2 ? "bg-orange-600 text-white" :
                          "bg-primary/10 text-primary"
                        }`}>
                          {index + 1}
                        </div>
                      </td>
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
                      <td className="p-3 text-right font-semibold">{client.shipments.toLocaleString()}</td>
                      <td className="p-3 text-right font-semibold text-primary">₹{client.revenue.toLocaleString()}</td>
                      <td className="p-3 text-right font-semibold text-status-delivered">{client.growth}</td>
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

export default Reports;
