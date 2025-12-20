import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ClientDashboardLayout } from "@/layouts/ClientDashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
    Package,
    MapPin,
    Truck,
    Wallet,
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    Info,
    ShieldCheck,
    Clock,
    Calculator,
    Globe,
    Building2,
    PhoneCall,
    UserCircle,
    BadgeCheck
} from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@/hooks/useWallet";

const indianCouriers = [
    { id: "delhivery", name: "Delhivery Express", price: 145, time: "2-3 Days", rating: 4.5, features: ["Fastest", "B2B Expert"] },
    { id: "bluedart", name: "Blue Dart Apex", price: 210, time: "1-2 Days", rating: 4.8, features: ["Air Express", "Premium"] },
    { id: "dtdc", name: "DTDC Premium", price: 160, time: "2-3 Days", rating: 4.2, features: ["Reliable", "Tracking"] },
    { id: "ecom", name: "Ecom Express", price: 130, time: "4-5 Days", rating: 3.9, features: ["Budget Friendly"] },
    { id: "xpressbees", name: "XpressBees", price: 125, time: "3-4 Days", rating: 4.0, features: ["Pan India"] },
];

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

const AddShipment = () => {
    const [step, setStep] = useState(1);
    const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
    const navigate = useNavigate();
    const { balance, deductMoney } = useWallet();

    const [dimensions, setDimensions] = useState({ length: "", width: "", height: "" });
    const [actualWeight, setActualWeight] = useState("");
    const [pickup, setPickup] = useState({ name: "", phone: "", pincode: "", address: "", city: "", state: "", country: "India" });
    const [delivery, setDelivery] = useState({ name: "", phone: "", pincode: "", address: "", city: "", state: "", country: "India" });

    const weights = useMemo(() => {
        const l = parseFloat(dimensions.length);
        const w = parseFloat(dimensions.width);
        const h = parseFloat(dimensions.height);
        const volumetric = (!isNaN(l) && !isNaN(w) && !isNaN(h)) ? Number(((l * w * h) / 5000).toFixed(2)) : 0;
        const actual = parseFloat(actualWeight) || 0;
        const billable = Math.max(volumetric, actual);

        return { volumetric, actual, billable };
    }, [dimensions, actualWeight]);

    const handleNext = () => setStep(prev => prev + 1);
    const handleBack = () => setStep(prev => prev - 1);

    const handleComplete = () => {
        const courier = indianCouriers.find(c => c.id === selectedCourier);
        if (courier) {
            const success = deductMoney(courier.price);
            if (success) {
                toast.success("Shipment Booked Successfully!", {
                    description: `Deducted ₹${courier.price}. Tracking ID: BLJ-${Math.floor(100000 + Math.random() * 900000)}`,
                });
                setTimeout(() => navigate("/client-shipments"), 2000);
            } else {
                toast.error("Low Wallet Balance!", {
                    description: "Please top up your wallet to book this shipment.",
                });
            }
        }
    };

    const currentCourier = indianCouriers.find(c => c.id === selectedCourier);

    return (
        <ClientDashboardLayout>
            <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 pb-20">
                {/* Dynamic Header */}
                <div className="relative text-center space-y-4">
                    <div className="inline-flex p-3 rounded-2xl bg-primary/5 border border-primary/10 mb-2">
                        <Truck className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-foreground">
                        Ship Your Pack <span className="text-primary italic">Faster.</span>
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-xl mx-auto font-medium">Professional logistics workflow for high-volume e-commerce brands.</p>
                </div>

                {/* Stepper */}
                <div className="flex justify-between items-center px-8 relative max-w-2xl mx-auto">
                    {[1, 2, 3, 4].map((s) => (
                        <div key={s} className="relative z-10 flex flex-col items-center group">
                            <div className={`
                                w-14 h-14 rounded-2xl flex items-center justify-center border-4 transition-all duration-500 transform
                                ${step === s ? "bg-primary border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] scale-110 -translate-y-1" :
                                    step > s ? "bg-primary border-primary shadow-lg" : "bg-white border-muted"}
                            `}>
                                {step > s ? <BadgeCheck className="h-7 w-7 text-white" /> :
                                    <span className={`text-xl font-black ${step === s ? "text-white" : "text-muted-foreground"}`}>{s}</span>}
                            </div>
                            <span className={`mt-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${step >= s ? "text-primary opacity-100" : "text-muted-foreground opacity-40"}`}>
                                {s === 1 ? "Route" : s === 2 ? "Package" : s === 3 ? "Partner" : "Finish"}
                            </span>
                        </div>
                    ))}
                    <div className="absolute top-[28px] left-14 right-14 h-[3px] bg-muted -z-0" />
                    <div
                        className="absolute top-[28px] left-14 h-[3px] bg-primary -z-0 transition-all duration-700 ease-in-out"
                        style={{ width: `${(step - 1) * 33.3}%` }}
                    />
                </div>

                {/* Form Card */}
                <Card className="border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] rounded-[40px] overflow-hidden bg-white/40 backdrop-blur-3xl border border-white/40">
                    <CardContent className="p-0">
                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-right-8 duration-700">
                                <div className="grid grid-cols-1 lg:grid-cols-2">
                                    <div className="p-10 lg:p-14 space-y-10 border-r border-muted/30">
                                        <div className="space-y-2 text-left">
                                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider mb-2">
                                                Pickup Location
                                            </div>
                                            <h2 className="text-3xl font-black tracking-tight">Origin Details</h2>
                                        </div>
                                        <div className="grid gap-6">
                                            <PremiumInput label="Contact Name" icon={UserCircle} placeholder="Contact Name" value={pickup.name} onChange={(v: any) => setPickup({ ...pickup, name: v })} />
                                            <div className="grid grid-cols-2 gap-4">
                                                <PremiumInput label="Phone" icon={PhoneCall} placeholder="+91" value={pickup.phone} onChange={(v: any) => setPickup({ ...pickup, phone: v })} />
                                                <PremiumInput label="Pincode" icon={MapPin} placeholder="400001" value={pickup.pincode} onChange={(v: any) => setPickup({ ...pickup, pincode: v })} />
                                            </div>
                                            <PremiumInput label="Full Address" icon={Building2} placeholder="Street Address" value={pickup.address} onChange={(v: any) => setPickup({ ...pickup, address: v })} />
                                            <div className="grid grid-cols-3 gap-4">
                                                <PremiumInput label="City" icon={Globe} placeholder="City" value={pickup.city} onChange={(v: any) => setPickup({ ...pickup, city: v })} />
                                                <PremiumInput label="State" icon={Globe} placeholder="State" value={pickup.state} onChange={(v: any) => setPickup({ ...pickup, state: v })} />
                                                <PremiumInput label="Country" icon={Globe} placeholder="India" value={pickup.country} onChange={(v: any) => setPickup({ ...pickup, country: v })} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-10 lg:p-14 space-y-10 bg-muted/10">
                                        <div className="space-y-2 text-left">
                                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary text-[10px] font-bold uppercase tracking-wider mb-2">
                                                Destination Location
                                            </div>
                                            <h2 className="text-3xl font-black tracking-tight">Delivery Details</h2>
                                        </div>
                                        <div className="grid gap-6">
                                            <PremiumInput label="Receiver Name" icon={UserCircle} placeholder="Receiver Name" value={delivery.name} onChange={(v: any) => setDelivery({ ...delivery, name: v })} />
                                            <div className="grid grid-cols-2 gap-4">
                                                <PremiumInput label="Contact" icon={PhoneCall} placeholder="+91" value={delivery.phone} onChange={(v: any) => setDelivery({ ...delivery, phone: v })} />
                                                <PremiumInput label="Pincode" icon={MapPin} placeholder="560001" value={delivery.pincode} onChange={(v: any) => setDelivery({ ...delivery, pincode: v })} />
                                            </div>
                                            <PremiumInput label="Shipping Address" icon={Building2} placeholder="Full Address" value={delivery.address} onChange={(v: any) => setDelivery({ ...delivery, address: v })} />
                                            <div className="grid grid-cols-3 gap-4">
                                                <PremiumInput label="City" icon={Globe} placeholder="City" value={delivery.city} onChange={(v: any) => setDelivery({ ...delivery, city: v })} />
                                                <PremiumInput label="State" icon={Globe} placeholder="State" value={delivery.state} onChange={(v: any) => setDelivery({ ...delivery, state: v })} />
                                                <PremiumInput label="Country" icon={Globe} placeholder="India" value={delivery.country} onChange={(v: any) => setDelivery({ ...delivery, country: v })} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="p-10 lg:p-14 space-y-10 animate-in fade-in slide-in-from-right-8 duration-700">
                                <div className="text-center space-y-2">
                                    <h2 className="text-4xl font-black tracking-tight">Package Geometry</h2>
                                    <p className="text-muted-foreground font-medium">Higher of Volumetric vs Actual weight will be considered for billing.</p>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-5xl mx-auto items-center">
                                    <div className="space-y-8">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="space-y-2 text-left">
                                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Length (cm)</Label>
                                                <Input type="number" placeholder="cm" value={dimensions.length} onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })} className="h-16 text-2xl font-black text-center rounded-2xl border-2" />
                                            </div>
                                            <div className="space-y-2 text-left">
                                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Width (cm)</Label>
                                                <Input type="number" placeholder="cm" value={dimensions.width} onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })} className="h-16 text-2xl font-black text-center rounded-2xl border-2" />
                                            </div>
                                            <div className="space-y-2 text-left">
                                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Height (cm)</Label>
                                                <Input type="number" placeholder="cm" value={dimensions.height} onChange={(e) => setDimensions({ ...dimensions, height: e.target.value })} className="h-16 text-2xl font-black text-center rounded-2xl border-2" />
                                            </div>
                                        </div>

                                        <div className="space-y-2 text-left">
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-2">
                                                <Package className="h-3 w-3" /> Actual Dead Weight (kg)
                                            </Label>
                                            <Input
                                                type="number"
                                                placeholder="Enter weight in kg"
                                                value={actualWeight}
                                                onChange={(e) => setActualWeight(e.target.value)}
                                                className="h-16 text-2xl font-black rounded-2xl border-2 pl-6"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-2xl bg-muted/50 border border-muted flex flex-col items-center">
                                                <span className="text-[10px] font-black uppercase text-muted-foreground">Volumetric</span>
                                                <span className="text-xl font-bold">{weights.volumetric} kg</span>
                                            </div>
                                            <div className="p-4 rounded-2xl bg-muted/50 border border-muted flex flex-col items-center">
                                                <span className="text-[10px] font-black uppercase text-muted-foreground">Actual</span>
                                                <span className="text-xl font-bold">{weights.actual} kg</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative p-10 bg-gradient-to-br from-primary to-blujay-dark rounded-[40px] text-white overflow-hidden shadow-2xl group">
                                        <div className="relative z-10 text-center space-y-4">
                                            <Calculator className="h-12 w-12 mx-auto opacity-50 mb-4 group-hover:scale-110 transition-transform" />
                                            <p className="text-xs font-black uppercase tracking-[0.3em] opacity-70">Final Billable Weight</p>
                                            <h3 className="text-7xl font-black">{weights.billable} <span className="text-2xl opacity-60">kg</span></h3>
                                            <div className="pt-4">
                                                <span className="px-4 py-2 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-widest backdrop-blur-md">
                                                    Charged Weight
                                                </span>
                                            </div>
                                        </div>
                                        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
                                        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-secondary/10 rounded-full blur-3xl"></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="p-10 lg:p-14 space-y-10 animate-in fade-in slide-in-from-right-8 duration-700">
                                <div className="text-center space-y-2">
                                    <h2 className="text-4xl font-black tracking-tight">Select Partner</h2>
                                    <p className="text-muted-foreground font-medium">Pick the best route and price for your shipment.</p>
                                </div>
                                <div className="grid gap-6 max-w-4xl mx-auto text-left">
                                    {indianCouriers.map((courier) => (
                                        <div
                                            key={courier.id}
                                            onClick={() => setSelectedCourier(courier.id)}
                                            className={`p-8 rounded-[32px] border-2 cursor-pointer transition-all duration-500 flex flex-col md:flex-row md:items-center gap-8 ${selectedCourier === courier.id ? "border-primary bg-primary/[0.03] scale-[1.02]" : "border-muted bg-white/50"}`}
                                        >
                                            <div className="flex items-center gap-6 flex-1">
                                                <div className="w-20 h-20 rounded-3xl flex items-center justify-center font-black text-white text-3xl bg-gradient-to-br from-primary to-blujay-dark">
                                                    {courier.name.charAt(0)}
                                                </div>
                                                <div className="space-y-1">
                                                    <h3 className="font-black text-2xl tracking-tight">{courier.name}</h3>
                                                    <p className="text-xs font-bold text-muted-foreground">{courier.features.join(" • ")}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-4xl font-black text-primary tracking-tighter">₹{courier.price}</p>
                                                <p className="text-[10px] font-black text-muted-foreground uppercase">{courier.time}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="p-10 lg:p-14 space-y-12 animate-in fade-in slide-in-from-right-8 duration-700 text-center max-w-2xl mx-auto">
                                <div className="space-y-6">
                                    <ShieldCheck className="h-20 w-20 text-primary mx-auto" />
                                    <h2 className="text-5xl font-black tracking-tighter">Ready to Ship</h2>
                                    <p className="text-muted-foreground font-medium text-lg">Wallet balance will be deducted for this booking.</p>
                                </div>
                                <div className="p-10 bg-primary/5 rounded-[32px] border border-primary/10">
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-black uppercase text-primary/60">Final Amount</span>
                                        <span className="text-5xl font-black text-primary tracking-tighter">₹{currentCourier?.price}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-8 lg:p-12 bg-white/80 border-t flex justify-between items-center">
                            <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="h-14 px-8 font-black uppercase">Back</Button>
                            {step < 4 ? (
                                <Button onClick={handleNext} disabled={(step === 3 && !selectedCourier)} className="h-16 px-10 rounded-full bg-primary font-black uppercase">Continue</Button>
                            ) : (
                                <Button onClick={handleComplete} className="h-20 px-14 rounded-full bg-primary font-black uppercase">Book Now</Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </ClientDashboardLayout>
    );
};

export default AddShipment;
