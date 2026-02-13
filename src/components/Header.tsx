'use client';

import { Search, Bell, HelpCircle } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import Image from "next/image";

export const Header = () => {
  return (
    <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between pl-4 pr-8 h-16">

        {/* Left: Logo */}
        <Image
          src="/logos/blujay-logo.svg"
          alt="Blujay Logistics"
          width={160}
          height={34}
          unoptimized
          className="-ml-4"
        />

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
