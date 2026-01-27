'use client';

import { ClientSidebar } from "@/components/ClientSidebar";
import { Header } from "@/components/Header";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function ClientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ProtectedRoute allowedRoles={['franchise', 'shopify']}>
            <div className="flex min-h-screen w-full bg-slate-50">
                <ClientSidebar />
                <div className="flex-1 flex flex-col pl-20 min-h-screen w-full">
                    <Header />
                    <main className="flex-1 p-6 md:p-8 max-w-[1600px] mx-auto w-full">
                        {children}
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
}
