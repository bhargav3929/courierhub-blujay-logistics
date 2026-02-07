'use client';

import { Search, Bell, HelpCircle, ChevronRight } from "lucide-react";
import { Input } from "./ui/input";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";

export const Header = () => {
  const pathname = usePathname();
  const pathSegments = pathname?.split('/').filter(Boolean) || [];

  // Detect admin vs client context from the route
  const isClient = pathSegments[0]?.startsWith('client-') || pathSegments[0] === 'add-shipment';
  const contextLabel = isClient ? 'Portal' : 'Admin';

  // Clean page title — strip "client-" prefix and replace dashes with spaces
  const formatSegment = (s: string) => s.replace(/^client-/, '').replace(/-/g, ' ');
  const pageTitle = formatSegment(pathSegments[pathSegments.length - 1] || 'dashboard');

  return (
    <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between px-8 h-16">

        {/* Left: Breadcrumbs & Page Title */}
        <div className="flex flex-col justify-center gap-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground tracking-wide">
            <span>{contextLabel}</span>
            {pathSegments.map((segment, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3 text-border" />
                <span className="capitalize">{formatSegment(segment)}</span>
              </div>
            ))}
          </div>
          <h1 className="text-lg font-bold text-foreground capitalize leading-tight">
            {pageTitle}
          </h1>
        </div>

        {/* Right: Search + Actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-56 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              className="pl-9 bg-muted/50 border-border/60 focus:bg-card focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-all rounded-full text-sm h-9"
            />
          </div>

          {/* Notification Bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
          </Button>

          {/* Divider */}
          <div className="h-5 w-px bg-border mx-1" />

          {/* Help */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>
    </header>
  );
};
