'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Building2,
    MapPin,
    Image as ImageIcon,
    ShieldCheck,
    Save,
    Upload
} from "lucide-react";
import { toast } from "sonner";

const ClientSettings = () => {
    const [businessData, setBusinessData] = useState({
        companyName: "Blujay Partner Pvt Ltd",
        gstin: "27AAAAA0000A1Z5",
        website: "https://blujay.io",
        email: "logistics@blujay.io",
        phone: "+91 98765 43210",
        // Pickup Address
        pincode: "400001",
        address: "123, Logic Heights, MIDC Road",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India"
    });

    const handleSave = () => {
        toast.success("Settings Saved Successfully", {
            description: "Your business profile and pickup address have been updated."
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Portal Settings</h1>
                <p className="text-muted-foreground">Manage your business profile, default addresses, and branding.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Profile & Logo */}
                <div className="space-y-8">
                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-primary/5 border-b border-primary/10">
                            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                <ImageIcon className="h-4 w-4 text-primary" /> Business Logo
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 text-center space-y-6">
                            <div className="w-32 h-32 mx-auto rounded-3xl bg-muted flex items-center justify-center border-4 border-dashed border-muted-foreground/20 group hover:border-primary/50 transition-all cursor-pointer overflow-hidden relative">
                                <div className="bg-blujay-dark w-full h-full flex items-center justify-center text-white font-black text-2xl">
                                    LOGO
                                </div>
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <Upload className="h-6 w-6 text-white" />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground font-medium">Recommended: 512x512px SVG or PNG</p>
                            <Button className="w-full bg-white border-2 border-muted hover:border-primary text-foreground font-bold rounded-xl h-12">
                                Change Logo
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-status-delivered/5 border-b border-status-delivered/10">
                            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-status-delivered" /> Account Verification
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-status-delivered/10 border border-status-delivered/20">
                                <div className="h-10 w-10 rounded-full bg-status-delivered flex items-center justify-center text-white">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-status-delivered">Verified Merchant</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Details Forms */}
                <div className="lg:col-span-2 space-y-8">
                    <Card className="border-none shadow-md">
                        <CardHeader>
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-primary" /> Business Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Company Name</Label>
                                    <Input value={businessData.companyName} onChange={e => setBusinessData({ ...businessData, companyName: e.target.value })} className="h-12 rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">GSTIN Number</Label>
                                    <Input value={businessData.gstin} onChange={e => setBusinessData({ ...businessData, gstin: e.target.value })} className="h-12 rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Business Email</Label>
                                    <Input value={businessData.email} onChange={e => setBusinessData({ ...businessData, email: e.target.value })} className="h-12 rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Support Phone</Label>
                                    <Input value={businessData.phone} onChange={e => setBusinessData({ ...businessData, phone: e.target.value })} className="h-12 rounded-xl" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-md">
                        <CardHeader>
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-secondary" /> Primary Pickup Address
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Full Street Address</Label>
                                    <Input value={businessData.address} onChange={e => setBusinessData({ ...businessData, address: e.target.value })} className="h-12 rounded-xl" />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Pincode</Label>
                                        <Input value={businessData.pincode} onChange={e => setBusinessData({ ...businessData, pincode: e.target.value })} className="h-12 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">City</Label>
                                        <Input value={businessData.city} onChange={e => setBusinessData({ ...businessData, city: e.target.value })} className="h-12 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">State</Label>
                                        <Input value={businessData.state} onChange={e => setBusinessData({ ...businessData, state: e.target.value })} className="h-12 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Country</Label>
                                        <Input value={businessData.country} onChange={e => setBusinessData({ ...businessData, country: e.target.value })} className="h-12 rounded-xl" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end">
                        <Button
                            onClick={handleSave}
                            className="h-16 px-12 rounded-2xl bg-primary text-white font-black uppercase tracking-[.2em] shadow-xl hover:scale-105 active:scale-95 transition-all text-xs"
                        >
                            <Save className="h-5 w-5 mr-3" /> Save All Changes
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientSettings;
