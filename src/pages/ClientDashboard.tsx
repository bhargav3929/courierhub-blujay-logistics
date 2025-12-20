import { ClientDashboardLayout } from "@/layouts/ClientDashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Package,
    Wallet,
    TrendingUp,
    CheckCircle,
    Clock,
    AlertCircle,
    Truck,
    ArrowUpRight,
    Plus
} from "lucide-react";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from "recharts";
import { useWallet } from "@/hooks/useWallet";

const shippingTrendData = [
    { day: "Mon", bookings: 12 },
    { day: "Tue", bookings: 19 },
    { day: "Wed", bookings: 15 },
    { day: "Thu", bookings: 22 },
    { day: "Fri", bookings: 30 },
    { day: "Sat", bookings: 25 },
    { day: "Sun", bookings: 31 }
];

const courierPerformanceData = [
    { name: "Delhivery", rate: 94 },
    { name: "Blue Dart", rate: 98 },
    { name: "DTDC", rate: 92 },
    { name: "India Post", rate: 85 },
];

const recentShipments = [
    { id: "BLJ-SHP-9021", receiver: "Rahul Sharma", courier: "Delhivery", status: "transit", weight: "1.2kg", cost: 145 },
    { id: "BLJ-SHP-9022", receiver: "Priya Patel", courier: "Blue Dart", status: "delivered", weight: "0.5kg", cost: 210 },
    { id: "BLJ-SHP-9023", receiver: "Amit Kumar", courier: "DTDC", status: "pending", weight: "5.0kg", cost: 160 },
    { id: "BLJ-SHP-9024", receiver: "Sneha Reddy", courier: "Delhivery", status: "delivered", weight: "2.1kg", cost: 145 },
];

const getStatusStyle = (status: string) => {
    switch (status) {
        case "delivered": return "bg-status-delivered/10 text-status-delivered border-status-delivered/20";
        case "transit": return "bg-status-transit/10 text-status-transit border-status-transit/20";
        case "pending": return "bg-status-pending/10 text-status-pending border-status-pending/20";
        default: return "bg-muted text-muted-foreground";
    }
};

const ClientDashboard = () => {
    const { balance, addMoney } = useWallet();

    const statsCards = [
        {
            title: "Total Shipments",
            value: "154",
            change: "+18%",
            icon: Package,
            color: "text-primary"
        },
        {
            title: "Wallet Balance",
            value: `₹${balance.toLocaleString()}`,
            subtitle: "Instant credit available",
            icon: Wallet,
            color: "text-blujay-dark",
            action: true
        },
        {
            title: "In Transit",
            value: "12",
            change: "Active now",
            icon: Clock,
            color: "text-status-transit"
        },
        {
            title: "Expected Deliveries",
            value: "8",
            change: "Next 24h",
            icon: Truck,
            color: "text-status-delivered"
        }
    ];

    return (
        <ClientDashboardLayout>
            <div className="space-y-6 animate-in fade-in duration-700">
                {/* Page Header */}
                <div className="bg-gradient-to-r from-primary via-blujay-dark to-blujay-light rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden">
                    <div className="relative z-10">
                        <h1 className="text-4xl font-extrabold mb-2 tracking-tight">Merchant Dashboard</h1>
                        <p className="text-white/80 text-lg max-w-2xl">Overview of your shipping performance and wallet transactions.</p>
                        <div className="mt-6 flex flex-wrap gap-4">
                            <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-lg border border-white/30 text-sm font-medium">
                                Active Tier: <span className="text-secondary font-bold">Gold Merchant</span>
                            </div>
                            <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-lg border border-white/30 text-sm font-medium">
                                Next Payout: <span className="font-bold underline cursor-pointer">Tomorrow</span>
                            </div>
                            <button
                                onClick={() => addMoney(5000)}
                                className="bg-secondary text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:scale-105 transition-all text-sm flex items-center gap-2"
                            >
                                <Plus className="h-4 w-4" /> Quick Recharge ₹5000
                            </button>
                        </div>
                    </div>
                    {/* Abstract background shapes */}
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-secondary/20 rounded-full blur-3xl"></div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {statsCards.map((stat, index) => (
                        <Card key={index} className="border-none shadow-md hover:shadow-xl transition-all duration-300 group overflow-hidden">
                            <CardContent className="p-6 relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-3 rounded-xl bg-muted group-hover:bg-primary/10 transition-colors duration-300`}>
                                        <stat.icon className={`h-6 w-6 ${stat.color}`} />
                                    </div>
                                    {stat.change && (
                                        <span className="text-xs font-bold text-status-delivered bg-status-delivered/10 px-2 py-1 rounded-full flex items-center gap-1">
                                            <TrendingUp className="h-3 w-3" />
                                            {stat.change}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-col justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">{stat.title}</p>
                                        <h3 className="text-2xl font-bold">{stat.value}</h3>
                                        {stat.subtitle && (
                                            <p className="text-xs text-muted-foreground mt-1 italic">{stat.subtitle}</p>
                                        )}
                                    </div>
                                    {stat.action && (
                                        <button
                                            onClick={() => addMoney(1000)}
                                            className="mt-3 text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                        >
                                            <Plus className="h-3 w-3" /> Add ₹1000
                                        </button>
                                    )}
                                </div>
                                <div className="absolute bottom-0 right-0 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-300">
                                    <stat.icon className="h-20 w-20 -mr-4 -mb-4" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2 border-none shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-lg font-bold">Weekly Shipping Volume</CardTitle>
                            <button className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                                View detailed report <ArrowUpRight className="h-3 w-3" />
                            </button>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={shippingTrendData}>
                                        <defs>
                                            <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="bookings"
                                            stroke="hsl(var(--primary))"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorBookings)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-md">
                        <CardHeader>
                            <CardTitle className="text-lg font-bold">Courier Success Rate</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                {courierPerformanceData.map((courier, idx) => (
                                    <div key={idx} className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="font-semibold text-foreground/80">{courier.name}</span>
                                            <span className="text-primary font-bold">{courier.rate}%</span>
                                        </div>
                                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                            <div
                                                className="bg-primary h-full transition-all duration-500 rounded-full"
                                                style={{ width: `${courier.rate}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 p-4 bg-primary/5 rounded-xl border border-primary/10">
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    <span className="text-primary font-bold">Pro Tip:</span> Blue Dart consistently delivers faster to Metro areas for your account.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Shipments Table */}
                <Card className="border-none shadow-md overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 bg-muted/20">
                        <CardTitle className="text-lg font-bold">Recent Bookings</CardTitle>
                        <button className="text-sm px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                            Track All
                        </button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                                        <th className="px-6 py-4 font-bold">Order ID</th>
                                        <th className="px-6 py-4 font-bold">Receiver</th>
                                        <th className="px-6 py-4 font-bold">Courier</th>
                                        <th className="px-6 py-4 font-bold">Status</th>
                                        <th className="px-6 py-4 font-bold">Details</th>
                                        <th className="px-6 py-4 font-bold text-right">Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {recentShipments.map((shp) => (
                                        <tr key={shp.id} className="hover:bg-muted/20 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className="font-mono text-sm text-primary font-semibold">{shp.id}</span>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-sm">{shp.receiver}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">{shp.courier}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${getStatusStyle(shp.status)}`}>
                                                    {shp.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-muted-foreground">
                                                {shp.weight} | Express
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-foreground">
                                                ₹{shp.cost}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </ClientDashboardLayout>
    );
};

export default ClientDashboard;
