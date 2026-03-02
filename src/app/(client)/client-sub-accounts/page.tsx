'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Search,
    Plus,
    Users,
    UserCheck,
    UserX,
    Package,
    MoreVertical,
    Edit2,
    Trash2,
    Power,
    PowerOff,
    Loader2,
    RefreshCw
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Client, Shipment } from "@/types/types";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getSubAccountsByParent } from "@/services/subAccountService";
import { getAllShipments } from "@/services/shipmentService";
import { format } from "date-fns";
import { AddSubAccountDialog } from "@/components/sub-accounts/AddSubAccountDialog";
import { EditSubAccountDialog } from "@/components/sub-accounts/EditSubAccountDialog";

interface SubAccountWithStats extends Client {
    shipmentCount: number;
}

const ClientSubAccounts = () => {
    const router = useRouter();
    const { currentUser, firebaseUser, canManageSubAccounts } = useAuth();
    const [subAccounts, setSubAccounts] = useState<SubAccountWithStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    // Dialog states
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingSubAccount, setEditingSubAccount] = useState<Client | null>(null);
    const [deletingSubAccount, setDeletingSubAccount] = useState<Client | null>(null);
    const [togglingStatus, setTogglingStatus] = useState<{ account: Client; newStatus: 'active' | 'inactive' } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Stats
    const totalSubAccounts = subAccounts.length;
    const activeSubAccounts = subAccounts.filter(s => s.status === 'active').length;
    const totalShipmentsBySubAccounts = subAccounts.reduce((sum, s) => sum + s.shipmentCount, 0);

    // Redirect if not authorized
    useEffect(() => {
        if (!loading && !canManageSubAccounts) {
            router.push('/client-dashboard');
        }
    }, [loading, canManageSubAccounts, router]);

    useEffect(() => {
        if (currentUser?.id && canManageSubAccounts) {
            fetchSubAccounts();
        }
    }, [currentUser?.id, canManageSubAccounts]);

    const fetchSubAccounts = async () => {
        try {
            setLoading(true);
            const accounts = await getSubAccountsByParent(currentUser!.id);

            // Fetch shipment counts for each sub-account
            const accountIds = accounts.map(a => a.id);
            let shipmentCounts: Map<string, number> = new Map();

            if (accountIds.length > 0) {
                const shipments = await getAllShipments({ clientIds: accountIds });
                // Count shipments per client
                for (const shipment of shipments) {
                    const count = shipmentCounts.get(shipment.clientId) || 0;
                    shipmentCounts.set(shipment.clientId, count + 1);
                }
            }

            const accountsWithStats: SubAccountWithStats[] = accounts.map(account => ({
                ...account,
                shipmentCount: shipmentCounts.get(account.id) || 0
            }));

            setSubAccounts(accountsWithStats);
        } catch (error) {
            console.error("Error fetching sub-accounts:", error);
            toast.error("Failed to load sub-accounts");
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchSubAccounts();
        setRefreshing(false);
        toast.success("Sub-accounts refreshed");
    };

    const handleToggleStatus = async () => {
        if (!togglingStatus || !firebaseUser) return;

        try {
            setActionLoading(true);
            const token = await firebaseUser.getIdToken();

            const res = await fetch('/api/sub-accounts/toggle-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    subAccountId: togglingStatus.account.id,
                    status: togglingStatus.newStatus
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update status');
            }

            toast.success(`Sub-account ${togglingStatus.newStatus === 'active' ? 'enabled' : 'disabled'}`);
            await fetchSubAccounts();
        } catch (error: any) {
            console.error("Error toggling status:", error);
            toast.error(error.message || "Failed to update status");
        } finally {
            setActionLoading(false);
            setTogglingStatus(null);
        }
    };

    const handleDelete = async () => {
        if (!deletingSubAccount || !firebaseUser) return;

        try {
            setActionLoading(true);
            const token = await firebaseUser.getIdToken();

            const res = await fetch(`/api/sub-accounts/${deletingSubAccount.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to delete sub-account');
            }

            toast.success("Sub-account deleted successfully");
            await fetchSubAccounts();
        } catch (error: any) {
            console.error("Error deleting sub-account:", error);
            toast.error(error.message || "Failed to delete sub-account");
        } finally {
            setActionLoading(false);
            setDeletingSubAccount(null);
        }
    };

    // Filter sub-accounts by search query
    const filteredSubAccounts = subAccounts.filter(account => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            account.name.toLowerCase().includes(query) ||
            account.email.toLowerCase().includes(query) ||
            account.phone.includes(query)
        );
    });

    // Format date helper
    const formatDate = (timestamp: any) => {
        if (!timestamp) return '-';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return format(date, 'MMM d, yyyy');
    };

    if (!canManageSubAccounts) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Sub-accounts</h1>
                        <p className="text-slate-400 mt-1">Manage your business partner accounts</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300"
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button
                            onClick={() => setShowAddDialog(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Sub-account
                        </Button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <Card className="bg-slate-800/50 border-slate-700/50">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-400">Total Sub-accounts</p>
                                    <p className="text-3xl font-bold text-white mt-1">{totalSubAccounts}</p>
                                </div>
                                <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                    <Users className="h-6 w-6 text-blue-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-800/50 border-slate-700/50">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-400">Active</p>
                                    <p className="text-3xl font-bold text-white mt-1">{activeSubAccounts}</p>
                                </div>
                                <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                                    <UserCheck className="h-6 w-6 text-green-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-800/50 border-slate-700/50">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-400">Total Shipments</p>
                                    <p className="text-3xl font-bold text-white mt-1">{totalShipmentsBySubAccounts}</p>
                                </div>
                                <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                    <Package className="h-6 w-6 text-purple-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search by name, email, or phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                {/* Table */}
                <Card className="bg-slate-800/50 border-slate-700/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-900/50 border-b border-slate-700/50">
                                <tr>
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Name</th>
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Email</th>
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Phone</th>
                                    <th className="text-center px-6 py-4 text-sm font-semibold text-slate-300">Status</th>
                                    <th className="text-center px-6 py-4 text-sm font-semibold text-slate-300">Shipments</th>
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-300">Created</th>
                                    <th className="text-right px-6 py-4 text-sm font-semibold text-slate-300">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-400" />
                                            <p className="text-slate-400 mt-2">Loading sub-accounts...</p>
                                        </td>
                                    </tr>
                                ) : filteredSubAccounts.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center">
                                            <UserX className="h-12 w-12 mx-auto text-slate-600" />
                                            <p className="text-slate-400 mt-3 font-medium">
                                                {searchQuery ? 'No sub-accounts match your search' : 'No sub-accounts yet'}
                                            </p>
                                            {!searchQuery && (
                                                <p className="text-slate-500 text-sm mt-1">
                                                    Create your first sub-account to get started
                                                </p>
                                            )}
                                            {!searchQuery && (
                                                <Button
                                                    onClick={() => setShowAddDialog(true)}
                                                    className="mt-4 bg-blue-600 hover:bg-blue-700"
                                                >
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    Add Sub-account
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSubAccounts.map((account) => (
                                        <tr key={account.id} className="hover:bg-slate-700/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <span className="font-medium text-white">{account.name}</span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-300">{account.email}</td>
                                            <td className="px-6 py-4 text-slate-300">{account.phone}</td>
                                            <td className="px-6 py-4 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        account.status === 'active'
                                                            ? 'border-green-500/50 bg-green-500/10 text-green-400'
                                                            : 'border-red-500/50 bg-red-500/10 text-red-400'
                                                    }
                                                >
                                                    {account.status === 'active' ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-slate-300 font-medium">{account.shipmentCount}</span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-400 text-sm">
                                                {formatDate(account.createdAt)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200">
                                                        <DropdownMenuItem
                                                            onClick={() => setEditingSubAccount(account)}
                                                            className="hover:bg-slate-700 cursor-pointer"
                                                        >
                                                            <Edit2 className="h-4 w-4 mr-2" />
                                                            Edit Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => setTogglingStatus({
                                                                account,
                                                                newStatus: account.status === 'active' ? 'inactive' : 'active'
                                                            })}
                                                            className="hover:bg-slate-700 cursor-pointer"
                                                        >
                                                            {account.status === 'active' ? (
                                                                <>
                                                                    <PowerOff className="h-4 w-4 mr-2" />
                                                                    Disable Account
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Power className="h-4 w-4 mr-2" />
                                                                    Enable Account
                                                                </>
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="bg-slate-700" />
                                                        <DropdownMenuItem
                                                            onClick={() => setDeletingSubAccount(account)}
                                                            className="text-red-400 hover:bg-red-900/30 cursor-pointer"
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Delete Account
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* Add Sub-account Dialog */}
            <AddSubAccountDialog
                open={showAddDialog}
                onOpenChange={setShowAddDialog}
                onSuccess={() => {
                    fetchSubAccounts();
                    setShowAddDialog(false);
                }}
                parentCouriers={currentUser?.shopifyConfig ? [] : []}
            />

            {/* Edit Sub-account Dialog */}
            {editingSubAccount && (
                <EditSubAccountDialog
                    open={!!editingSubAccount}
                    onOpenChange={(open) => !open && setEditingSubAccount(null)}
                    subAccount={editingSubAccount}
                    onSuccess={() => {
                        fetchSubAccounts();
                        setEditingSubAccount(null);
                    }}
                    parentCouriers={currentUser?.shopifyConfig ? [] : []}
                />
            )}

            {/* Toggle Status Confirmation */}
            <AlertDialog open={!!togglingStatus} onOpenChange={(open) => !open && setTogglingStatus(null)}>
                <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {togglingStatus?.newStatus === 'active' ? 'Enable' : 'Disable'} Sub-account?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            {togglingStatus?.newStatus === 'active'
                                ? `This will allow ${togglingStatus?.account.name} to log in and use the platform.`
                                : `This will prevent ${togglingStatus?.account.name} from logging in. Their data will be preserved.`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleToggleStatus}
                            disabled={actionLoading}
                            className={
                                togglingStatus?.newStatus === 'active'
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-amber-600 hover:bg-amber-700'
                            }
                        >
                            {actionLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {togglingStatus?.newStatus === 'active' ? 'Enable' : 'Disable'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingSubAccount} onOpenChange={(open) => !open && setDeletingSubAccount(null)}>
                <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Sub-account?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            This will permanently delete <strong className="text-white">{deletingSubAccount?.name}</strong>'s
                            account and remove their login access. Their shipment history will be preserved.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={actionLoading}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {actionLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Delete Account
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ClientSubAccounts;
