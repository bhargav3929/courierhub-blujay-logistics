import { Link } from "react-router-dom";
import { ClientDashboardLayout } from "@/layouts/ClientDashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, UserPlus, Mail, Phone, MapPin, Package, ChevronRight, Plus, User, MoreHorizontal } from "lucide-react";

const customers = [
    { id: 1, name: "Rahul Sharma", email: "rahul@example.com", phone: "+91 98765 43210", address: "Mumbai, Maharashtra", totalShipments: 12, lastOrder: "2 days ago" },
    { id: 2, name: "Priya Patel", email: "priya@example.com", phone: "+91 91234 56789", address: "Bangalore, Karnataka", totalShipments: 8, lastOrder: "5 days ago" },
    { id: 3, name: "Amit Kumar", email: "amit@example.com", phone: "+91 88888 77777", address: "Delhi, NCR", totalShipments: 24, lastOrder: "Today" },
    { id: 4, name: "Sneha Reddy", email: "sneha@example.com", phone: "+91 77777 66666", address: "Hyderabad, Telangana", totalShipments: 5, lastOrder: "1 week ago" },
];

const ClientClients = () => {
    return (
        <ClientDashboardLayout>
            <div className="space-y-8 animate-in fade-in duration-700">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">My Customers</h1>
                        <p className="text-muted-foreground">Manage your shipping contacts and address book</p>
                    </div>
                    <div className="flex gap-3">
                        <Link to="/add-shipment">
                            <button className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-primary/20 transition-all">
                                <Plus className="h-4 w-4" /> Book For New Customer
                            </button>
                        </Link>
                        <button className="flex items-center gap-2 px-6 py-2.5 bg-white border-2 border-muted hover:border-primary/50 text-foreground rounded-xl text-sm font-bold transition-all">
                            <UserPlus className="h-4 w-4" /> Add Address
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input placeholder="Search by name, email or phone..." className="pl-12 bg-white border-none h-14 shadow-md rounded-2xl" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {customers.map((customer) => (
                        <Card key={customer.id} className="border-none shadow-md hover:shadow-2xl transition-all duration-300 group overflow-hidden bg-white/50 backdrop-blur-sm">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="h-16 w-16 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl flex items-center justify-center text-primary border border-primary/10 group-hover:bg-primary group-hover:text-white transition-all duration-300 shadow-inner">
                                        <User className="h-8 w-8" />
                                    </div>
                                    <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                                        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-xl font-bold tracking-tight">{customer.name}</h3>
                                        <div className="flex items-center gap-1 mt-1 text-primary">
                                            <span className="text-xs font-black uppercase tracking-widest">{customer.totalShipments} Total Shipments</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                            <Mail className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{customer.email}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                            <Phone className="h-4 w-4 shrink-0" />
                                            <span>{customer.phone}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                            <MapPin className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{customer.address}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 pt-6 border-t border-dashed border-muted-foreground/20">
                                    <Link to="/add-shipment">
                                        <button className="w-full py-2.5 rounded-xl border-2 border-primary/20 text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all duration-300">
                                            Create Shipment
                                        </button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </ClientDashboardLayout>
    );
};

export default ClientClients;
