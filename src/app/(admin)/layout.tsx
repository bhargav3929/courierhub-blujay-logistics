'use client';

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import ProtectedRoute from "@/components/ProtectedRoute";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <ProtectedRoute allowedRoles={['admin']}>
            <div className="flex min-h-screen w-full bg-[#F1F5F9]">
                <Sidebar />
                <div className="flex-1 flex flex-col pl-20 transition-all duration-300 ease-in-out">
                    <Header />
                    <main className="flex-1 p-8">
                        {children}
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
}


