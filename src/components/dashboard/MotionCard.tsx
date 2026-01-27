'use client';

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MotionCardProps {
    children: React.ReactNode;
    className?: string;
    delay?: number;
}

export const MotionCard = ({ children, className, delay = 0 }: MotionCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: "easeOut" }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            className={cn("h-full", className)}
        >
            <Card className="h-full overflow-hidden border-border/50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                {children}
            </Card>
        </motion.div>
    );
};

export const MotionCardHeader = CardHeader;
export const MotionCardTitle = CardTitle;
export const MotionCardContent = CardContent;
