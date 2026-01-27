'use client';

import { useState, useEffect } from "react";
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
import { getAllClients, addClient, toggleClientStatus } from "@/services/clientService";
import { Client } from "@/types/types";

const Clients = () => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [franchiseClients, setFranchiseClients] = useState<Client[]>([]);
    const [shopifyClients, setShopifyClients] = useState<Client[]>([]);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "", // Added password field
        phone: "",
        type: "franchise" as "franchise" | "shopify",
        marginType: "flat" as "flat" | "percentage",
        marginValue: "",
        allowedCouriers: [] as string[]
    });

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            setLoading(true);
            const [franchise, shopify] = await Promise.all([
                getAllClients({ type: "franchise" }),
                getAllClients({ type: "shopify" })
            ]);
            setFranchiseClients(franchise);
            setShopifyClients(shopify);
        } catch (error: any) {
            console.error("Error fetching clients:", error);
            toast.error("Failed to load clients");
        } finally {
            setLoading(false);
        }
    };

    const handleAddClient = async () => {
        try {
            if (!formData.name || !formData.email || !formData.phone || !formData.marginValue) {
                toast.error("Please fill in all required fields");
                return;
            }

            await addClient({
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                type: formData.type,
                status: "active",
                marginType: formData.marginType,
                marginValue: parseFloat(formData.marginValue),
                allowedCouriers: formData.allowedCouriers,
                walletBalance: 0
            }, formData.password);

            toast.success("Client added successfully!");
            setIsDialogOpen(false);
            // Reset form
            setFormData({
                name: "",
                email: "",
                password: "", // Reset password
                phone: "",
                type: "franchise",
                marginType: "flat",
                marginValue: "",
                allowedCouriers: []
            });
            // Refresh clients list
            fetchClients();
        } catch (error: any) {
            toast.error(error.message || "Failed to add client");
        }
    };

    const handleToggleCourier = (courier: string) => {
        setFormData(prev => ({
            ...prev,
            allowedCouriers: prev.allowedCouriers.includes(courier)
                ? prev.allowedCouriers.filter(c => c !== courier)
                : [...prev.allowedCouriers, courier]
        }));
    };

    const ClientTable = ({ clients }: { clients: Client[] }) => {
        if (loading) {
            return (
                <div className="text-center py-8">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                    <p className="mt-2 text-muted-foreground">Loading clients...</p>
                </div>
            );
        }

        if (clients.length === 0) {
            return (
                <div className="text-center py-8 text-muted-foreground">
                    No clients found. Add your first client using the button above.
                </div>
            );
        }

        return (
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
                                <td className="p-3 text-right font-semibold text-primary">
                                    {client.marginType === "flat" ? `₹${client.marginValue}` : `${client.marginValue}%`}
                                </td>
                                <td className="p-3 text-right font-semibold">₹{client.walletBalance.toLocaleString()}</td>
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
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            {/* Page Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Clients</h2>
                    <p className="text-muted-foreground text-sm">Manage franchises and merchants</p>
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
                                    <Input
                                        id="client-name"
                                        placeholder="Enter client name"
                                        className="focus-visible:ring-primary"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email *</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="client@example.com"
                                        className="focus-visible:ring-primary"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password *</Label>
                                <Input
                                    id="password"
                                    type="text" // Visible for admin convenience or "password"
                                    placeholder="Set initial password"
                                    className="focus-visible:ring-primary"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone Number *</Label>
                                    <Input
                                        id="phone"
                                        placeholder="+91-XXXXXXXXXX"
                                        className="focus-visible:ring-primary"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="client-type">Client Type *</Label>
                                    <Select value={formData.type} onValueChange={(value: "franchise" | "shopify") => setFormData({ ...formData, type: value })}>
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
                                            <Checkbox
                                                id={courier}
                                                checked={formData.allowedCouriers.includes(courier)}
                                                onCheckedChange={() => handleToggleCourier(courier)}
                                                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                            />
                                            <label htmlFor={courier} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                {courier}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 p-4 border rounded-lg border-primary/20 bg-primary/5">
                                <Label>Margin Configuration *</Label>
                                <RadioGroup value={formData.marginType} onValueChange={(value: "flat" | "percentage") => setFormData({ ...formData, marginType: value })}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="flat" id="flat" className="border-primary text-primary" />
                                        <Label htmlFor="flat" className="font-normal cursor-pointer">Flat Amount (₹)</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="percentage" id="percentage" className="border-primary text-primary" />
                                        <Label htmlFor="percentage" className="font-normal cursor-pointer">Percentage (%)</Label>
                                    </div>
                                </RadioGroup>
                                <Input
                                    placeholder="Enter margin value"
                                    className="focus-visible:ring-primary"
                                    type="number"
                                    value={formData.marginValue}
                                    onChange={(e) => setFormData({ ...formData, marginValue: e.target.value })}
                                />
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
    );
};

export default Clients;
