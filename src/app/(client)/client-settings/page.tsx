'use client';

import { useState, useEffect, useRef } from "react";
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
    Upload,
    Loader2,
    Trash2
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getBusinessProfile, saveBusinessProfile, BusinessProfile } from "@/services/clientService";
import { storage } from "@/lib/firebaseConfig";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const ClientSettings = () => {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [businessData, setBusinessData] = useState<BusinessProfile>({
        companyName: "",
        gstin: "",
        website: "",
        email: "",
        phone: "",
        pincode: "",
        address: "",
        city: "",
        state: "",
        country: "India"
    });

    // Load business profile on mount
    useEffect(() => {
        const loadProfile = async () => {
            if (!currentUser?.id) {
                setLoading(false);
                return;
            }
            try {
                const profile = await getBusinessProfile(currentUser.id);
                if (profile) {
                    setBusinessData(profile);
                } else {
                    // Pre-fill email from user if no profile exists
                    setBusinessData(prev => ({
                        ...prev,
                        email: currentUser.email || "",
                        companyName: currentUser.name || ""
                    }));
                }
            } catch (error) {
                console.error("Error loading profile:", error);
                toast.error("Failed to load profile settings");
            } finally {
                setLoading(false);
            }
        };
        loadProfile();
    }, [currentUser]);

    const handleSave = async () => {
        if (!currentUser?.id) {
            toast.error("Please login to save settings");
            return;
        }

        // Validate required fields
        if (!businessData.companyName.trim()) {
            toast.error("Company name is required");
            return;
        }
        if (!businessData.email.trim()) {
            toast.error("Business email is required");
            return;
        }

        setSaving(true);
        try {
            await saveBusinessProfile(currentUser.id, businessData);
            toast.success("Settings Saved Successfully", {
                description: "Your business profile has been updated."
            });
        } catch (error) {
            console.error("Error saving profile:", error);
            toast.error("Failed to save settings. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser?.id) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error("Please upload an image file (PNG, JPG, etc.)");
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            toast.error("Logo must be under 2MB");
            return;
        }

        setUploadingLogo(true);
        try {
            const storageRef = ref(storage, `logos/${currentUser.id}/logo`);
            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);

            const updatedData = { ...businessData, logoUrl: downloadUrl };
            setBusinessData(updatedData);
            await saveBusinessProfile(currentUser.id, updatedData);
            toast.success("Logo uploaded successfully");
        } catch (error) {
            console.error("Error uploading logo:", error);
            toast.error("Failed to upload logo. Please try again.");
        } finally {
            setUploadingLogo(false);
            // Reset file input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoveLogo = async () => {
        if (!currentUser?.id || !businessData.logoUrl) return;

        setUploadingLogo(true);
        try {
            const storageRef = ref(storage, `logos/${currentUser.id}/logo`);
            try { await deleteObject(storageRef); } catch { /* file may not exist */ }

            const updatedData = { ...businessData, logoUrl: undefined };
            setBusinessData(updatedData);
            await saveBusinessProfile(currentUser.id, updatedData);
            toast.success("Logo removed");
        } catch (error) {
            console.error("Error removing logo:", error);
            toast.error("Failed to remove logo");
        } finally {
            setUploadingLogo(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Portal Settings</h1>
                <p className="text-muted-foreground">Manage your business profile and default addresses.</p>
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
                        <CardContent className="p-8 text-center space-y-4">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="hidden"
                            />
                            <div
                                onClick={() => !uploadingLogo && fileInputRef.current?.click()}
                                className="w-32 h-32 mx-auto rounded-3xl bg-muted flex items-center justify-center border-4 border-dashed border-muted-foreground/20 group hover:border-primary/50 transition-all cursor-pointer overflow-hidden relative"
                            >
                                {uploadingLogo ? (
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                ) : businessData.logoUrl ? (
                                    <img src={businessData.logoUrl} alt="Business logo" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="bg-primary w-full h-full flex items-center justify-center text-white font-black text-xl">
                                        {businessData.companyName ? businessData.companyName.substring(0, 2).toUpperCase() : "BL"}
                                    </div>
                                )}
                                {!uploadingLogo && (
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Upload className="h-6 w-6 text-white" />
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground font-medium">
                                {businessData.logoUrl ? "Click to change logo" : "Click to upload logo"}
                            </p>
                            {businessData.logoUrl && (
                                <button
                                    onClick={handleRemoveLogo}
                                    disabled={uploadingLogo}
                                    className="text-xs text-destructive hover:underline flex items-center gap-1 mx-auto"
                                >
                                    <Trash2 className="h-3 w-3" /> Remove logo
                                </button>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-status-delivered/5 border-b border-status-delivered/10">
                            <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-status-delivered" /> Account Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-status-delivered/10 border border-status-delivered/20">
                                <div className="h-10 w-10 rounded-full bg-status-delivered flex items-center justify-center text-white">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-status-delivered">Active Account</p>
                                    <p className="text-xs text-muted-foreground">Credit billing enabled</p>
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
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Company Name *</Label>
                                    <Input
                                        value={businessData.companyName}
                                        onChange={e => setBusinessData({ ...businessData, companyName: e.target.value })}
                                        placeholder="Your company name"
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">GSTIN Number</Label>
                                    <Input
                                        value={businessData.gstin}
                                        onChange={e => setBusinessData({ ...businessData, gstin: e.target.value })}
                                        placeholder="e.g. 27AAAAA0000A1Z5"
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Business Email *</Label>
                                    <Input
                                        type="email"
                                        value={businessData.email}
                                        onChange={e => setBusinessData({ ...businessData, email: e.target.value })}
                                        placeholder="contact@yourcompany.com"
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Support Phone</Label>
                                    <Input
                                        value={businessData.phone}
                                        onChange={e => setBusinessData({ ...businessData, phone: e.target.value })}
                                        placeholder="+91 98765 43210"
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Website</Label>
                                    <Input
                                        value={businessData.website}
                                        onChange={e => setBusinessData({ ...businessData, website: e.target.value })}
                                        placeholder="https://yourcompany.com"
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-md">
                        <CardHeader>
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-secondary" /> Primary Business Address
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Full Street Address</Label>
                                    <Input
                                        value={businessData.address}
                                        onChange={e => setBusinessData({ ...businessData, address: e.target.value })}
                                        placeholder="123, Your Street, Area"
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Pincode</Label>
                                        <Input
                                            value={businessData.pincode}
                                            onChange={e => setBusinessData({ ...businessData, pincode: e.target.value })}
                                            placeholder="400001"
                                            className="h-12 rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">City</Label>
                                        <Input
                                            value={businessData.city}
                                            onChange={e => setBusinessData({ ...businessData, city: e.target.value })}
                                            placeholder="Mumbai"
                                            className="h-12 rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">State</Label>
                                        <Input
                                            value={businessData.state}
                                            onChange={e => setBusinessData({ ...businessData, state: e.target.value })}
                                            placeholder="Maharashtra"
                                            className="h-12 rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Country</Label>
                                        <Input
                                            value={businessData.country}
                                            onChange={e => setBusinessData({ ...businessData, country: e.target.value })}
                                            placeholder="India"
                                            className="h-12 rounded-xl"
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end">
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="h-16 px-12 rounded-2xl bg-primary text-white font-black uppercase tracking-[.2em] shadow-xl hover:scale-105 active:scale-95 transition-all text-xs"
                        >
                            {saving ? (
                                <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                            ) : (
                                <Save className="h-5 w-5 mr-3" />
                            )}
                            {saving ? "Saving..." : "Save All Changes"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientSettings;
