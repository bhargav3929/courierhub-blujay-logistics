import { Package } from "lucide-react";

interface LogoProps {
  variant?: "light" | "dark";
  showTagline?: boolean;
  className?: string;
}

export const Logo = ({ variant = "light", showTagline = true, className = "" }: LogoProps) => {
  const textColor = variant === "light" ? "text-white" : "text-primary";
  const taglineColor = variant === "light" ? "text-white/80" : "text-muted-foreground";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`p-2 rounded-lg ${variant === "light" ? "bg-white/10" : "bg-primary/10"}`}>
        <Package className={`h-8 w-8 ${variant === "light" ? "text-white" : "text-primary"}`} />
      </div>
      <div className="flex flex-col">
        <h1 className={`text-2xl font-bold ${textColor}`}>CourierHub</h1>
        {showTagline && (
          <p className={`text-xs ${taglineColor}`}>Powered by Blujay Logistics</p>
        )}
      </div>
    </div>
  );
};
