import type { Metadata } from 'next';
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import LicenseGuard from "@/components/LicenseGuard";

export const metadata: Metadata = {
    title: "Blujay Logistics",
    description: "CourierHub Admin Dashboard",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                <div className="bg-background min-h-screen font-sans antialiased">
                    <LicenseGuard>
                        <Providers>
                            {children}
                            <Toaster />
                            <Sonner />
                        </Providers>
                    </LicenseGuard>
                </div>
            </body>
        </html>
    );
}
