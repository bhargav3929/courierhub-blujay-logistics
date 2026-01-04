import { useState, useEffect } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Settings, AlertCircle, CheckCircle2, CloudLightning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getAllCouriers, toggleCourierStatus, updateLastSync } from "@/services/courierService";
import { CourierAPI } from "@/types/types";
import { Timestamp } from "firebase/firestore";

const Couriers = () => {
  const [loading, setLoading] = useState(true);
  const [couriers, setCouriers] = useState<CourierAPI[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Default color mapping
  const getCourierColor = (name: string) => {
    const colors: Record<string, string> = {
      dtdc: "bg-red-500",
      bluedart: "bg-blue-600",
      delhivery: "bg-orange-500",
      indiapost: "bg-red-700",
      ecomexpress: "bg-purple-600",
      shadowfax: "bg-yellow-500",
    };
    return colors[name.toLowerCase()] || "bg-gray-500";
  };

  // Hardcoded list of all supported couriers to display even if not yet configured
  const supportedCouriers = [
    { name: "dtdc", displayName: "DTDC" },
    { name: "bluedart", displayName: "Blue Dart" },
    { name: "delhivery", displayName: "Delhivery" },
    { name: "indiapost", displayName: "India Post" },
    { name: "ecomexpress", displayName: "Ecom Express" },
    { name: "shadowfax", displayName: "Shadowfax" }
  ];

  useEffect(() => {
    fetchCouriers();
  }, []);

  const fetchCouriers = async () => {
    try {
      setLoading(true);
      const data = await getAllCouriers();
      setCouriers(data);
    } catch (error) {
      console.error("Error fetching couriers:", error);
      toast.error("Failed to load courier statuses");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      await toggleCourierStatus(id, newStatus as "active" | "inactive");

      setCouriers(prev => prev.map(c =>
        c.id === id ? { ...c, status: newStatus as "active" | "inactive" } : c
      ));

      toast.success(`Courier ${newStatus === "active" ? "activated" : "deactivated"}`);
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleSync = async (id: string) => {
    try {
      setSyncing(id);
      // Simulate API sync delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      await updateLastSync(id);

      setCouriers(prev => prev.map(c =>
        c.id === id ? { ...c, lastSync: Timestamp.now() } : c
      ));

      toast.success("Courier synced successfully");
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  const getCourierConfig = (name: string) => {
    return couriers.find(c => c.name === name);
  };

  const CourierCard = ({ name, displayName }: { name: string, displayName: string }) => {
    const config = getCourierConfig(name);
    const isConnected = config?.isConnected || false;
    const isActive = config?.status === "active";
    const lastSync = config?.lastSync ? config.lastSync.toDate().toLocaleString() : "Never";

    return (
      <Card className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${isActive ? 'border-primary/20' : 'border-border'}`}>
        <div className={`h-2 w-full ${getCourierColor(name)}`} />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl font-bold">{displayName}</CardTitle>
            <Badge variant="outline" className={
              isConnected
                ? "bg-green-100 text-green-700 border-green-200"
                : "bg-gray-100 text-gray-700 border-gray-200"
            }>
              {isConnected ? "Connected" : "Not Configured"}
            </Badge>
          </div>
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <CloudLightning className={`h-4 w-4 ${isConnected ? "text-primary" : "text-muted-foreground"}`} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                {isActive ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-gray-400" />
                )}
                <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  {isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {config && (
              <Switch
                checked={isActive}
                onCheckedChange={() => handleToggleStatus(config.id, config.status)}
                className="data-[state=checked]:bg-primary"
                disabled={!isConnected}
              />
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last Synced</span>
              <span className="font-mono text-xs">{lastSync}</span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/30"
                onClick={() => config && handleSync(config.id)}
                disabled={!isConnected || syncing === config?.id}
              >
                <RefreshCw className={`h-3 w-3 mr-2 ${syncing === config?.id ? "animate-spin" : ""}`} />
                {syncing === config?.id ? "Syncing..." : "Sync Now"}
              </Button>
              <Button variant="ghost" size="sm" className="px-3" asChild>
                <a href="/settings">
                  <Settings className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-xl p-6 text-white shadow-lg">
          <h1 className="text-3xl font-bold mb-2">Courier Integrations</h1>
          <p className="text-white/80">Manage your shipping partners and API connections</p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600">Active Couriers</p>
                  <h3 className="text-2xl font-bold text-green-700">
                    {couriers.filter(c => c.status === "active").length} / {supportedCouriers.length}
                  </h3>
                </div>
                <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">Total APIs Connected</p>
                  <h3 className="text-2xl font-bold text-blue-700">
                    {couriers.filter(c => c.isConnected).length}
                  </h3>
                </div>
                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <CloudLightning className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-50 to-slate-50 border-gray-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">System Status</p>
                  <h3 className="text-xl font-bold text-gray-700">Operational</h3>
                </div>
                <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <Settings className="h-6 w-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Courier Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {supportedCouriers.map((courier) => (
            <CourierCard key={courier.name} {...courier} />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Couriers;
