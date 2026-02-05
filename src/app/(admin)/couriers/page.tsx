'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface Courier {
    id: string;
    name: string;
    status: 'active' | 'inactive';
    description: string;
    logoColor: string;
}

const couriers: Courier[] = [
    {
        id: "bluedart",
        name: "Blue Dart",
        status: "active",
        description: "Premium express delivery services across India.",
        logoColor: "bg-blue-600"
    },
    {
        id: "dtdc",
        name: "DTDC",
        status: "active",
        description: "Comprehensive logistics solutions network.",
        logoColor: "bg-red-600"
    },
    {
        id: "delhivery",
        name: "Delhivery",
        status: "inactive",
        description: "Supply chain services for e-commerce.",
        logoColor: "bg-slate-800"
    },
    {
        id: "shadowfax",
        name: "Shadowfax",
        status: "inactive",
        description: "Hyperlocal and last-mile delivery network.",
        logoColor: "bg-amber-500"
    },
    {
        id: "ecom",
        name: "Ecom Express",
        status: "inactive",
        description: "End-to-end technology enabled logistics.",
        logoColor: "bg-indigo-600"
    },
    {
        id: "xpress",
        name: "Xpressbees",
        status: "inactive",
        description: "Fastest growing express logistics company.",
        logoColor: "bg-pink-600"
    }
];

export default function CouriersPage() {

    const handleIntegrationRequest = (courierName: string) => {
        toast.message("Integration Request Sent", {
            description: `Request to activate ${courierName} has been sent to the developer team.`,
            icon: <AlertCircle className="w-4 h-4 text-amber-500" />,
        });
    };

    return (
        <div className="space-y-8 pb-20">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Courier Integrations</h1>
                <p className="text-muted-foreground text-sm mt-1">Manage connected logistics partners and shipping providers.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {couriers.map((courier, index) => (
                    <motion.div
                        key={courier.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Card className={`h-full transition-all duration-300 hover:shadow-lg ${courier.status === 'active' ? 'border-blue-200 bg-blue-50/30' : 'hover:border-slate-300'}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className={`h-10 w-10 rounded-lg ${courier.logoColor} flex items-center justify-center text-white font-bold text-xs shadow-md`}>
                                    {courier.name.substring(0, 2).toUpperCase()}
                                </div>
                                {courier.status === 'active' ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Active
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-slate-500 bg-slate-50">
                                        Only via Dev
                                    </Badge>
                                )}
                            </CardHeader>
                            <CardContent className="pt-4">
                                <CardTitle className="text-lg mb-2">{courier.name}</CardTitle>
                                <CardDescription className="min-h-[40px] mb-4">
                                    {courier.description}
                                </CardDescription>

                                <div className="mt-auto">
                                    {courier.status === 'active' ? (
                                        <Button variant="outline" className="w-full border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700">
                                            Manage Settings
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="secondary"
                                            className="w-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                                            onClick={() => handleIntegrationRequest(courier.name)}
                                        >
                                            Request Activation <ArrowRight className="w-3 h-3 ml-2 opacity-50" />
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
                <p className="text-sm text-muted-foreground">Don't see your preferred courier?</p>
                <Button variant="link" className="text-blue-600">Contact Support Team</Button>
            </div>
        </div>
    );
}
