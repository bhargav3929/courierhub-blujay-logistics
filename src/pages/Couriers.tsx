import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Settings, CheckCircle, Clock } from "lucide-react";

const couriers = [
  {
    id: 1,
    name: "DTDC",
    status: "active",
    connected: true,
    lastSync: "2 minutes ago",
    color: "bg-red-500"
  },
  {
    id: 2,
    name: "Blue Dart",
    status: "active",
    connected: true,
    lastSync: "5 minutes ago",
    color: "bg-blue-500"
  },
  {
    id: 3,
    name: "Delhivery",
    status: "active",
    connected: true,
    lastSync: "1 hour ago",
    color: "bg-orange-500"
  },
  {
    id: 4,
    name: "India Post",
    status: "active",
    connected: true,
    lastSync: "30 minutes ago",
    color: "bg-green-600"
  },
  {
    id: 5,
    name: "Ecom Express",
    status: "inactive",
    connected: true,
    lastSync: "2 days ago",
    color: "bg-purple-500"
  },
  {
    id: 6,
    name: "Shadowfax",
    status: "active",
    connected: true,
    lastSync: "15 minutes ago",
    color: "bg-gray-700"
  }
];

const Couriers = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-xl p-6 text-white shadow-lg flex-1 mr-4">
            <h1 className="text-3xl font-bold mb-2">Courier Settings</h1>
            <p className="text-white/80">Manage and configure your courier service providers</p>
          </div>
          
          <Button className="bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary shadow-lg">
            <Plus className="h-4 w-4 mr-2" />
            Add Courier
          </Button>
        </div>

        {/* Courier Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {couriers.map((courier) => (
            <Card key={courier.id} className="hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 ${courier.color} rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md`}>
                      {courier.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{courier.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <CheckCircle className="h-3 w-3 text-status-delivered" />
                        <span className="text-status-delivered font-medium">Connected</span>
                      </CardDescription>
                    </div>
                  </div>
                  <Switch 
                    checked={courier.status === "active"} 
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Status</span>
                  {courier.status === "active" ? (
                    <Badge className="bg-status-delivered/10 text-status-delivered border-status-delivered/20">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between py-2 px-3 bg-primary/5 rounded-lg border border-primary/10">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-primary" />
                    <span>Last Sync</span>
                  </div>
                  <span className="text-sm font-medium text-primary">{courier.lastSync}</span>
                </div>

                <Button 
                  variant="outline" 
                  className="w-full border-primary/30 text-primary hover:bg-primary/5"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configure
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Configuration Info Card */}
        <Card className="border-primary/20 bg-gradient-to-br from-blujay-accent/30 to-transparent">
          <CardHeader>
            <CardTitle className="text-primary">Courier Configuration</CardTitle>
            <CardDescription>
              Manage API credentials, rate cards, and service settings for each courier partner
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-primary/10">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-foreground">API Integration</p>
                <p className="text-sm text-muted-foreground">All couriers are integrated via REST APIs for real-time tracking and rate calculation</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-primary/10">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Automatic Sync</p>
                <p className="text-sm text-muted-foreground">Shipment status and tracking information syncs automatically every 5 minutes</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-primary/10">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Rate Management</p>
                <p className="text-sm text-muted-foreground">Dynamic rate cards updated daily based on courier partner agreements</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Couriers;
