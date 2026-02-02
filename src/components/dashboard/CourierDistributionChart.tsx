'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "./MotionCard";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface CourierData {
    name: string;
    value: number;
    color: string;
}

const COLORS = ["hsl(var(--primary))", "#f59e0b", "#10b981", "#64748b", "#8b5cf6", "#ef4444", "#ec4899"];

interface CourierDistributionChartProps {
    data?: CourierData[];
}

export const CourierDistributionChart = ({ data }: CourierDistributionChartProps) => {
    const chartData = data && data.length > 0 ? data : [];

    return (
        <MotionCard delay={0.3} className="h-full">
            <MotionCardHeader>
                <MotionCardTitle>Courier Network</MotionCardTitle>
                <p className="text-sm text-muted-foreground">Volume by courier partner</p>
            </MotionCardHeader>
            <MotionCardContent>
                <div className="h-[300px] w-full mt-4">
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
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
                    ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                            No courier data available
                        </div>
                    )}
                </div>
            </MotionCardContent>
        </MotionCard>
    );
};
