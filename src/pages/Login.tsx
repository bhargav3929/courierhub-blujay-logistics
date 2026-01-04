import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Truck, Plane, Package, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebaseConfig";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import SEO from "@/components/SEO";

const Login = () => {
  const [loginType, setLoginType] = useState<'admin' | 'client'>('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  // Reset form when switching modes
  const toggleMode = (mode: 'admin' | 'client') => {
    setLoginType(mode);
    setEmail(mode === 'admin' ? "admin" : "");
    setPassword(mode === 'admin' ? "admin123" : "");
    setShowPassword(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }

    setLoading(true);

    try {
      if (loginType === 'admin') {
        await processAdminLogin();
      } else {
        await processClientLogin();
      }
    } catch (error: any) {
      console.error("Login error:", error);
      // Customize error messages
      if (error.code === 'auth/invalid-credential' || error.message.includes('invalid-credential')) {
        toast.error("Invalid credentials. Please check your email and password.");
      } else if (error.code === 'auth/user-not-found') {
        toast.error("No user found with these details.");
      } else {
        toast.error(error.message || "Failed to login. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const processAdminLogin = async () => {
    let loginEmail = email;
    const isAdminAlias = email === "admin";

    if (isAdminAlias) {
      loginEmail = "admin@courierhub.com";
    }

    try {
      await login(loginEmail, password);
      toast.success("Welcome back, Super Admin!");
      navigate("/admin-dashboard");
    } catch (error: any) {
      // Check if this is the special admin alias and the user doesn't exist yet
      const isAuthError = error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.message.includes('invalid-credential');

      if (isAdminAlias && password === "admin123" && isAuthError) {
        // Auto-create the admin user if it's the first time
        try {
          toast.loading("Initializing Admin Account...");
          await createInitialAdmin(loginEmail, password);

          // Retry login after creation
          await login(loginEmail, password);
          toast.dismiss();
          toast.success("Admin Account Initialized & Logged In!");
          navigate("/admin-dashboard");
        } catch (createError: any) {
          toast.dismiss();
          throw createError; // Throw up to display error
        }
      } else {
        throw error; // Throw original error
      }
    }
  };

  const createInitialAdmin = async (email: string, pass: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = userCredential.user.uid;

    // Create Admin User Doc
    await setDoc(doc(db, "users", uid), {
      email: email,
      name: "Super Admin",
      role: "admin",
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      lastLogin: Timestamp.now()
    });
  };

  const processClientLogin = async () => {
    // Normal login flow for clients
    await login(email, password);
    // AuthContext or ProtectedRoute will handle role checks mostly, 
    // but we can add a check here if needed.
    toast.success("Welcome back to your dashboard!");
    navigate("/client-dashboard");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blujay-dark via-primary to-blujay-light relative overflow-hidden">
      <SEO title="Login" description="Secure Login for Blujay Logistics Partners and Admins." />
      {/* Background decorative elements */}
      <div className="absolute inset-0 opacity-10">
        <Truck className="absolute top-20 left-20 h-32 w-32 text-white animate-pulse" />
        <Plane className="absolute bottom-32 right-32 h-40 w-40 text-white animate-pulse" style={{ animationDelay: "1s" }} />
        <Package className="absolute top-1/2 left-1/4 h-24 w-24 text-white animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header Section */}
          <div className="p-8 pb-6 bg-gradient-to-b from-white to-gray-50">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <Logo variant="dark" showTagline={false} />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Welcome Back</h2>
              <p className="text-muted-foreground text-sm mt-1">Select your portal to continue</p>
            </div>

            {/* Login Type Toggles */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
              <button
                onClick={() => toggleMode('admin')}
                className={`flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 ${loginType === 'admin'
                  ? 'bg-white text-primary shadow-sm ring-1 ring-black/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
                  }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Admin Portal
              </button>
              <button
                onClick={() => toggleMode('client')}
                className={`flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 ${loginType === 'client'
                  ? 'bg-white text-secondary shadow-sm ring-1 ring-black/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
                  }`}
              >
                <Users className="h-4 w-4" />
                Client Portal
              </button>
            </div>
          </div>

          {/* Form Section */}
          <div className="p-8 pt-2">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">
                  {loginType === 'admin' ? 'Username / Email' : 'Client Email'}
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="text"
                    placeholder={loginType === 'admin' ? "admin" : "Enter your email"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="focus-visible:ring-primary pl-10"
                    disabled={loading}
                    required
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {loginType === 'admin' ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={loginType === 'admin' ? "admin123" : "Enter password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 pl-10 focus-visible:ring-primary"
                    disabled={loading}
                    required
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Truck className="h-4 w-4" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className={`w-full text-white shadow-lg transition-all duration-300 ${loginType === 'admin'
                  ? 'bg-gradient-to-r from-blujay-dark to-blujay-light hover:opacity-90'
                  : 'bg-gradient-to-r from-secondary to-secondary/80 hover:opacity-90'
                  }`}
                size="lg"
                disabled={loading}
              >
                {loading ? "Authenticating..." : (loginType === 'admin' ? "Access Admin Dashboard" : "Login to Client Portal")}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-xs text-muted-foreground">
                {loginType === 'admin' ? (
                  <span className="flex items-center justify-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Secure Super Admin Area
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <Package className="h-3 w-3" /> Shipping Partner Access
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
