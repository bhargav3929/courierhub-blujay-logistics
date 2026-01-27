'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  Package,
  Truck,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  CreditCard,
  User
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
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const navGroups = [
  {
    label: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/admin-dashboard" },
      { icon: BarChart3, label: "Reports", path: "/reports" },
    ]
  },
  {
    label: "Management",
    items: [
      { icon: Users, label: "Clients", path: "/clients" },
      { icon: Package, label: "Shipments", path: "/shipments" },
      { icon: Truck, label: "Couriers", path: "/couriers" },
    ]
  },
  {
    label: "System",
    items: [
      { icon: CreditCard, label: "Billing", path: "/billing" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ]
  }
];

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <aside className="fixed left-0 top-0 h-screen w-20 bg-[#0F172A] border-r border-white/5 shadow-2xl z-50 flex flex-col items-center py-6">
      {/* Brand Header */}
      <div className="mb-8">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Package className="h-6 w-6 text-white" />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 w-full overflow-y-auto space-y-8 scrollbar-none px-2">
        <TooltipProvider delayDuration={0}>
          {navGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="flex flex-col items-center space-y-2">
              <div className="w-8 h-[1px] bg-slate-800 mb-2" />
              {group.items.map((item) => {
                const isActive = pathname === item.path || pathname?.startsWith(`${item.path}/`);

                return (
                  <Link key={item.path} href={item.path} className="block w-full">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "relative flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-all duration-200 group",
                          isActive
                            ? "bg-blue-600/10 text-blue-400"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        )}>
                          {isActive && (
                            <motion.div
                              layoutId="activeNav"
                              className="absolute inset-0 bg-blue-600/10 rounded-xl"
                              transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                          )}
                          <item.icon className={cn(
                            "h-5 w-5 transition-colors",
                            isActive ? "text-blue-500" : "text-slate-500 group-hover:text-slate-300"
                          )} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-slate-900 border-slate-800 text-white ml-2 font-medium">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  </Link>
                );
              })}
            </div>
          ))}
        </TooltipProvider>
      </div>

      {/* User Footer */}
      {/* User Footer */}
      <div className="mt-auto pt-4 border-t border-white/5 w-full flex justify-center pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center border-2 border-[#0B1120] ring-2 ring-white/10 hover:ring-white/20 transition-all cursor-pointer">
              <User className="h-5 w-5 text-white" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" className="w-56 bg-slate-900 border-slate-800 text-white ml-2">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none text-white">Super Admin</p>
                <p className="text-xs leading-none text-slate-400">admin@courierhub.com</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-800" />
            <DropdownMenuItem
              className="text-red-400 focus:bg-red-900/10 focus:text-red-400 cursor-pointer"
              onClick={async () => {
                try {
                  await logout();
                  router.push('/client');
                  toast.success("Logged out successfully");
                } catch (error) {
                  console.error("Logout failed", error);
                  toast.error("Failed to logout");
                }
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
};
