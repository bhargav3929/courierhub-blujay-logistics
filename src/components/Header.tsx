import { Search, Bell } from "lucide-react";
import { Input } from "./ui/input";

export const Header = () => {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-border shadow-sm">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Search Bar */}
        <div className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search shipments, clients, or orders..."
              className="pl-10 focus-visible:ring-primary"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
            <Bell className="h-5 w-5 text-foreground" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-destructive rounded-full"></span>
          </button>

          {/* User Avatar */}
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blujay-dark to-blujay-light flex items-center justify-center text-white font-semibold">
            SA
          </div>
        </div>
      </div>
    </header>
  );
};
