import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Truck, Plane, Package } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // No actual auth - just redirect to dashboard
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blujay-dark via-primary to-blujay-light relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 opacity-10">
        <Truck className="absolute top-20 left-20 h-32 w-32 text-white animate-pulse" />
        <Plane className="absolute bottom-32 right-32 h-40 w-40 text-white animate-pulse" style={{ animationDelay: "1s" }} />
        <Package className="absolute top-1/2 left-1/4 h-24 w-24 text-white animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo and Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Logo variant="dark" showTagline={false} />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Powered by Blujay Logistics</p>
            <h2 className="text-2xl font-bold text-foreground mt-4">Welcome Back</h2>
            <p className="text-muted-foreground mt-2">Your Complete Shipping Aggregation Platform</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email / Username</Label>
              <Input
                id="email"
                type="text"
                placeholder="Enter your email or username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blujay-dark to-blujay-light hover:from-primary hover:to-secondary text-white shadow-lg transition-all duration-300"
              size="lg"
            >
              Sign In
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">
              Trusted by <span className="font-semibold text-primary">500+ businesses</span> across India
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
