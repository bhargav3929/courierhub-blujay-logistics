'use client';

import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from "./MotionCard";
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend
} from "recharts";

interface ClientActivityChartProps {
    data: { date: string; shipments: number }[];
}

interface ClientSourceChartProps {
    data: { name: string; value: number; color: string }[];
    title?: string;
    subtitle?: string;
}

// Custom label for pie chart
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name, value }: {
    cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number;
    percent: number; name: string; value: number;
}) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null;

    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
            fontSize={13} fontWeight={700}>
            {value}
        </text>
    );
};

export const ClientActivityChart = ({ data }: ClientActivityChartProps) => {
    return (
        <MotionCard delay={0.3}>
            <MotionCardHeader className="pb-2">
                <MotionCardTitle className="text-base">Shipping Activity</MotionCardTitle>
                <p className="text-xs text-muted-foreground">Daily shipments — last 7 days</p>
            </MotionCardHeader>
            <MotionCardContent>
                <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} barSize={32}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                dy={8}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                allowDecimals={false}
                                width={30}
                            />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "10px",
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                                    fontSize: 12,
                                }}
                                itemStyle={{ color: "hsl(var(--foreground))" }}
                                formatter={(value: number) => [value, "Shipments"]}
                            />
                            <Bar
                                dataKey="shipments"
                                fill="hsl(var(--primary))"
                                radius={[6, 6, 0, 0]}
                                animationDuration={1200}
                                animationEasing="ease-out"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </MotionCardContent>
        </MotionCard>
    );
};

export const ClientSourceChart = ({ data, title = "Order Sources", subtitle = "Shipments by platform" }: ClientSourceChartProps) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);

    return (
        <MotionCard delay={0.4}>
            <MotionCardHeader className="pb-2">
                <MotionCardTitle className="text-base">{title}</MotionCardTitle>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
            </MotionCardHeader>
            <MotionCardContent>
                <div className="h-[260px] w-full">
                    {total === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                            No shipment data yet
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={55}
                                    outerRadius={90}
                                    paddingAngle={3}
                                    dataKey="value"
                                    label={renderCustomLabel}
                                    labelLine={false}
                                    animationDuration={1200}
                                    animationEasing="ease-out"
                                    stroke="none"
                                >
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: "10px",
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                                        fontSize: 12,
                                    }}
                                    formatter={(value: number, name: string) => [
                                        `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                                        name
                                    ]}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    iconSize={8}
                                    formatter={(value: string) => (
                                        <span style={{ color: 'hsl(var(--foreground))', fontSize: 12, fontWeight: 500 }}>
                                            {value}
                                        </span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </MotionCardContent>
        </MotionCard>
    );
};

// Keep backward-compatible export
export const ClientSpendChart = ClientActivityChart;
