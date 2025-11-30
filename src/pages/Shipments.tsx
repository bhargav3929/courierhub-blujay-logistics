import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  Download, 
  Eye, 
  FileText, 
  MapPin,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Calendar
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const shipments = [
  { id: "SHP001", client: "Express Logistics Pvt Ltd", courier: "DTDC", status: "delivered", charged: 450, margin: 45, created: "25 Nov 2025", origin: "Mumbai", dest: "Delhi" },
  { id: "SHP002", client: "FashionHub Store", courier: "Blue Dart", status: "transit", charged: 320, margin: 38, created: "25 Nov 2025", origin: "Bangalore", dest: "Chennai" },
  { id: "SHP003", client: "QuickShip Enterprises", courier: "Delhivery", status: "delivered", charged: 280, margin: 28, created: "24 Nov 2025", origin: "Pune", dest: "Ahmedabad" },
  { id: "SHP004", client: "TechGadgets India", courier: "India Post", status: "pending", charged: 190, margin: 29, created: "24 Nov 2025", origin: "Delhi", dest: "Jaipur" },
  { id: "SHP005", client: "Metro Courier Services", courier: "DTDC", status: "transit", charged: 560, margin: 56, created: "23 Nov 2025", origin: "Kolkata", dest: "Patna" },
  { id: "SHP006", client: "HomeDecor Hub", courier: "Blue Dart", status: "delivered", charged: 410, margin: 49, created: "23 Nov 2025", origin: "Hyderabad", dest: "Vijayawada" },
  { id: "SHP007", client: "Fashion Vista", courier: "Ecom Express", status: "cancelled", charged: 230, margin: 0, created: "22 Nov 2025", origin: "Chennai", dest: "Coimbatore" },
  { id: "SHP008", client: "Express Logistics Pvt Ltd", courier: "Delhivery", status: "delivered", charged: 380, margin: 38, created: "22 Nov 2025", origin: "Mumbai", dest: "Surat" },
  { id: "SHP009", client: "QuickShip Enterprises", courier: "DTDC", status: "transit", charged: 295, margin: 30, created: "21 Nov 2025", origin: "Delhi", dest: "Lucknow" },
  { id: "SHP010", client: "TechGadgets India", courier: "Blue Dart", status: "pending", charged: 175, margin: 26, created: "21 Nov 2025", origin: "Bangalore", dest: "Mysore" },
  { id: "SHP011", client: "BlueExpress Solutions", courier: "India Post", status: "delivered", charged: 340, margin: 34, created: "20 Nov 2025", origin: "Pune", dest: "Nashik" },
  { id: "SHP012", client: "FashionHub Store", courier: "Delhivery", status: "transit", charged: 425, margin: 51, created: "20 Nov 2025", origin: "Mumbai", dest: "Pune" },
  { id: "SHP013", client: "Swift Delivery Hub", courier: "DTDC", status: "delivered", charged: 310, margin: 25, created: "19 Nov 2025", origin: "Delhi", dest: "Chandigarh" },
  { id: "SHP014", client: "Organic Wellness Shop", courier: "Ecom Express", status: "pending", charged: 245, margin: 22, created: "19 Nov 2025", origin: "Bangalore", dest: "Mangalore" },
  { id: "SHP015", client: "Metro Courier Services", courier: "Blue Dart", status: "delivered", charged: 490, margin: 49, created: "18 Nov 2025", origin: "Hyderabad", dest: "Warangal" },
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

const Shipments = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-xl p-6 text-white shadow-lg">
          <h1 className="text-3xl font-bold mb-2">Global Shipments</h1>
          <p className="text-white/80">Track and manage all shipments across your platform</p>
        </div>

        {/* Filters Section */}
        <Card className="bg-blujay-accent/30 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Filter className="h-5 w-5" />
              Filter Shipments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Button variant="outline" className="w-full justify-start text-left font-normal border-primary/30 hover:bg-primary/5">
                  <Calendar className="mr-2 h-4 w-4 text-primary" />
                  <span>Select dates</span>
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Client</label>
                <Select>
                  <SelectTrigger className="border-primary/30 focus:ring-primary">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    <SelectItem value="express">Express Logistics</SelectItem>
                    <SelectItem value="fashion">FashionHub Store</SelectItem>
                    <SelectItem value="quick">QuickShip</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select>
                  <SelectTrigger className="border-primary/30 focus:ring-primary">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="transit">In Transit</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Courier</label>
                <Select>
                  <SelectTrigger className="border-primary/30 focus:ring-primary">
                    <SelectValue placeholder="All couriers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Couriers</SelectItem>
                    <SelectItem value="dtdc">DTDC</SelectItem>
                    <SelectItem value="bluedart">Blue Dart</SelectItem>
                    <SelectItem value="delhivery">Delhivery</SelectItem>
                    <SelectItem value="india">India Post</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                  <Input placeholder="Search shipments..." className="pl-10 border-primary/30 focus-visible:ring-primary" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <Button className="bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary">
                Apply Filters
              </Button>
              <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/5">
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Shipments Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Shipments ({shipments.length})</CardTitle>
              <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/5">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-primary/5">
                    <th className="text-left p-3 font-semibold text-sm text-primary">Shipment ID</th>
                    <th className="text-left p-3 font-semibold text-sm text-primary">Client</th>
                    <th className="text-left p-3 font-semibold text-sm text-primary">Route</th>
                    <th className="text-left p-3 font-semibold text-sm text-primary">Courier</th>
                    <th className="text-left p-3 font-semibold text-sm text-primary">Status</th>
                    <th className="text-right p-3 font-semibold text-sm text-primary">Charged</th>
                    <th className="text-right p-3 font-semibold text-sm text-primary">Margin</th>
                    <th className="text-right p-3 font-semibold text-sm text-primary">Created</th>
                    <th className="text-center p-3 font-semibold text-sm text-primary">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-sm font-medium text-primary">{shipment.id}</td>
                      <td className="p-3 font-medium">{shipment.client}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{shipment.origin} → {shipment.dest}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="font-medium">{shipment.courier}</Badge>
                      </td>
                      <td className="p-3">{getStatusBadge(shipment.status)}</td>
                      <td className="p-3 text-right font-semibold">₹{shipment.charged}</td>
                      <td className="p-3 text-right font-semibold text-primary">₹{shipment.margin}</td>
                      <td className="p-3 text-right text-sm text-muted-foreground">{shipment.created}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary hover:bg-primary/10" title="View Details">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary hover:bg-primary/10" title="Download Label">
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary hover:bg-primary/10" title="Track">
                            <MapPin className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">Showing 1 to {shipments.length} of {shipments.length} results</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>Previous</Button>
                <Button size="sm" className="bg-primary text-white">1</Button>
                <Button variant="outline" size="sm">2</Button>
                <Button variant="outline" size="sm">3</Button>
                <Button variant="outline" size="sm">Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Shipments;
