'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "./MotionCard";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

interface ClientActivityChartProps {
    data: { date: string; shipments: number }[];
}

export const ClientActivityChart = ({ data }: ClientActivityChartProps) => {
    return (
        <MotionCard delay={0.2} className="col-span-1 lg:col-span-2">
            <MotionCardHeader>
                <MotionCardTitle>Shipping Activity</MotionCardTitle>
                <p className="text-sm text-muted-foreground">Daily shipments for last 7 days</p>
            </MotionCardHeader>
            <MotionCardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} barSize={40}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                allowDecimals={false}
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
                                formatter={(value: number) => [value, "Shipments"]}
                            />
                            <Bar
                                dataKey="shipments"
                                fill="hsl(var(--primary))"
                                radius={[6, 6, 0, 0]}
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

// Keep the old export name for backward compatibility during transition
export const ClientSpendChart = ClientActivityChart;
