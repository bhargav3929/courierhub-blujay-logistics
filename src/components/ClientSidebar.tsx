'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Package,
    PlusCircle,
    Wallet,
    LogOut,
    Settings,
    Puzzle
} from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";

const navItems = [
    { icon: LayoutDashboard, label: "Home", path: "/client-dashboard" },
    { icon: Package, label: "My Shipments", path: "/client-shipments" },
    { icon: PlusCircle, label: "Book Shipment", path: "/add-shipment" },
    { icon: Puzzle, label: "Store Integrations", path: "/client-integrations" },
    { icon: Settings, label: "Portal Settings", path: "/client-settings" },
];

export const ClientSidebar = () => {
    const { balance, addMoney } = useWallet();
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-blujay-dark to-blujay-light shadow-xl">
            <div className="flex flex-col h-full">
                {/* Logo */}
                <div className="p-6 border-b border-white/10">
                    <Logo variant="light" />
                </div>

                {/* Wallet Info (Simplified for Client) */}
                <div className="px-6 py-4">
                    <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/10">
                        <div className="flex items-center gap-2 mb-1 text-white/60 text-xs uppercase tracking-wider font-semibold">
                            <Wallet className="h-3 w-3" />
                            <span>Wallet Balance</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-xl font-bold text-white">₹{balance.toLocaleString()}</p>
                            <button
                                onClick={() => addMoney(1000)}
                                className="text-[10px] bg-secondary text-white px-2 py-1 rounded font-bold hover:bg-secondary/80 transition-colors"
                            >
                                + TOP UP
                            </button>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-2 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                                    "text-white/80 hover:text-white hover:bg-white/10",
                                    isActive && "bg-white/20 text-white font-medium shadow-lg"
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* User Profile */}
                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/10">
                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/30 text-white font-bold">
                            C
                        </div>
                        <div className="flex-1">
                            <p className="text-white font-medium text-sm">Blujay Partner</p>
                            <p className="text-white/60 text-xs text-ellipsis overflow-hidden whitespace-nowrap">partner@example.com</p>
                        </div>
                    </div>
                    <Link
                        href="/"
                        className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all duration-200"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="text-sm">Logout</span>
                    </Link>
                </div>
            </div>
        </aside>
    );
};

