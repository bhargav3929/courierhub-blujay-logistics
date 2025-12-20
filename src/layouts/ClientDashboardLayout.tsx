import { ReactNode } from "react";
import { ClientSidebar } from "@/components/ClientSidebar";
import { Header } from "@/components/Header";

interface ClientDashboardLayoutProps {
    children: ReactNode;
}

export const ClientDashboardLayout = ({ children }: ClientDashboardLayoutProps) => {
    return (
        <div className="flex min-h-screen w-full bg-muted/30">
            <ClientSidebar />
            <div className="flex-1 flex flex-col ml-64">
                <Header />
                <main className="flex-1 p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};
