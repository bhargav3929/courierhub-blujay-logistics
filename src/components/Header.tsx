'use client';

import { Search, Bell, Menu, ChevronRight } from "lucide-react";
import { Input } from "./ui/input";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";

export const Header = () => {
  const pathname = usePathname();
  const pathSegments = pathname?.split('/').filter(Boolean) || [];

  return (
    <header className="sticky top-0 z-40 bg-white/50 backdrop-blur-xl border-b border-white/20 shadow-sm">
      <div className="flex items-center justify-between px-8 py-4">

        {/* Left: Breadcrumbs & Title */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Admin</span>
            {pathSegments.map((segment, i) => (
              <div key={i} className="flex items-center gap-2">
                <ChevronRight className="h-3 w-3" />
                <span className="capitalize">{segment.replace('-', ' ')}</span>
              </div>
            ))}
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 capitalize">
            {pathSegments[pathSegments.length - 1]?.replace('-', ' ') || 'Dashboard'}
          </h1>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          <div className="relative w-64 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders, clients..."
              className="pl-9 bg-white/50 border-white/20 focus:bg-white transition-all rounded-full text-sm"
            />
          </div>

          <Button variant="ghost" size="icon" className="relative text-slate-500 hover:text-blue-600 hover:bg-blue-50">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
          </Button>

          <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>

          <Button variant="ghost" size="sm" className="text-slate-500 font-medium">
            Help
          </Button>
        </div>
      </div>
    </header>
  );
};

