'use client';

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
    Package,
    MapPin,
    Truck,
    Info,
    Globe,
    Building2,
    PhoneCall,
    UserCircle,
    BadgeCheck,
    Loader2,
    Star,
    Wallet,
    Calculator
} from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/contexts/AuthContext";
import { createShipment } from "@/services/shipmentService";
import { saveDefaultPickupAddress, getDefaultPickupAddress } from "@/services/clientService";
import { blueDartService } from "@/services/blueDartService";
import { BLUEDART_PREDEFINED } from "@/config/bluedartConfig";

const PremiumInput = ({ label, icon: Icon, placeholder, value, onChange, type = "text" }: any) => (
    <div className="space-y-2 group text-left">
        <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors flex items-center gap-2">
            <Icon className="h-3 w-3" /> {label}
        </Label>
        <div className="relative">
            <Input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-12 bg-white border-2 border-muted focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl transition-all font-medium text-foreground placeholder:text-muted-foreground/50 shadow-sm"
            />
        </div>
    </div>
);

// Simple pricing formula: base rate + per kg rate
const calculatePrice = (weight: number) => {
    const baseRate = 50;
    const perKgRate = 30;
    return Math.round(baseRate + (weight * perKgRate));
};

const AddShipment = () => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [savingDefault, setSavingDefault] = useState(false);

    // Form States - Pickup starts empty (will load from saved default)
    const [pickup, setPickup] = useState({ name: "", phone: "", pincode: "", address: "", city: "", state: "", country: "India" });
    // Delivery always starts empty
    const [delivery, setDelivery] = useState({ name: "", phone: "", pincode: "", address: "", city: "", state: "", country: "India" });
    const [dimensions, setDimensions] = useState({ length: "10", width: "10", height: "10" });
    const [actualWeight, setActualWeight] = useState("0.5");
    const [commodity, setCommodity] = useState({ description: "", value: "" });

    const router = useRouter();
    const { deductMoney } = useWallet();
    const { currentUser } = useAuth();

    // Load saved default pickup address on mount
    useEffect(() => {
        const loadDefaultPickup = async () => {
            if (currentUser?.id) {
                const savedAddress = await getDefaultPickupAddress(currentUser.id);
                if (savedAddress) {
                    setPickup(savedAddress);
                }
            }
        };
        loadDefaultPickup();
    }, [currentUser?.id]);

    // Save pickup address as default
    const handleSetAsDefault = async () => {
        if (!currentUser?.id) {
            toast.error("Please login to save default address");
            return;
        }
        if (!pickup.name || !pickup.phone || !pickup.pincode || !pickup.address) {
            toast.error("Please fill in all pickup fields first");
            return;
        }
        setSavingDefault(true);
        try {
            await saveDefaultPickupAddress(currentUser.id, pickup);
            toast.success("Default pickup address saved!", {
                description: "This address will be auto-filled next time."
            });
        } catch {
            toast.error("Failed to save default address");
        } finally {
            setSavingDefault(false);
        }
    };

    const weights = useMemo(() => {
        const l = parseFloat(dimensions.length);
        const w = parseFloat(dimensions.width);
        const h = parseFloat(dimensions.height);
        const volumetric = (!isNaN(l) && !isNaN(w) && !isNaN(h)) ? Number(((l * w * h) / 5000).toFixed(2)) : 0;
        const actual = parseFloat(actualWeight) || 0;
        const billable = Math.max(volumetric, actual);
        return { volumetric, actual, billable };
    }, [dimensions, actualWeight]);

    const estimatedPrice = useMemo(() => calculatePrice(weights.billable), [weights.billable]);

    // STEP 1: Validate addresses and move to package step
    const handleRouteNext = async () => {
        // Validate pickup
        if (!pickup.name || !pickup.phone || !pickup.pincode || !pickup.address) {
            toast.error("Please fill all pickup address fields");
            return;
        }
        // Validate delivery
        if (!delivery.name || !delivery.phone || !delivery.pincode || !delivery.address) {
            toast.error("Please fill all delivery address fields");
            return;
        }
        // Validate pincodes are 6 digits
        if (!/^\d{6}$/.test(pickup.pincode)) {
            toast.error("Pickup pincode must be 6 digits");
            return;
        }
        if (!/^\d{6}$/.test(delivery.pincode)) {
            toast.error("Delivery pincode must be 6 digits");
            return;
        }

        toast.success("Addresses verified!");
        setStep(2);
    };

    // Helper: Format mobile number for Blue Dart (10-15 digits, numbers only)
    const formatMobile = (phone: string) => {
        // Remove all non-numeric characters
        const cleaned = phone.replace(/\D/g, '');
        // If it starts with 91 and is 12 digits, keep it.
        // If it is 10 digits, keep it.
        // If it has leading 0, strip it if total length > 10? Blue Dart handles 0 usually.
        // Safest: strict 10-15 numeric string.
        return cleaned;
    };

    // STEP 2: Book directly (no partner selection needed)
    const handleBook = async () => {
        if (!weights.billable || weights.billable <= 0) {
            toast.error("Please enter valid weight");
            return;
        }
        if (!commodity.value || parseFloat(commodity.value) <= 0) {
            toast.error("Please enter commodity value");
            return;
        }

        // Validate Phone Numbers strictly before API Call
        const cleanReceiverMobile = formatMobile(delivery.phone);
        const cleanSenderMobile = formatMobile(pickup.phone);

        if (cleanReceiverMobile.length < 10 || cleanReceiverMobile.length > 15) {
            toast.error("Receiver Phone must be 10-15 digits");
            return;
        }
        if (cleanSenderMobile.length < 10 || cleanSenderMobile.length > 15) {
            toast.error("Sender Phone must be 10-15 digits");
            return;
        }

        setLoading(true);
        try {
            const referenceNo = `ORDER ${Date.now().toString().slice(-6)}`;

            // 1. Generate Blue Dart Waybill via API
            toast.info("Generating Blue Dart Waybill...");

            // Construct Blue Dart Payload
            const blueDartPayload = {
                Request: {
                    Consignee: {
                        ConsigneeName: delivery.name,
                        ConsigneeAddress1: delivery.address.slice(0, 30), // Max 30 chars per line
                        ConsigneeAddress2: delivery.address.slice(30, 60) || "",
                        ConsigneeAddress3: delivery.city,
                        ConsigneePincode: delivery.pincode,
                        ConsigneeMobile: cleanReceiverMobile,
                        ConsigneeTelephone: cleanReceiverMobile,
                        ConsigneeAttention: delivery.name
                    },
                    Shipper: {
                        CustomerName: BLUEDART_PREDEFINED.shipperName,
                        CustomerCode: BLUEDART_PREDEFINED.billingCustomerCode,
                        CustomerAddress1: BLUEDART_PREDEFINED.pickupAddress.slice(0, 30),
                        CustomerAddress2: BLUEDART_PREDEFINED.pickupAddress.slice(30, 60) || "",
                        CustomerAddress3: "HYD",
                        CustomerPincode: BLUEDART_PREDEFINED.pickupPincode,
                        CustomerMobile: BLUEDART_PREDEFINED.senderMobile, // Keep billing contact as is (or strict format it too?)
                        CustomerTelephone: BLUEDART_PREDEFINED.senderMobile,
                        OriginArea: BLUEDART_PREDEFINED.billingArea,
                        Sender: pickup.name || BLUEDART_PREDEFINED.senderName,
                        IsToPayCustomer: false
                    },
                    Services: {
                        ProductCode: BLUEDART_PREDEFINED.productCode,
                        // SubProductCode removed entirely for Domestic
                        ProductType: 0,
                        PieceCount: "1",
                        PackType: "", // Empty for default (or 'P' if required)
                        ActualWeight: weights.actual.toString(),
                        Dimensions: [
                            {
                                Length: dimensions.length,
                                Breadth: dimensions.width,
                                Height: dimensions.height,
                                Count: "1"
                            }
                        ],
                        CollectableAmount: 0,
                        DeclaredValue: parseFloat(commodity.value) || 200,
                        CreditReferenceNo: referenceNo,
                        PickupDate: `/Date(${new Date().getTime() + 24 * 60 * 60 * 1000})/`, // Tomorrow
                        PickupTime: BLUEDART_PREDEFINED.pickupTime,
                        PDFOutputNotRequired: false,
                        Commodity: {
                            CommodityDetail1: commodity.description
                        }
                    }
                }
            };

            let awbNo = "";
            let blueDartStatus = "Pending";
            let destinationArea = "";
            let destinationLocation = "";
            let tokenNumber = "";

            try {
                // Call API via Client Service which wraps the API route
                const apiResponse = await blueDartService.generateWaybill(blueDartPayload);

                // Inspect Response structure carefully
                const responseData = apiResponse?.GenerateWayBillResult || apiResponse;
                const statusBlock = responseData?.Status?.[0] || {};

                if (responseData?.IsError === false) {
                    awbNo = responseData.AWBNo;
                    destinationArea = responseData.DestinationArea || "";
                    destinationLocation = responseData.DestinationLocation || "";
                    tokenNumber = responseData.TokenNumber || "";
                    blueDartStatus = "Generated";
                    toast.success(`Waybill Generated: ${awbNo}`);
                } else {
                    // Handle Validation Errors
                    const errorMessage = statusBlock.StatusInformation || "Unknown Blue Dart Error";
                    console.error("Blue Dart Error:", responseData);
                    throw new Error(`Blue Dart Error: ${errorMessage}`);
                }
            } catch (apiError: any) {
                console.error("API Call Failed:", apiError);
                // Extract detailed error if available
                const detail = apiError.response?.data?.details || apiError.response?.data || apiError.message;
                const detailString = typeof detail === 'object' ? JSON.stringify(detail) : detail;
                console.error("Detailed API Error:", detail);
                throw new Error("Blue Dart Booking Failed: " + detailString);
            }

            // 2. Save Shipment to Firestore
            await createShipment({
                clientId: currentUser?.id || 'guest',
                clientName: currentUser?.name || pickup.name,
                clientType: 'franchise',
                courier: 'Blue Dart',
                status: 'pending',

                // Origin details
                origin: {
                    city: pickup.city,
                    state: pickup.state,
                    pincode: pickup.pincode,
                    address: pickup.address,
                    phone: pickup.phone,
                    name: pickup.name,
                },

                // Destination details
                destination: {
                    city: delivery.city,
                    state: delivery.state,
                    pincode: delivery.pincode,
                    address: delivery.address,
                    phone: delivery.phone,
                    name: delivery.name,
                },

                // Package details
                weight: weights.billable,
                dimensions: {
                    length: parseFloat(dimensions.length) || 0,
                    width: parseFloat(dimensions.width) || 0,
                    height: parseFloat(dimensions.height) || 0,
                },

                // Financial
                courierCharge: estimatedPrice,
                chargedAmount: estimatedPrice,
                marginAmount: 0,

                // BlueDart Excel Fields - Pre-filled
                referenceNo,
                billingArea: BLUEDART_PREDEFINED.billingArea,
                billingCustomerCode: BLUEDART_PREDEFINED.billingCustomerCode,
                pickupTime: BLUEDART_PREDEFINED.pickupTime,
                shipperName: BLUEDART_PREDEFINED.shipperName,
                pickupAddress: pickup.address,
                pickupPincode: pickup.pincode,

                // Receiver details
                companyName: delivery.name,
                receiverName: delivery.name,
                receiverMobile: delivery.phone,

                // Sender details
                senderName: pickup.name,
                senderMobile: pickup.phone,

                // Product details
                productCode: BLUEDART_PREDEFINED.productCode,
                productType: BLUEDART_PREDEFINED.productType,
                pieceCount: BLUEDART_PREDEFINED.defaultPieceCount,
                actualWeight: weights.actual,
                declaredValue: parseFloat(commodity.value) || BLUEDART_PREDEFINED.defaultDeclaredValue,

                // Commodity
                commodityDetail1: commodity.description,

                // Times
                officeClosureTime: BLUEDART_PREDEFINED.officeClosureTime,

                // Generated Fields
                awbNo: awbNo,
                blueDartStatus: blueDartStatus,
                destinationArea: destinationArea,
                destinationLocation: destinationLocation,
                tokenNumber: tokenNumber,
            });

            deductMoney(estimatedPrice);

            toast.success("Shipment Booked Successfully!", {
                description: `Reference: ${referenceNo} | AWB: ${awbNo}`,
            });

            setTimeout(() => router.push("/client-shipments"), 1500);

        } catch (error: any) {
            console.error('Shipment creation error:', error);
            toast.error("Booking Failed", { description: error.message || "Could not create shipment" });
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => setStep(1);

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
            {/* Header */}
            <div className="relative text-center space-y-3">
                <div className="inline-flex p-3 rounded-2xl bg-primary/5 border border-primary/10">
                    <Truck className="h-7 w-7 text-primary" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter text-foreground">
                    Book <span className="text-primary">Shipment</span>
                </h1>
                <p className="text-muted-foreground font-medium">Simple 2-step booking</p>
            </div>

            {/* 2-Step Progress */}
            <div className="flex justify-center items-center gap-8 max-w-md mx-auto">
                {[1, 2].map((s) => (
                    <div key={s} className="flex items-center gap-3">
                        <div className={`
                            w-12 h-12 rounded-xl flex items-center justify-center border-3 transition-all
                            ${step === s ? "bg-primary border-primary shadow-lg scale-110" :
                                step > s ? "bg-primary border-primary" : "bg-white border-muted"}
                        `}>
                            {step > s ? <BadgeCheck className="h-6 w-6 text-white" /> :
                                <span className={`text-lg font-black ${step === s ? "text-white" : "text-muted-foreground"}`}>{s}</span>}
                        </div>
                        <span className={`text-xs font-bold uppercase tracking-wider ${step >= s ? "text-primary" : "text-muted-foreground"}`}>
                            {s === 1 ? "Addresses" : "Package & Book"}
                        </span>
                        {s === 1 && <div className={`w-16 h-1 rounded ${step > 1 ? "bg-primary" : "bg-muted"}`} />}
                    </div>
                ))}
            </div>

            {/* Form Card */}
            <Card className="border-none shadow-2xl rounded-[32px] overflow-hidden bg-white/80 backdrop-blur-xl">
                <CardContent className="p-0">
                    {/* STEP 1: Addresses */}
                    {step === 1 && (
                        <div className="animate-in fade-in duration-500">
                            <div className="grid grid-cols-1 lg:grid-cols-2">
                                {/* Pickup */}
                                <div className="p-8 lg:p-10 space-y-6 border-r border-muted/30">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                                                From
                                            </span>
                                            <h2 className="text-2xl font-black mt-2">Pickup Address</h2>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSetAsDefault}
                                            disabled={savingDefault}
                                            className="h-8 gap-1.5 text-xs font-bold"
                                        >
                                            {savingDefault ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                                            Set Default
                                        </Button>
                                    </div>
                                    <div className="grid gap-4">
                                        <PremiumInput label="Name *" icon={UserCircle} placeholder="Contact name" value={pickup.name} onChange={(v: any) => setPickup({ ...pickup, name: v })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <PremiumInput label="Phone *" icon={PhoneCall} placeholder="10 digits" value={pickup.phone} onChange={(v: any) => setPickup({ ...pickup, phone: v })} />
                                            <PremiumInput label="Pincode *" icon={MapPin} placeholder="6 digits" value={pickup.pincode} onChange={(v: any) => setPickup({ ...pickup, pincode: v })} />
                                        </div>
                                        <PremiumInput label="Address *" icon={Building2} placeholder="Full address" value={pickup.address} onChange={(v: any) => setPickup({ ...pickup, address: v })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <PremiumInput label="City" icon={Globe} placeholder="City" value={pickup.city} onChange={(v: any) => setPickup({ ...pickup, city: v })} />
                                            <PremiumInput label="State" icon={Globe} placeholder="State" value={pickup.state} onChange={(v: any) => setPickup({ ...pickup, state: v })} />
                                        </div>
                                    </div>
                                </div>

                                {/* Delivery */}
                                <div className="p-8 lg:p-10 space-y-6 bg-muted/5">
                                    <div>
                                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 text-[10px] font-bold uppercase tracking-wider">
                                            To
                                        </span>
                                        <h2 className="text-2xl font-black mt-2">Delivery Address</h2>
                                    </div>
                                    <div className="grid gap-4">
                                        <PremiumInput label="Receiver Name *" icon={UserCircle} placeholder="Receiver's name" value={delivery.name} onChange={(v: any) => setDelivery({ ...delivery, name: v })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <PremiumInput label="Mobile *" icon={PhoneCall} placeholder="10 digits" value={delivery.phone} onChange={(v: any) => setDelivery({ ...delivery, phone: v })} />
                                            <PremiumInput label="Pincode *" icon={MapPin} placeholder="6 digits" value={delivery.pincode} onChange={(v: any) => setDelivery({ ...delivery, pincode: v })} />
                                        </div>
                                        <PremiumInput label="Address *" icon={Building2} placeholder="Complete address" value={delivery.address} onChange={(v: any) => setDelivery({ ...delivery, address: v })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <PremiumInput label="City" icon={Globe} placeholder="City" value={delivery.city} onChange={(v: any) => setDelivery({ ...delivery, city: v })} />
                                            <PremiumInput label="State" icon={Globe} placeholder="State" value={delivery.state} onChange={(v: any) => setDelivery({ ...delivery, state: v })} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Package & Book */}
                    {step === 2 && (
                        <div className="p-8 lg:p-10 animate-in fade-in duration-500">
                            <div className="max-w-3xl mx-auto space-y-8">
                                <div className="text-center">
                                    <h2 className="text-3xl font-black">Package Details</h2>
                                    <p className="text-muted-foreground text-sm mt-1">Enter weight and commodity details</p>
                                </div>

                            </div>
                            {/* Left: Package inputs */}
                            <div className="space-y-6">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Length (cm)</Label>
                                        <Input type="number" value={dimensions.length} onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })} className="h-14 text-xl font-bold text-center rounded-xl border-2" />
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Width (cm)</Label>
                                        <Input type="number" value={dimensions.width} onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })} className="h-14 text-xl font-bold text-center rounded-xl border-2" />
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Height (cm)</Label>
                                        <Input type="number" value={dimensions.height} onChange={(e) => setDimensions({ ...dimensions, height: e.target.value })} className="h-14 text-xl font-bold text-center rounded-xl border-2" />
                                    </div>
                                </div>

                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
                                        <Package className="h-3 w-3" /> Actual Weight (kg) *
                                    </Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 0.5"
                                        value={actualWeight}
                                        onChange={(e) => setActualWeight(e.target.value)}
                                        className="h-14 text-xl font-bold rounded-xl border-2 pl-5"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Commodity</Label>
                                        <Input
                                            placeholder="e.g. Electronics"
                                            value={commodity.description}
                                            onChange={(e) => setCommodity({ ...commodity, description: e.target.value })}
                                            className="h-12 rounded-xl border-2"
                                        />
                                    </div>
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
                                            <Info className="h-3 w-3" /> Value (₹) *
                                        </Label>
                                        <Input
                                            type="number"
                                            placeholder="e.g. 500"
                                            value={commodity.value}
                                            onChange={(e) => setCommodity({ ...commodity, value: e.target.value })}
                                            className="h-12 rounded-xl border-2"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="p-6 lg:p-8 bg-white/90 border-t flex justify-between items-center">
                        <Button variant="ghost" onClick={handleBack} disabled={step === 1 || loading} className="h-12 px-6 font-bold">
                            Back
                        </Button>

                        {step === 1 ? (
                            <Button onClick={handleRouteNext} className="h-14 px-10 rounded-full bg-primary font-bold text-lg">
                                Continue to Package
                            </Button>
                        ) : (
                            <Button onClick={handleBook} disabled={loading} className="h-14 px-10 rounded-full bg-primary font-bold text-lg gap-2">
                                {loading ? <Loader2 className="animate-spin" /> : <Truck className="h-5 w-5" />}
                                Book Shipment
                            </Button>
                        )}
                    </div>
                </CardContent >
            </Card >
        </div >
    );
};

export default AddShipment;
