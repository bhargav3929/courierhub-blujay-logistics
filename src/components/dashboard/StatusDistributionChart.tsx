'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "./MotionCard";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

interface StatusDistributionChartProps {
    data: any[];
}

export const StatusDistributionChart = ({ data }: StatusDistributionChartProps) => {
    return (
        <MotionCard delay={0.3} className="col-span-1">
            <MotionCardHeader>
                <MotionCardTitle>Shipment Status</MotionCardTitle>
                <p className="text-sm text-muted-foreground">Current distribution of all shipments</p>
            </MotionCardHeader>
            <MotionCardContent>
                <div className="h-[300px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={110}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                                animationDuration={1500}
                                animationEasing="ease-out"
                            >
                                {data.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.color}
                                        className="hover:opacity-80 transition-opacity cursor-pointer stroke-white dark:stroke-slate-900 stroke-2"
                                    />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "12px",
                                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                                }}
                                itemStyle={{ color: "hsl(var(--foreground))" }}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                iconType="circle"
                                formatter={(value, entry: any) => <span className="text-sm font-medium text-muted-foreground ml-1">{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    {/* Center Text Overlay */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[60%] text-center pointer-events-none">
                        <span className="text-3xl font-bold block text-foreground">
                            {data.reduce((acc, curr) => acc + curr.value, 0)}
                        </span>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Total</span>
                    </div>
                </div>
            </MotionCardContent>
        </MotionCard>
    );
};
