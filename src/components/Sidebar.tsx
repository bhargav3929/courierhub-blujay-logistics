import { NavLink } from "react-router-dom";
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  Truck, 
  BarChart3, 
  Settings,
  LogOut,
  User
} from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Users, label: "Clients", path: "/clients" },
  { icon: Package, label: "Shipments", path: "/shipments" },
  { icon: Truck, label: "Courier Settings", path: "/couriers" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export const Sidebar = () => {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-blujay-dark to-blujay-light shadow-xl">
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <Logo variant="light" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                  "text-white/80 hover:text-white hover:bg-white/10",
                  isActive && "bg-white/20 text-white font-medium shadow-lg"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/10">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/30">
              <User className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">Super Admin</p>
              <p className="text-white/60 text-xs">admin@courierhub.com</p>
            </div>
          </div>
          <button className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all duration-200">
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
