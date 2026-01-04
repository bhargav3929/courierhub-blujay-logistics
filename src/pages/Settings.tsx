import { useState, useEffect } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, User, Bell, Shield, Database, Key } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getAllCouriers, updateCourierAPI, addCourierAPI } from "@/services/courierService";
import { useAuth } from "@/contexts/AuthContext";
import { CourierAPI } from "@/types/types";

const Settings = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [courierConfigs, setCourierConfigs] = useState<CourierAPI[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  // Hardcoded list of supported couriers to ensure we have fields for them
  const supportedCouriers = [
    { name: "dtdc", displayName: "DTDC" },
    { name: "bluedart", displayName: "Blue Dart" },
    { name: "delhivery", displayName: "Delhivery" },
    { name: "indiapost", displayName: "India Post" },
    { name: "ecomexpress", displayName: "Ecom Express" },
    { name: "shadowfax", displayName: "Shadowfax" }
  ];

  useEffect(() => {
    fetchCourierConfigs();
  }, []);

  const fetchCourierConfigs = async () => {
    try {
      setLoading(true);
      const configs = await getAllCouriers();
      setCourierConfigs(configs);
    } catch (error) {
      console.error("Error fetching courier configs:", error);
      toast.error("Failed to load courier configurations");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateApiKey = async (courierName: string, apiKey: string, apiSecret: string) => {
    try {
      setSaving(courierName);

      const existingConfig = courierConfigs.find(c => c.name === courierName);

      if (existingConfig) {
        await updateCourierAPI(existingConfig.id, {
          apiKey,
          apiSecret,
          isConnected: !!(apiKey && apiSecret),
          status: (apiKey && apiSecret) ? "active" : "inactive"
        });
      } else {
        const courierInfo = supportedCouriers.find(c => c.name === courierName);
        await addCourierAPI({
          name: courierName,
          displayName: courierInfo?.displayName || courierName,
          status: (apiKey && apiSecret) ? "active" : "inactive",
          isConnected: !!(apiKey && apiSecret),
          apiKey,
          apiSecret
        });
      }

      toast.success(`${courierName.toUpperCase()} configuration saved`);
      await fetchCourierConfigs();
    } catch (error) {
      console.error("Error saving API configuration:", error);
      toast.error("Failed to save configuration");
    } finally {
      setSaving(null);
    }
  };

  const getCourierConfig = (name: string) => {
    return courierConfigs.find(c => c.name === name);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-xl p-6 text-white shadow-lg">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-white/80">Manage your account and platform preferences</p>
        </div>

        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile Settings
            </CardTitle>
            <CardDescription>Update your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full-name">Full Name</Label>
                <Input id="full-name" defaultValue={currentUser?.name || "Admin"} className="focus-visible:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-setting">Email</Label>
                <Input id="email-setting" type="email" defaultValue={currentUser?.email || ""} disabled className="bg-muted" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone-setting">Phone</Label>
                <Input id="phone-setting" defaultValue={currentUser?.phone || ""} className="focus-visible:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" defaultValue={currentUser?.role || "Admin"} disabled className="bg-muted" />
              </div>
            </div>
            <Separator className="my-4" />
            <Button className="bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary">
              Save Profile Changes
            </Button>
          </CardContent>
        </Card>

        {/* Courier API Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Courier API Configuration
            </CardTitle>
            <CardDescription>Manage API credentials for shipping providers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              </div>
            ) : (
              supportedCouriers.map((courier) => {
                const config = getCourierConfig(courier.name);
                return (
                  <div key={courier.name} className="p-4 border rounded-lg bg-muted/10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{courier.displayName}</span>
                        {config?.isConnected && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                            Connected
                          </span>
                        )}
                      </div>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        handleUpdateApiKey(
                          courier.name,
                          formData.get('apiKey') as string,
                          formData.get('apiSecret') as string
                        );
                      }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor={`key-${courier.name}`}>API Key</Label>
                        <Input
                          id={`key-${courier.name}`}
                          name="apiKey"
                          defaultValue={config?.apiKey || ""}
                          type="password"
                          placeholder="Enter API Key"
                          className="focus-visible:ring-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`secret-${courier.name}`}>API Secret / Token</Label>
                        <div className="flex gap-2">
                          <Input
                            id={`secret-${courier.name}`}
                            name="apiSecret"
                            defaultValue={config?.apiSecret || ""}
                            type="password"
                            placeholder="Enter API Secret"
                            className="focus-visible:ring-primary"
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={saving === courier.name}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {saving === courier.name ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </div>
                    </form>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Security Settings
            </CardTitle>
            <CardDescription>Keep your account secure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input id="current-password" type="password" placeholder="••••••••" className="focus-visible:ring-primary" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" placeholder="••••••••" className="focus-visible:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input id="confirm-password" type="password" placeholder="••••••••" className="focus-visible:ring-primary" />
              </div>
            </div>
            <Separator className="my-4" />
            <Button className="bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary">
              Update Password
            </Button>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              System Settings
            </CardTitle>
            <CardDescription>Platform configuration and preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="font-medium">Automatic Courier Assignment</p>
                <p className="text-sm text-muted-foreground">Enable AI-based courier selection</p>
              </div>
              <Switch defaultChecked className="data-[state=checked]:bg-primary" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="font-medium">Maintenance Mode</p>
                <p className="text-sm text-muted-foreground">Temporarily disable platform access</p>
              </div>
              <Switch className="data-[state=checked]:bg-primary" />
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
