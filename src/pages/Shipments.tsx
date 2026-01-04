import { useState, useEffect } from "react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Filter,
  Download,
  Eye,
  MoreHorizontal,
  ArrowUpDown,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  RefreshCw
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { getAllShipments } from "@/services/shipmentService";
import { getAllClients } from "@/services/clientService";
import { Shipment, Client } from "@/types/types";
import { toast } from "sonner";
import { format } from "date-fns";

const Shipments = () => {
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Effect to re-fetch when filters change (debounced for search)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchShipments();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, clientFilter, courierFilter]);

  const fetchInitialData = async () => {
    try {
      const [clientsData] = await Promise.all([
        getAllClients()
      ]);
      setClients(clientsData);
      // fetchShipments will be triggered by the effect
    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast.error("Failed to load filter data");
    }
  };

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const filters: any = {};

      if (statusFilter && statusFilter !== "all") filters.status = statusFilter;
      if (clientFilter && clientFilter !== "all") filters.clientId = clientFilter;
      if (courierFilter && courierFilter !== "all") filters.courier = courierFilter;
      if (searchQuery) filters.search = searchQuery;

      const data = await getAllShipments(filters);
      setShipments(data);
    } catch (error) {
      console.error("Error fetching shipments:", error);
      toast.error("Failed to load shipments");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      delivered: { icon: CheckCircle, label: "Delivered", className: "bg-status-delivered/10 text-status-delivered border-status-delivered/20" },
      transit: { icon: Clock, label: "In Transit", className: "bg-status-transit/10 text-status-transit border-status-transit/20" },
      pending: { icon: AlertCircle, label: "Pending", className: "bg-status-pending/10 text-status-pending border-status-pending/20" },
      cancelled: { icon: XCircle, label: "Cancelled", className: "bg-status-cancelled/10 text-status-cancelled border-status-cancelled/20" }
    };

    const badge = badges[status as keyof typeof badges] || badges.pending;
    const Icon = badge.icon;

    return (
      <Badge variant="outline" className={`gap-1 ${badge.className}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="bg-gradient-to-r from-blujay-dark to-blujay-light rounded-xl p-6 text-white shadow-lg flex-1">
            <h1 className="text-3xl font-bold mb-2">Shipment Management</h1>
            <p className="text-white/80">Track and manage all shipments across your network</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="bg-white" onClick={() => fetchShipments()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" className="bg-white">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <CardTitle>All Shipments ({shipments.length})</CardTitle>

              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {/* Search */}
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search ID or Client..."
                    className="pl-8 focus-visible:ring-primary"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Status Filter */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>

                {/* Courier Filter */}
                <Select value={courierFilter} onValueChange={setCourierFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Courier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Couriers</SelectItem>
                    <SelectItem value="DTDC">DTDC</SelectItem>
                    <SelectItem value="Blue Dart">Blue Dart</SelectItem>
                    <SelectItem value="Delhivery">Delhivery</SelectItem>
                    <SelectItem value="India Post">India Post</SelectItem>
                    <SelectItem value="Ecom Express">Ecom Express</SelectItem>
                    <SelectItem value="Shadowfax">Shadowfax</SelectItem>
                  </SelectContent>
                </Select>

                {/* Client Filter */}
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && shipments.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                <p className="mt-4 text-muted-foreground">Loading shipments...</p>
              </div>
            ) : shipments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No shipments found matching your filters.</p>
                <Button variant="link" onClick={() => {
                  setStatusFilter("all");
                  setClientFilter("all");
                  setCourierFilter("all");
                  setSearchQuery("");
                }}>
                  Clear all filters
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[100px]">ID</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Origin / Dest</TableHead>
                      <TableHead>Courier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shipments.map((shipment) => (
                      <TableRow key={shipment.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono font-medium text-xs">
                          {shipment.id ? shipment.id.substring(0, 8).toUpperCase() : "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{shipment.clientName}</span>
                            <span className="text-xs text-muted-foreground capitalize">{shipment.clientType}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {shipment.createdAt?.toDate ? format(shipment.createdAt.toDate(), "MMM d, yyyy") : "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs">
                            <span className="text-muted-foreground">From: <span className="text-foreground">{shipment.origin?.city}</span></span>
                            <span className="text-muted-foreground">To: <span className="text-foreground">{shipment.destination?.city}</span></span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal text-xs bg-muted">
                            {shipment.courier}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                        <TableCell className="text-right font-semibold text-sm">
                          ₹{shipment.chargedAmount}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem className="cursor-pointer">
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="cursor-pointer">Download Label</DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer">Track Shipment</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Shipments;
