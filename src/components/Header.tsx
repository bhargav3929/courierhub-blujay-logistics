'use client';

import { useState } from "react";
import { Search, Bell, HelpCircle, Mail, Phone, MapPin } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const DEFAULT_SUPPORT = {
  brandName: "Blujay Logistics",
  email: "support@blujaylogistics.in",
  phone: "",
  address: "",
};

export const Header = () => {
  const { whiteLabelConfig } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);

  const support = whiteLabelConfig
    ? {
        brandName: whiteLabelConfig.brandName,
        email: whiteLabelConfig.supportEmail,
        phone: whiteLabelConfig.supportPhone,
        address: [
          whiteLabelConfig.returnAddress.line1,
          whiteLabelConfig.returnAddress.city,
          whiteLabelConfig.returnAddress.state,
          whiteLabelConfig.returnAddress.pincode,
        ]
          .filter(Boolean)
          .join(", "),
      }
    : DEFAULT_SUPPORT;

  return (
    <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between pl-4 pr-8 h-16">

        {/* Left: Logo — tenant logo for white-label, Blujay default otherwise */}
        {whiteLabelConfig ? (
          <div className="flex items-center gap-3 -ml-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={whiteLabelConfig.logoUrl}
              alt={whiteLabelConfig.brandName}
              className="h-9 w-9 object-contain rounded-md bg-white"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {whiteLabelConfig.brandName}
            </span>
          </div>
        ) : (
          <Image
            src="/logos/blujay-logo.png"
            alt="Blujay Logistics"
            width={160}
            height={34}
            unoptimized
            className="-ml-4"
          />
        )}

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
            onClick={() => setSupportOpen(true)}
            className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full"
            aria-label="Contact support"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Need help?</DialogTitle>
            <DialogDescription>
              Reach out to the {support.brandName} support team anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {support.email && (
              <a
                href={`mailto:${support.email}`}
                className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Email</p>
                  <p className="text-sm font-medium text-foreground truncate">{support.email}</p>
                </div>
              </a>
            )}
            {support.phone && (
              <a
                href={`tel:${support.phone}`}
                className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Phone className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Phone</p>
                  <p className="text-sm font-medium text-foreground">{support.phone}</p>
                </div>
              </a>
            )}
            {support.address && (
              <div className="flex items-center gap-3 rounded-xl border border-border p-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Address</p>
                  <p className="text-sm font-medium text-foreground">{support.address}</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
};
