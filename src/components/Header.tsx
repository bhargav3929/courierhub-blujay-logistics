import { Search, Bell } from "lucide-react";
import { Input } from "./ui/input";

export const Header = () => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex-1 opacity-0 pointer-events-none">
          {/* Spacing filler */}
        </div>

        {/* User Avatar */}
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blujay-dark to-blujay-light flex items-center justify-center text-white font-semibold">
            SA
          </div>
        </div>
      </div>
    </header>
  );
};
