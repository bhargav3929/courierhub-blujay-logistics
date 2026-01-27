'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "./MotionCard";
import { TopClient } from "@/types/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TopClientsTableProps {
    clients: TopClient[];
}

export const TopClientsTable = ({ clients }: TopClientsTableProps) => {
    return (
        <MotionCard delay={0.4} className="col-span-1 lg:col-span-2">
            <MotionCardHeader className="flex flex-row items-center justify-between">
                <div>
                    <MotionCardTitle>Top Performing Clients</MotionCardTitle>
                    <p className="text-sm text-muted-foreground">Highest volume partners this month</p>
                </div>
            </MotionCardHeader>
            <MotionCardContent>
                <div className="space-y-6">
                    {clients.map((client, index) => (
                        <div key={index} className="flex items-center justify-between group hover:bg-muted/50 p-2 rounded-xl transition-colors -mx-2">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-10 w-10 border-2 border-primary/10">
                                    <AvatarFallback className={`text-xs font-bold ${client.type === "franchise" ? "bg-primary/10 text-primary" : "bg-purple-500/10 text-purple-600"
                                        }`}>
                                        {client.name.substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{client.name}</p>
                                    <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${client.type === "franchise" ? "bg-primary" : "bg-purple-500"}`}></span>
                                        {client.type}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-sm">₹{client.revenue.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">{client.shipments} Shipments</p>
                            </div>
                        </div>
                    ))}
                </div>
            </MotionCardContent>
        </MotionCard>
    );
};
