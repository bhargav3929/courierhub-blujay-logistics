'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    UserPlus, CheckCircle2, XCircle, Clock,
    Mail, Phone, Building2, Store, Truck,
    MessageSquare, Eye, Inbox
} from "lucide-react";
import { toast } from "sonner";
import {
    getAllClientRequests,
    acceptClientRequest,
    rejectClientRequest,
} from "@/services/clientRequestService";
import { addClient } from "@/services/clientService";
import { ClientRequest } from "@/types/types";

const formatDate = (timestamp: any): string => {
    if (!timestamp) return '--';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
};

const statusConfig = {
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
};

const AVAILABLE_COURIERS = ["DTDC", "Blue Dart", "Delhivery", "India Post", "Ecom Express", "Shadowfax"];

const ClientRequests = () => {
    const [requests, setRequests] = useState<ClientRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all');

    // Detail dialog
    const [selectedRequest, setSelectedRequest] = useState<ClientRequest | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    // Action state
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [requestToReject, setRequestToReject] = useState<ClientRequest | null>(null);

    // Create client form dialog
    const [createFormOpen, setCreateFormOpen] = useState(false);
    const [requestForForm, setRequestForForm] = useState<ClientRequest | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        phone: "",
        type: "franchise" as "franchise" | "shopify",
        marginType: "flat" as "flat" | "percentage",
        marginValue: "",
        allowedCouriers: [] as string[]
    });
    const [formSubmitting, setFormSubmitting] = useState(false);

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const data = await getAllClientRequests();
            setRequests(data);
        } catch (error: any) {
            console.error("Error fetching requests:", error);
            toast.error("Failed to load client requests");
        } finally {
            setLoading(false);
        }
    };

    // Open the create client form pre-filled with request data
    const openCreateForm = (request: ClientRequest) => {
        setRequestForForm(request);
        setFormData({
            name: request.name,
            email: request.email,
            password: "",
            phone: request.phone,
            type: request.type,
            marginType: "flat",
            marginValue: "",
            allowedCouriers: [],
        });
        setDetailOpen(false);
        setCreateFormOpen(true);
    };

    const handleToggleCourier = (courier: string) => {
        setFormData(prev => ({
            ...prev,
            allowedCouriers: prev.allowedCouriers.includes(courier)
                ? prev.allowedCouriers.filter(c => c !== courier)
                : [...prev.allowedCouriers, courier]
        }));
    };

    const handleCreateClient = async () => {
        if (!requestForForm) return;

        if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.marginValue) {
            toast.error("Please fill in all required fields");
            return;
        }

        setFormSubmitting(true);
        try {
            // Create the actual client account
            await addClient({
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                type: formData.type,
                status: 'active',
                marginType: formData.marginType,
                marginValue: parseFloat(formData.marginValue),
                allowedCouriers: formData.allowedCouriers,
                walletBalance: 0
            }, formData.password);

            // Mark the request as accepted
            await acceptClientRequest(requestForForm.id);

            toast.success(`Account created for ${formData.name}!`);
            setRequests(prev =>
                prev.map(r => r.id === requestForForm.id ? { ...r, status: 'accepted' as const } : r)
            );
            setCreateFormOpen(false);
            setRequestForForm(null);
        } catch (error: any) {
            toast.error(error.message || "Failed to create client account");
        } finally {
            setFormSubmitting(false);
        }
    };

    const handleReject = async (request: ClientRequest) => {
        setActionLoading(request.id);
        try {
            await rejectClientRequest(request.id);
            toast.success(`Rejected ${request.name}'s application.`);
            setRequests(prev =>
                prev.map(r => r.id === request.id ? { ...r, status: 'rejected' as const } : r)
            );
            setRejectDialogOpen(false);
            setRequestToReject(null);
            setDetailOpen(false);
        } catch (error: any) {
            toast.error(error.message || "Failed to reject request");
        } finally {
            setActionLoading(null);
        }
    };

    const filtered = activeTab === 'all'
        ? requests
        : requests.filter(r => r.status === activeTab);

    const counts = {
        all: requests.length,
        pending: requests.filter(r => r.status === 'pending').length,
        accepted: requests.filter(r => r.status === 'accepted').length,
        rejected: requests.filter(r => r.status === 'rejected').length,
    };

    // Skeleton loader
    const SkeletonRows = () => (
        <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-1/3 bg-muted rounded" />
                        <div className="h-3 w-1/2 bg-muted rounded" />
                    </div>
                    <div className="h-6 w-16 bg-muted rounded-full" />
                    <div className="h-8 w-20 bg-muted rounded" />
                </div>
            ))}
        </div>
    );

    // Empty state
    const EmptyState = () => (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Inbox className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">No requests found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
                {activeTab === 'pending'
                    ? 'No pending requests at the moment. New applications will appear here.'
                    : activeTab === 'accepted'
                    ? 'No accepted requests yet.'
                    : activeTab === 'rejected'
                    ? 'No rejected requests.'
                    : 'No client requests have been submitted yet. They will appear here when prospective clients apply through the website.'}
            </p>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Client Requests</h2>
                    <p className="text-muted-foreground text-sm">Review and manage incoming client applications</p>
                </div>
                {counts.pending > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200/60">
                        <Clock className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-800">
                            {counts.pending} pending {counts.pending === 1 ? 'request' : 'requests'}
                        </span>
                    </div>
                )}
            </div>

            {/* Main Card */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">All Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full max-w-lg grid-cols-4 mb-6">
                            <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                                All ({counts.all})
                            </TabsTrigger>
                            <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                                Pending ({counts.pending})
                            </TabsTrigger>
                            <TabsTrigger value="accepted" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                                Accepted ({counts.accepted})
                            </TabsTrigger>
                            <TabsTrigger value="rejected" className="data-[state=active]:bg-primary data-[state=active]:text-white text-xs">
                                Rejected ({counts.rejected})
                            </TabsTrigger>
                        </TabsList>

                        {/* Shared content area for all tabs */}
                        <div>
                            {loading ? (
                                <SkeletonRows />
                            ) : filtered.length === 0 ? (
                                <EmptyState />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-border bg-primary/5">
                                                <th className="text-left p-3 font-semibold text-sm text-primary">Applicant</th>
                                                <th className="text-left p-3 font-semibold text-sm text-primary hidden md:table-cell">Contact</th>
                                                <th className="text-left p-3 font-semibold text-sm text-primary">Type</th>
                                                <th className="text-left p-3 font-semibold text-sm text-primary">Status</th>
                                                <th className="text-left p-3 font-semibold text-sm text-primary hidden sm:table-cell">Date</th>
                                                <th className="text-center p-3 font-semibold text-sm text-primary">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map((request) => (
                                                <tr key={request.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                                                    <td className="p-3">
                                                        <div>
                                                            <p className="font-medium text-sm text-slate-900">{request.name}</p>
                                                            <p className="text-xs text-muted-foreground">{request.companyName || '--'}</p>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 hidden md:table-cell">
                                                        <div className="space-y-0.5">
                                                            <p className="text-sm text-muted-foreground">{request.email}</p>
                                                            <p className="text-xs text-muted-foreground">{request.phone}</p>
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        <Badge variant="outline" className="border-primary/20 text-primary text-xs">
                                                            {request.type === 'franchise' ? 'Franchisee' : 'Ecommerce'}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3">
                                                        <Badge className={`${statusConfig[request.status].className} text-xs`}>
                                                            {statusConfig[request.status].label}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">
                                                        {formatDate(request.createdAt)}
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                                                                onClick={() => {
                                                                    setSelectedRequest(request);
                                                                    setDetailOpen(true);
                                                                }}
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            {request.status === 'pending' && (
                                                                <>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                                                                        disabled={actionLoading === request.id}
                                                                        onClick={() => openCreateForm(request)}
                                                                    >
                                                                        <CheckCircle2 className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                                                                        disabled={actionLoading === request.id}
                                                                        onClick={() => {
                                                                            setRequestToReject(request);
                                                                            setRejectDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <XCircle className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Detail Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-lg">Application Details</DialogTitle>
                    </DialogHeader>
                    {selectedRequest && (
                        <div className="space-y-5 pt-2">
                            {/* Status badge */}
                            <div className="flex items-center justify-between">
                                <Badge className={`${statusConfig[selectedRequest.status].className} text-xs`}>
                                    {statusConfig[selectedRequest.status].label}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    Submitted {formatDate(selectedRequest.createdAt)}
                                </span>
                            </div>

                            {/* Details grid */}
                            <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border">
                                <DetailRow icon={<UserPlus className="h-4 w-4" />} label="Name" value={selectedRequest.name} />
                                <DetailRow icon={<Building2 className="h-4 w-4" />} label="Company" value={selectedRequest.companyName || '--'} />
                                <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={selectedRequest.email} />
                                <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone" value={selectedRequest.phone} />
                                <DetailRow
                                    icon={selectedRequest.type === 'franchise' ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                                    label="Type"
                                    value={selectedRequest.type === 'franchise' ? 'Franchisee (B2B)' : 'Ecommerce Seller (B2C)'}
                                />
                                {selectedRequest.message && (
                                    <DetailRow icon={<MessageSquare className="h-4 w-4" />} label="Message" value={selectedRequest.message} />
                                )}
                            </div>

                            {/* Action buttons */}
                            {selectedRequest.status === 'pending' && (
                                <div className="flex gap-3 pt-2">
                                    <Button
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                        onClick={() => openCreateForm(selectedRequest)}
                                    >
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Accept & Create Account
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                        disabled={actionLoading === selectedRequest.id}
                                        onClick={() => {
                                            setRequestToReject(selectedRequest);
                                            setRejectDialogOpen(true);
                                        }}
                                    >
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Reject
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create Client Form Dialog (pre-filled from request) */}
            <Dialog open={createFormOpen} onOpenChange={(open) => {
                if (!formSubmitting) {
                    setCreateFormOpen(open);
                    if (!open) setRequestForForm(null);
                }
            }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-t-lg p-6 -m-6 mb-6">
                        <DialogTitle className="text-white text-xl">Create Client Account</DialogTitle>
                        <DialogDescription className="text-white/80">
                            Review and complete the details to create this client&apos;s account
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Pre-filled info banner */}
                        {requestForForm && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200/50">
                                <UserPlus className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-blue-800 leading-relaxed">
                                    Details pre-filled from <strong>{requestForForm.name}</strong>&apos;s application. Review and add the remaining fields below.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="client-name">Client Name *</Label>
                                <Input
                                    id="client-name"
                                    placeholder="Enter client name"
                                    className="focus-visible:ring-primary"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    disabled={formSubmitting}
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
                                    disabled={formSubmitting}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password *</Label>
                            <Input
                                id="password"
                                type="text"
                                placeholder="Set initial password for the client"
                                className="focus-visible:ring-primary"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                disabled={formSubmitting}
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
                                    disabled={formSubmitting}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client-type">Client Type *</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(value: "franchise" | "shopify") => setFormData({ ...formData, type: value })}
                                    disabled={formSubmitting}
                                >
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
                                {AVAILABLE_COURIERS.map((courier) => (
                                    <div key={courier} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`courier-${courier}`}
                                            checked={formData.allowedCouriers.includes(courier)}
                                            onCheckedChange={() => handleToggleCourier(courier)}
                                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                            disabled={formSubmitting}
                                        />
                                        <label htmlFor={`courier-${courier}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            {courier}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3 p-4 border rounded-lg border-primary/20 bg-primary/5">
                            <Label>Margin Configuration *</Label>
                            <RadioGroup
                                value={formData.marginType}
                                onValueChange={(value: "flat" | "percentage") => setFormData({ ...formData, marginType: value })}
                                disabled={formSubmitting}
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="flat" id="flat" className="border-primary text-primary" />
                                    <Label htmlFor="flat" className="font-normal cursor-pointer">Flat Amount (&#8377;)</Label>
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
                                disabled={formSubmitting}
                            />
                        </div>

                        <Button
                            onClick={handleCreateClient}
                            disabled={formSubmitting}
                            className="w-full bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary"
                        >
                            {formSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Creating Account...
                                </span>
                            ) : (
                                "Create Client Account"
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Reject Confirmation */}
            <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Application</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div>
                                <p>Are you sure you want to reject <strong>{requestToReject?.name}</strong>&apos;s application?</p>
                                {requestToReject && (
                                    <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                                        <div><strong>Name:</strong> {requestToReject.name}</div>
                                        <div><strong>Email:</strong> {requestToReject.email}</div>
                                        <div><strong>Company:</strong> {requestToReject.companyName || '--'}</div>
                                    </div>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={!!actionLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => requestToReject && handleReject(requestToReject)}
                            disabled={!!actionLoading}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {actionLoading ? "Rejecting..." : "Reject Application"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

// Detail row component for the dialog
const DetailRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div className="flex items-start gap-3">
        <div className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</div>
        <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
            <p className="text-sm text-slate-900 break-words">{value}</p>
        </div>
    </div>
);

export default ClientRequests;
