'use client';

import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <ProtectedRoute allowedRoles={['admin']}>
            <div className="flex min-h-screen w-full bg-muted/30">
                <Sidebar />
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
