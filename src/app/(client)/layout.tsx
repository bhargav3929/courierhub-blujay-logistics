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
            <div className="flex min-h-screen w-full bg-muted/30">
                <ClientSidebar />
                <div className="flex-1 flex flex-col ml-64">
                    <Header />
                    <main className="flex-1 p-6">
                        {children}
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
}
