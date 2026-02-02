'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Package,
    PlusCircle,
    Settings,
    Puzzle,
    User,
    LogOut,
    FileBarChart
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
    { icon: LayoutDashboard, label: "Home", path: "/client-dashboard" },
    { icon: Package, label: "My Shipments", path: "/client-shipments" },
    { icon: PlusCircle, label: "Book Shipment", path: "/add-shipment" },
    { icon: FileBarChart, label: "Reports", path: "/client-reports" },
    { icon: Puzzle, label: "Store Integrations", path: "/client-integrations" },
    { icon: Settings, label: "Portal Settings", path: "/client-settings" },
];

export const ClientSidebar = () => {
    const pathname = usePathname();
    const { currentUser } = useAuth();

    return (
        <aside className="fixed left-0 top-0 h-screen w-20 bg-[#0B1120] border-r border-[#1E293B] shadow-2xl flex flex-col items-center py-6 z-50">
            {/* Logo */}
            <div className="mb-8 w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/20 ring-1 ring-white/10">
                <span className="text-white font-bold text-lg">B</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 flex flex-col gap-4 w-full px-3">
                <TooltipProvider delayDuration={0}>
                    {navItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link key={item.path} href={item.path} className="w-full flex justify-center">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="relative group">
                                            {isActive && (
                                                <motion.div
                                                    layoutId="client-active-nav"
                                                    className="absolute inset-0 bg-blue-600/10 rounded-xl border border-blue-500/20 shadow-[0_0_12px_-3px_rgba(37,99,235,0.4)]"
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                />
                                            )}
                                            <div className={cn(
                                                "relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200",
                                                isActive ? "text-blue-400" : "text-slate-400 group-hover:text-slate-100 group-hover:bg-white/5"
                                            )}>
                                                <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                                            </div>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="bg-[#1E293B] border-[#0F172A] text-slate-200 font-medium ml-2 shadow-xl">
                                        {item.label}
                                    </TooltipContent>
                                </Tooltip>
                            </Link>
                        );
                    })}
                </TooltipProvider>
            </nav>

            {/* User Footer */}
            <div className="mt-auto pt-4 border-t border-white/5 w-full flex justify-center pb-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center border-2 border-[#0B1120] ring-2 ring-white/10 hover:ring-white/20 transition-all cursor-pointer">
                            <User className="h-5 w-5 text-white" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" className="w-56 bg-slate-900 border-slate-800 text-white ml-2">
                        <DropdownMenuLabel>
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none text-white">{currentUser?.name || "Client"}</p>
                                <p className="text-xs leading-none text-slate-400">{currentUser?.email || ""}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-slate-800" />
                        <DropdownMenuItem className="text-slate-200 focus:bg-slate-800 focus:text-white cursor-pointer">
                            <User className="mr-2 h-4 w-4" />
                            <span>Profile</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-400 focus:bg-red-900/10 focus:text-red-400 cursor-pointer">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </aside>
    );
};

