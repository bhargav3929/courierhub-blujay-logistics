'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ShoppingBag,
    Globe,
    Search,
    CheckCircle2,
    Plus,
    Zap,
    Store,
    Puzzle
} from "lucide-react";
import { toast } from "sonner";

const platforms = [
    {
        id: "shopify",
        name: "Shopify",
        description: "Auto-sync orders, inventory and shipping status with your Shopify store.",
        icon: ShoppingBag,
        category: "E-commerce",
        status: "available",
        color: "bg-emerald-500",
        accent: "text-emerald-500",
        bg: "bg-emerald-500/10"
    },
    {
        id: "woocommerce",
        name: "WooCommerce",
        description: "Connect your WordPress store for seamless label generation and tracking.",
        icon: Store,
        category: "E-commerce",
        status: "available",
        color: "bg-purple-600",
        accent: "text-purple-600",
        bg: "bg-purple-600/10"
    },
    {
        id: "magento",
        name: "Magento 2",
        description: "Enterprise-grade integration for large scale Adobe Commerce stores.",
        icon: Globe,
        category: "E-commerce",
        status: "available",
        color: "bg-orange-600",
        accent: "text-orange-600",
        bg: "bg-orange-600/10"
    },
    {
        id: "amazon",
        name: "Amazon Seller",
        description: "Fulfill your Amazon orders directly through Blujay Logistics.",
        icon: ShoppingBag,
        category: "Marketplace",
        status: "available",
        color: "bg-amber-500",
        accent: "text-amber-500",
        bg: "bg-amber-500/10"
    },
    {
        id: "ebay",
        name: "eBay",
        description: "Global marketplace integration for international shipping and customs.",
        icon: Globe,
        category: "Marketplace",
        status: "available",
        color: "bg-blue-600",
        accent: "text-blue-600",
        bg: "bg-blue-600/10"
    }
];

const ClientIntegrations = () => {
    const [searchQuery, setSearchQuery] = useState("");

    const handleConnect = (appName: string) => {
        toast.info(`Initializing ${appName} Connection`, {
            description: "Redirecting to authentication portal..."
        });
    };

    const filteredPlatforms = platforms.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Store Integrations</h1>
                    <p className="text-muted-foreground">Connect your sales channels to automate order fulfillment.</p>
                </div>
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search platforms (Shopify, eBay...)"
                        className="pl-10 h-12 rounded-xl border-2 focus:border-primary shadow-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Featured Integration */}
            <Card className="border-none shadow-xl bg-gradient-to-r from-primary to-blujay-dark text-white overflow-hidden relative">
                <CardContent className="p-10 relative z-10 flex flex-col md:flex-row items-center gap-10">
                    <div className="bg-white/20 p-6 rounded-[32px] backdrop-blur-xl border border-white/30">
                        <Zap className="h-16 w-16 text-secondary" />
                    </div>
                    <div className="space-y-4 flex-1 text-center md:text-left">
                        <h2 className="text-4xl font-black tracking-tight">One-Click Automation</h2>
                        <p className="text-white/80 text-lg font-medium max-w-2xl">
                            Connect your Shopify store today and get **Flat 10% Off** on all Air Express shipments for the first 30 days.
                        </p>
                        <Button className="h-14 px-8 rounded-2xl bg-white text-primary font-black uppercase tracking-widest hover:bg-secondary hover:text-white transition-all">
                            Setup Shopify Now
                        </Button>
                    </div>
                </CardContent>
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
            </Card>

            {/* Integration Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredPlatforms.map((platform) => (
                    <Card key={platform.id} className="border-none shadow-md hover:shadow-2xl transition-all duration-500 group overflow-hidden flex flex-col">
                        <div className={`h-2 ${platform.color}`} />
                        <CardHeader className="space-y-4">
                            <div className="flex justify-between items-start">
                                <div className={`p-4 rounded-2xl ${platform.bg}`}>
                                    <platform.icon className={`h-8 w-8 ${platform.accent}`} />
                                </div>
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-black">{platform.name}</CardTitle>
                                <CardDescription className="text-xs font-bold uppercase tracking-wider text-primary/60 mt-1">
                                    {platform.category}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 flex-1 flex flex-col">
                            <p className="text-sm text-muted-foreground font-medium leading-relaxed flex-1">
                                {platform.description}
                            </p>
                            <div className="pt-4 border-t border-muted/30">
                                {platform.status === 'connected' ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                                            <CheckCircle2 className="h-4 w-4" /> Active
                                        </div>
                                        <Button variant="ghost" size="sm" className="font-bold underline text-xs">Manage</Button>
                                    </div>
                                ) : platform.status === 'available' ? (
                                    <Button
                                        onClick={() => handleConnect(platform.name)}
                                        className="w-full h-12 rounded-xl font-black uppercase tracking-widest group-hover:bg-primary transition-all"
                                    >
                                        Connect <Plus className="h-4 w-4 ml-2" />
                                    </Button>
                                ) : (
                                    <Button disabled className="w-full h-12 rounded-xl font-black uppercase tracking-widest opacity-50">
                                        Notify Me
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {/* Custom API Webhook */}
                <Card className="border-none shadow-md border-2 border-dashed border-muted flex flex-col items-center justify-center p-10 text-center space-y-6 hover:border-primary/50 transition-all cursor-pointer group">
                    <div className="p-6 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                        <Puzzle className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black">Custom Integration</h3>
                        <p className="text-sm text-muted-foreground mt-2">Integrate via Webhooks or our Developer API.</p>
                    </div>
                    <Button variant="outline" className="rounded-xl font-bold">Explore Docs</Button>
                </Card>
            </div>
        </div>
    );
};

export default ClientIntegrations;
