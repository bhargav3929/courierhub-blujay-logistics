import { useNavigate, Link } from "react-router-dom";
import { ClientDashboardLayout } from "@/layouts/ClientDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Filter, Download, ExternalLink, MoreVertical, Plus } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const shipments = [
    { id: "BLJ-SHP-9021", date: "19 Dec 2025", receiver: "Rahul Sharma", city: "Mumbai", courier: "Delhivery", status: "transit", weight: "1.2kg", cost: 145 },
    { id: "BLJ-SHP-9022", date: "18 Dec 2025", receiver: "Priya Patel", city: "Bangalore", courier: "Blue Dart", status: "delivered", weight: "0.5kg", cost: 210 },
    { id: "BLJ-SHP-9023", date: "18 Dec 2025", receiver: "Amit Kumar", city: "Delhi", courier: "DTDC", status: "pending", weight: "5.0kg", cost: 160 },
    { id: "BLJ-SHP-9024", date: "17 Dec 2025", receiver: "Sneha Reddy", city: "Hyderabad", courier: "Delhivery", status: "delivered", weight: "2.1kg", cost: 145 },
    { id: "BLJ-SHP-9025", date: "17 Dec 2025", receiver: "Vikram Singh", city: "Chennai", courier: "Ecom Express", status: "cancelled", weight: "1.0kg", cost: 0 },
    { id: "BLJ-SHP-9026", date: "16 Dec 2025", receiver: "Anjali Gupta", city: "Pune", courier: "XpressBees", status: "delivered", weight: "3.2kg", cost: 125 },
];

const getStatusStyle = (status: string) => {
    switch (status) {
        case "delivered": return "bg-status-delivered/10 text-status-delivered border-status-delivered/20";
        case "transit": return "bg-status-transit/10 text-status-transit border-status-transit/20";
        case "pending": return "bg-status-pending/10 text-status-pending border-status-pending/20";
        case "cancelled": return "bg-status-cancelled/10 text-status-cancelled border-status-cancelled/20";
        default: return "bg-muted text-muted-foreground";
    }
};

const ClientShipments = () => {
    return (
        <ClientDashboardLayout>
            <div className="space-y-8 animate-in fade-in duration-700">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">My Shipments</h1>
                        <p className="text-muted-foreground">Manage and track all your outgoing packages</p>
                    </div>
                    <div className="flex gap-3">
                        <button className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-muted hover:border-primary/50 rounded-xl text-sm font-bold transition-all text-foreground">
                            <Download className="h-4 w-4" /> Export CSV
                        </button>
                        <Link to="/add-shipment">
                            <button className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-primary/20 transition-all">
                                <Plus className="h-4 w-4" /> Book New Shipment
                            </button>
                        </Link>
                    </div>
                </div>

                <Card className="border-none shadow-xl bg-white overflow-hidden">
                    <CardHeader className="p-6 border-b">
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="relative w-full md:w-96">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search by ID, Receiver or City..." className="pl-10 bg-muted/30 border-none h-11" />
                            </div>
                            <div className="flex gap-2 w-full md:w-auto">
                                <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted rounded-lg text-sm font-medium transition-colors">
                                    <Filter className="h-4 w-4" /> Filters
                                </button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-muted/30 text-muted-foreground text-[10px] uppercase tracking-widest font-black">
                                        <th className="px-6 py-4">Shipment ID</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Receiver</th>
                                        <th className="px-6 py-4">Destination</th>
                                        <th className="px-6 py-4">Courier</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {shipments.map((shp) => (
                                        <tr key={shp.id} className="hover:bg-primary/[0.02] transition-colors group">
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-sm text-primary font-bold">{shp.id}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase">{shp.weight} | Express</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-sm font-medium">{shp.date}</td>
                                            <td className="px-6 py-5">
                                                <span className="font-bold text-sm block">{shp.receiver}</span>
                                                <span className="text-xs text-muted-foreground">{shp.city}</span>
                                            </td>
                                            <td className="px-6 py-5 text-sm">{shp.city}, IN</td>
                                            <td className="px-6 py-5">
                                                <span className="text-sm font-semibold">{shp.courier}</span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${getStatusStyle(shp.status)}`}>
                                                    {shp.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger className="p-2 hover:bg-muted rounded-lg transition-colors">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl">
                                                        <DropdownMenuItem className="flex items-center gap-2 cursor-pointer p-3 rounded-lg">
                                                            <ExternalLink className="h-4 w-4" /> Track Package
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="flex items-center gap-2 cursor-pointer p-3 rounded-lg">
                                                            <Download className="h-4 w-4" /> Invoice
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination Placeholder */}
                        <div className="p-6 border-t bg-muted/10 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">Showing 6 of 154 shipments</p>
                            <div className="flex gap-2">
                                <button className="px-3 py-1 bg-white border rounded text-xs disabled:opacity-50" disabled>Previous</button>
                                <button className="px-3 py-1 bg-white border rounded text-xs">Next</button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </ClientDashboardLayout>
    );
};

export default ClientShipments;
