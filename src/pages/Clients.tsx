import { useState } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Eye, Edit, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

const franchiseClients = [
  { id: 1, name: "QuickShip Enterprises", email: "contact@quickship.in", phone: "+91-9876543210", status: "active", marginType: "flat", marginValue: "₹15", wallet: "₹25,430" },
  { id: 2, name: "Metro Courier Services", email: "info@metrocourier.co.in", phone: "+91-9123456789", status: "active", marginType: "percentage", marginValue: "10%", wallet: "₹18,950" },
  { id: 3, name: "Express Logistics Pvt Ltd", email: "sales@expresslog.in", phone: "+91-9988776655", status: "active", marginType: "flat", marginValue: "₹20", wallet: "₹42,100" },
  { id: 4, name: "Swift Delivery Hub", email: "admin@swiftdelivery.in", phone: "+91-9876512345", status: "inactive", marginType: "percentage", marginValue: "8%", wallet: "₹5,200" },
  { id: 5, name: "BlueExpress Solutions", email: "contact@blueexpress.co.in", phone: "+91-9123498765", status: "active", marginType: "flat", marginValue: "₹12", wallet: "₹31,580" },
];

const shopifyClients = [
  { id: 6, name: "FashionHub Store", email: "store@fashionhub.in", phone: "+91-9876501234", status: "active", marginType: "percentage", marginValue: "12%", wallet: "₹22,340" },
  { id: 7, name: "HomeDecor Hub", email: "orders@homedecor.in", phone: "+91-9123487654", status: "active", marginType: "flat", marginValue: "₹18", wallet: "₹15,670" },
  { id: 8, name: "TechGadgets India", email: "support@techgadgets.in", phone: "+91-9988712345", status: "active", marginType: "percentage", marginValue: "15%", wallet: "₹28,920" },
  { id: 9, name: "Fashion Vista", email: "hello@fashionvista.in", phone: "+91-9876598765", status: "active", marginType: "flat", marginValue: "₹10", wallet: "₹19,450" },
  { id: 10, name: "Organic Wellness Shop", email: "care@organicwellness.in", phone: "+91-9123456098", status: "inactive", marginType: "percentage", marginValue: "9%", wallet: "₹3,100" },
];

const Clients = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAddClient = () => {
    toast.success("Client added successfully!");
    setIsDialogOpen(false);
  };

  const ClientTable = ({ clients }: { clients: typeof franchiseClients }) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-primary/5">
            <th className="text-left p-3 font-semibold text-sm text-primary">Client Name</th>
            <th className="text-left p-3 font-semibold text-sm text-primary">Email</th>
            <th className="text-left p-3 font-semibold text-sm text-primary">Phone</th>
            <th className="text-left p-3 font-semibold text-sm text-primary">Status</th>
            <th className="text-left p-3 font-semibold text-sm text-primary">Margin Type</th>
            <th className="text-right p-3 font-semibold text-sm text-primary">Margin Value</th>
            <th className="text-right p-3 font-semibold text-sm text-primary">Wallet Balance</th>
            <th className="text-center p-3 font-semibold text-sm text-primary">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id} className="border-b border-border hover:bg-muted/30 transition-colors">
              <td className="p-3 font-medium">{client.name}</td>
              <td className="p-3 text-muted-foreground text-sm">{client.email}</td>
              <td className="p-3 text-muted-foreground text-sm">{client.phone}</td>
              <td className="p-3">
                {client.status === "active" ? (
                  <Badge className="bg-status-delivered/10 text-status-delivered border-status-delivered/20">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </td>
              <td className="p-3">
                <Badge variant="outline" className="border-primary/20 text-primary">
                  {client.marginType === "flat" ? "₹ Flat" : "% Rate"}
                </Badge>
              </td>
              <td className="p-3 text-right font-semibold text-primary">{client.marginValue}</td>
              <td className="p-3 text-right font-semibold">{client.wallet}</td>
              <td className="p-3">
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary hover:bg-primary/10">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary hover:bg-primary/10">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted">
                    <Ban className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-xl p-6 text-white shadow-lg flex-1 mr-4">
            <h1 className="text-3xl font-bold mb-2">Client Management</h1>
            <p className="text-white/80">Manage your franchise partners and Shopify merchants</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary shadow-lg">
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-t-lg p-6 -m-6 mb-6">
                <DialogTitle className="text-white text-xl">Add New Client</DialogTitle>
                <DialogDescription className="text-white/80">
                  Create a new client account for franchise or Shopify merchant
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="client-name">Client Name *</Label>
                    <Input id="client-name" placeholder="Enter client name" className="focus-visible:ring-primary" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" type="email" placeholder="client@example.com" className="focus-visible:ring-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input id="phone" placeholder="+91-XXXXXXXXXX" className="focus-visible:ring-primary" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-type">Client Type *</Label>
                    <Select>
                      <SelectTrigger className="focus:ring-primary">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="franchise">Franchise Partner</SelectItem>
                        <SelectItem value="shopify">Shopify Merchant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Allowed Couriers *</Label>
                  <div className="grid grid-cols-2 gap-3 p-4 border rounded-lg border-border bg-muted/30">
                    {["DTDC", "Blue Dart", "Delhivery", "India Post", "Ecom Express", "Shadowfax"].map((courier) => (
                      <div key={courier} className="flex items-center space-x-2">
                        <Checkbox id={courier} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                        <label htmlFor={courier} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {courier}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 p-4 border rounded-lg border-primary/20 bg-primary/5">
                  <Label>Margin Configuration *</Label>
                  <RadioGroup defaultValue="flat" className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="flat" id="flat" className="border-primary text-primary" />
                      <Label htmlFor="flat" className="font-normal cursor-pointer">Flat Amount (₹)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="percentage" id="percentage" className="border-primary text-primary" />
                      <Label htmlFor="percentage" className="font-normal cursor-pointer">Percentage (%)</Label>
                    </div>
                  </RadioGroup>
                  <Input placeholder="Enter margin value" className="focus-visible:ring-primary" />
                </div>

                <Button 
                  onClick={handleAddClient}
                  className="w-full bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary"
                >
                  Save Client
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Client Directory</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="franchise" className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
                <TabsTrigger value="franchise" className="data-[state=active]:bg-primary data-[state=active]:text-white">
                  Franchise Partners ({franchiseClients.length})
                </TabsTrigger>
                <TabsTrigger value="shopify" className="data-[state=active]:bg-primary data-[state=active]:text-white">
                  Shopify Merchants ({shopifyClients.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="franchise">
                <ClientTable clients={franchiseClients} />
              </TabsContent>
              
              <TabsContent value="shopify">
                <ClientTable clients={shopifyClients} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Clients;
