'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "./MotionCard";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface CourierData {
    name: string;
    value: number;
    color: string;
}

// Mock data or real data if available. For now mock distribution as robust count of couriers is heavy.
const data: CourierData[] = [
    { name: "Blue Dart", value: 35, color: "hsl(var(--primary))" },
    { name: "DTDC", value: 15, color: "#f59e0b" }, // Amber
    { name: "Delhivery", value: 20, color: "#10b981" }, // Emerald 
    { name: "Others", value: 10, color: "#64748b" }, // Slate
];

export const CourierDistributionChart = () => {
    return (
        <MotionCard delay={0.3} className="h-full">
            <MotionCardHeader>
                <MotionCardTitle>Courier Network</MotionCardTitle>
                <p className="text-sm text-muted-foreground">Volume by courier partner</p>
            </MotionCardHeader>
            <MotionCardContent>
                <div className="h-[300px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--popover))",
                                    borderColor: "hsl(var(--border))",
                                    borderRadius: "8px",
                                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                                }}
                                itemStyle={{ color: "hsl(var(--foreground))" }}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                iconType="circle"
                                wrapperStyle={{ bottom: -20, fontWeight: 500, fontSize: "12px", opacity: 0.8 }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </MotionCardContent>
        </MotionCard>
    );
};
