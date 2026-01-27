'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "./MotionCard";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from "recharts";
import { useState } from "react";

interface RevenueChartProps {
    data: any[];
}

export const RevenueChart = ({ data }: RevenueChartProps) => {
    return (
        <MotionCard delay={0.2} className="col-span-1">
            <MotionCardHeader>
                <MotionCardTitle>Revenue Analytics</MotionCardTitle>
                <p className="text-sm text-muted-foreground">Revenue distribution by client type</p>
            </MotionCardHeader>
            <MotionCardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} barSize={60}>
                            <defs>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                            <XAxis
                                dataKey="type"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                tickFormatter={(value) => `₹${value / 1000}k`}
                            />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "12px",
                                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                                }}
                                itemStyle={{ color: "hsl(var(--foreground))" }}
                                formatter={(value: number) => [`₹${value.toLocaleString()}`, "Revenue"]}
                            />
                            <Bar
                                dataKey="revenue"
                                fill="url(#colorRevenue)"
                                radius={[8, 8, 0, 0]}
                                animationDuration={1500}
                                animationEasing="ease-out"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </MotionCardContent>
        </MotionCard>
    );
};
