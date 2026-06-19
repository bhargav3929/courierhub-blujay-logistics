'use client';

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Eye, Edit, Ban, Trash2, Check, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAuth } from "firebase/auth";
import {
    deriveSubdomain,
    normalizeSubdomainInput,
    validateSubdomain,
} from "@/lib/subdomainSlug";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { getAllClients, addClient, toggleClientStatus, deleteClient } from "@/services/clientService";
import { Client } from "@/types/types";

type ClientType = "franchise" | "shopify" | "white_label";

const Clients = () => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [franchiseClients, setFranchiseClients] = useState<Client[]>([]);
    const [shopifyClients, setShopifyClients] = useState<Client[]>([]);
    const [whiteLabelClients, setWhiteLabelClients] = useState<Client[]>([]);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        phone: "",
        type: "franchise" as ClientType,
        marginType: "flat" as "flat" | "percentage",
        marginValue: "",
        allowedCouriers: [] as string[],
        // White-label only — empty for other types.
        subdomain: "",
    });

    // Whether the admin has manually edited the subdomain. While false, the
    // field auto-tracks the business name; the moment they type into the
    // subdomain field we stop overwriting it.
    const subdomainTouchedRef = useRef(false);

    // Live availability state for the subdomain field. Mirrors the API contract
    // in /api/admin/subdomain-check.
    type AvailabilityState =
        | { kind: 'idle' }
        | { kind: 'checking' }
        | { kind: 'available' }
        | { kind: 'invalid'; message: string }
        | { kind: 'taken' }
        | { kind: 'reserved' }
        | { kind: 'error'; message: string };
    const [subdomainStatus, setSubdomainStatus] = useState<AvailabilityState>({ kind: 'idle' });

    // Debounced availability check. Re-runs whenever subdomain text changes,
    // but only fires the network call after 350ms of quiet to avoid spamming
    // Firestore as the admin types.
    useEffect(() => {
        if (formData.type !== 'white_label') {
            setSubdomainStatus({ kind: 'idle' });
            return;
        }
        const value = formData.subdomain.trim();
        if (!value) {
            setSubdomainStatus({ kind: 'idle' });
            return;
        }
        const syntax = validateSubdomain(value);
        if (!syntax.valid) {
            if (syntax.code === 'reserved') {
                setSubdomainStatus({ kind: 'reserved' });
            } else {
                setSubdomainStatus({ kind: 'invalid', message: syntax.message });
            }
            return;
        }

        setSubdomainStatus({ kind: 'checking' });
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const user = getAuth().currentUser;
                if (!user) {
                    if (!cancelled) {
                        setSubdomainStatus({ kind: 'error', message: 'Sign in again to continue.' });
                    }
                    return;
                }
                const token = await user.getIdToken();
                const res = await fetch('/api/admin/subdomain-check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ value }),
                });
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setSubdomainStatus({ kind: 'error', message: data.error || 'Check failed' });
                    return;
                }
                if (data.available) {
                    setSubdomainStatus({ kind: 'available' });
                } else if (data.reason === 'taken') {
                    setSubdomainStatus({ kind: 'taken' });
                } else if (data.reason === 'reserved') {
                    setSubdomainStatus({ kind: 'reserved' });
                } else if (data.reason === 'invalid') {
                    setSubdomainStatus({ kind: 'invalid', message: data.message || 'Invalid' });
                }
            } catch (err: any) {
                if (!cancelled) {
                    setSubdomainStatus({ kind: 'error', message: err?.message || 'Check failed' });
                }
            }
        }, 350);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [formData.subdomain, formData.type]);

    useEffect(() => {
        fetchClients();
    }, []);

    // Auto-derive subdomain from business name for white-label until the admin
    // edits the subdomain field manually. Stops the moment they take ownership
    // of the value — we never overwrite user input.
    useEffect(() => {
        if (formData.type !== 'white_label') return;
        if (subdomainTouchedRef.current) return;
        const suggested = deriveSubdomain(formData.name);
        setFormData((prev) =>
            prev.subdomain === suggested ? prev : { ...prev, subdomain: suggested }
        );
    }, [formData.name, formData.type]);

    const fetchClients = async () => {
        try {
            setLoading(true);
            const [franchise, shopify, whiteLabel] = await Promise.all([
                getAllClients({ type: "franchise" }),
                getAllClients({ type: "shopify" }),
                getAllClients({ type: "white_label" })
            ]);
            setFranchiseClients(franchise);
            setShopifyClients(shopify);
            setWhiteLabelClients(whiteLabel);
        } catch (error: any) {
            console.error("Error fetching clients:", error);
            toast.error("Failed to load clients");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: "",
            email: "",
            password: "",
            phone: "",
            type: "franchise",
            marginType: "flat",
            marginValue: "",
            allowedCouriers: [],
            subdomain: "",
        });
        subdomainTouchedRef.current = false;
        setSubdomainStatus({ kind: 'idle' });
    };

    const handleAddClient = async () => {
        try {
            if (!formData.name || !formData.email || !formData.password || !formData.phone || !formData.marginValue) {
                toast.error("Please fill in all required fields");
                return;
            }
            if (formData.password.length < 6) {
                toast.error("Password must be at least 6 characters");
                return;
            }
            if (formData.allowedCouriers.length === 0) {
                toast.error("Select at least one allowed courier");
                return;
            }

            // White-label requires a confirmed-available subdomain before we
            // touch any Firestore state. Block submit until the live check
            // resolves to `available`.
            if (formData.type === 'white_label') {
                if (!formData.subdomain) {
                    toast.error("Subdomain is required for white-label partners");
                    return;
                }
                if (subdomainStatus.kind === 'checking') {
                    toast.error("Subdomain availability is still being checked — try again in a moment");
                    return;
                }
                if (subdomainStatus.kind !== 'available') {
                    toast.error("Choose an available subdomain before saving");
                    return;
                }
            }

            const createdClient = await addClient({
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

            // For white-label, atomically reserve the subdomain server-side.
            // If this fails, roll back by deleting the client we just created.
            // Without rollback we'd leave an orphan client with no subdomain,
            // which the admin would have to clean up by hand.
            if (formData.type === 'white_label') {
                try {
                    const user = getAuth().currentUser;
                    if (!user) {
                        throw new Error('Session expired — sign in again.');
                    }
                    const token = await user.getIdToken();
                    const res = await fetch('/api/admin/subdomain-reserve', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            tenantId: createdClient.id,
                            subdomain: formData.subdomain.trim().toLowerCase(),
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.error || 'Failed to reserve subdomain');
                    }
                } catch (reserveErr: any) {
                    // Roll back the orphan client — the subdomain is the
                    // load-bearing piece of a white-label tenant; without it
                    // the rest is unusable.
                    try {
                        await deleteClient(createdClient.id);
                    } catch (rollbackErr) {
                        console.error('[clients] rollback after subdomain reserve failed:', rollbackErr);
                    }
                    toast.error(reserveErr?.message || 'Failed to reserve subdomain. Try a different one.');
                    return;
                }
            }

            const typeLabel =
                formData.type === "franchise" ? "Franchise Partner" :
                formData.type === "shopify" ? "Shopify Merchant" :
                "White Label Partner";
            const successDetail =
                formData.type === 'white_label'
                    ? ` — portal at ${formData.subdomain}.blujaylogistic.com`
                    : '';
            toast.success(`${typeLabel} added successfully!${successDetail}`);
            setIsDialogOpen(false);
            resetForm();
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

    const handleDeleteClick = (client: Client) => {
        setClientToDelete(client);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!clientToDelete) return;
        try {
            setIsDeleting(true);
            await deleteClient(clientToDelete.id);

            // Remove from local state
            if (clientToDelete.type === 'franchise') {
                setFranchiseClients(prev => prev.filter(c => c.id !== clientToDelete.id));
            } else if (clientToDelete.type === 'shopify') {
                setShopifyClients(prev => prev.filter(c => c.id !== clientToDelete.id));
            } else {
                setWhiteLabelClients(prev => prev.filter(c => c.id !== clientToDelete.id));
            }

            toast.success("Client deleted successfully");
            setDeleteDialogOpen(false);
            setClientToDelete(null);
        } catch (error) {
            console.error("Delete error:", error);
            toast.error("Failed to delete client");
        } finally {
            setIsDeleting(false);
        }
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
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleDeleteClick(client)}
                                        >
                                            <Trash2 className="h-4 w-4" />
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
                                Create a new account for a Franchise Partner, Shopify Merchant, or White Label Partner
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
                                    <Select value={formData.type} onValueChange={(value: ClientType) => setFormData({ ...formData, type: value })}>
                                        <SelectTrigger className="focus:ring-primary">
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="franchise">Franchise Partner</SelectItem>
                                            <SelectItem value="shopify">Shopify Merchant</SelectItem>
                                            <SelectItem value="white_label">White Label Partner</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {formData.type === "white_label" && (
                                <>
                                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
                                        <p className="font-semibold mb-1">White Label Partner</p>
                                        <p className="text-amber-800/90 leading-relaxed">
                                            This partner gets their own subdomain and a branded portal. On first
                                            login they complete a mandatory onboarding form (logo, brand color,
                                            return address, support contacts) before they can use the dashboard.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="subdomain">Portal Subdomain *</Label>
                                        <div className="flex items-stretch gap-0 rounded-md border border-input focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 overflow-hidden">
                                            <Input
                                                id="subdomain"
                                                value={formData.subdomain}
                                                onChange={(e) => {
                                                    subdomainTouchedRef.current = true;
                                                    setFormData({
                                                        ...formData,
                                                        subdomain: normalizeSubdomainInput(e.target.value),
                                                    });
                                                }}
                                                placeholder="svkoreas"
                                                className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1"
                                                autoComplete="off"
                                                spellCheck={false}
                                                maxLength={32}
                                            />
                                            <span className="flex items-center px-3 text-sm text-muted-foreground bg-muted/50 border-l">
                                                .blujaylogistic.com
                                            </span>
                                        </div>
                                        <SubdomainStatusLine status={subdomainStatus} />
                                        <p className="text-xs text-muted-foreground">
                                            Auto-suggested from the client name. Edit to override. Lowercase letters,
                                            numbers, and hyphens only.
                                        </p>
                                    </div>
                                </>
                            )}

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
                        <TabsList className="grid w-full max-w-2xl grid-cols-3 mb-6">
                            <TabsTrigger value="franchise" className="data-[state=active]:bg-primary data-[state=active]:text-white">
                                Franchise ({franchiseClients.length})
                            </TabsTrigger>
                            <TabsTrigger value="shopify" className="data-[state=active]:bg-primary data-[state=active]:text-white">
                                Shopify ({shopifyClients.length})
                            </TabsTrigger>
                            <TabsTrigger value="white_label" className="data-[state=active]:bg-primary data-[state=active]:text-white">
                                White Label ({whiteLabelClients.length})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="franchise">
                            <ClientTable clients={franchiseClients} />
                        </TabsContent>

                        <TabsContent value="shopify">
                            <ClientTable clients={shopifyClients} />
                        </TabsContent>

                        <TabsContent value="white_label">
                            <ClientTable clients={whiteLabelClients} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Client</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div>
                                <p>
                                    This client will be <span className="font-semibold text-red-600">permanently deleted</span> from the system.
                                    This action cannot be undone.
                                </p>
                                {clientToDelete && (
                                    <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                                        <div><strong>Name:</strong> {clientToDelete.name}</div>
                                        <div><strong>Email:</strong> {clientToDelete.email}</div>
                                        <div><strong>Type:</strong> {
                                            clientToDelete.type === 'franchise' ? 'Franchise Partner' :
                                            clientToDelete.type === 'shopify' ? 'Shopify Merchant' :
                                            'White Label Partner'
                                        }</div>
                                        <div><strong>Wallet Balance:</strong> ₹{clientToDelete.walletBalance.toLocaleString()}</div>
                                    </div>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            {isDeleting ? "Deleting..." : "Delete Permanently"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

// Inline status pill for the subdomain field. Kept in this file because the
// AvailabilityState type lives in the parent component's closure.
function SubdomainStatusLine({
    status,
}: {
    status:
        | { kind: 'idle' }
        | { kind: 'checking' }
        | { kind: 'available' }
        | { kind: 'invalid'; message: string }
        | { kind: 'taken' }
        | { kind: 'reserved' }
        | { kind: 'error'; message: string };
}) {
    if (status.kind === 'idle') return null;

    const config: { icon: React.ReactNode; text: string; className: string } = (() => {
        switch (status.kind) {
            case 'checking':
                return {
                    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
                    text: 'Checking availability…',
                    className: 'text-muted-foreground',
                };
            case 'available':
                return {
                    icon: <Check className="h-3.5 w-3.5" />,
                    text: 'Available',
                    className: 'text-emerald-600',
                };
            case 'taken':
                return {
                    icon: <X className="h-3.5 w-3.5" />,
                    text: 'Already taken — try another',
                    className: 'text-red-600',
                };
            case 'reserved':
                return {
                    icon: <X className="h-3.5 w-3.5" />,
                    text: 'Reserved — choose a different name',
                    className: 'text-red-600',
                };
            case 'invalid':
                return {
                    icon: <X className="h-3.5 w-3.5" />,
                    text: status.message,
                    className: 'text-red-600',
                };
            case 'error':
                return {
                    icon: <X className="h-3.5 w-3.5" />,
                    text: status.message,
                    className: 'text-amber-600',
                };
        }
    })();

    return (
        <p className={`text-xs font-medium inline-flex items-center gap-1.5 ${config.className}`}>
            {config.icon}
            {config.text}
        </p>
    );
}

export default Clients;
