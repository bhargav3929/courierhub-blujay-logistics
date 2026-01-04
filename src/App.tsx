import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Suspense, lazy } from "react";

// Lazy Load Pages for Code Splitting (Fast Initial Load)
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const Shipments = lazy(() => import("./pages/Shipments"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard"));
const ClientShipments = lazy(() => import("./pages/ClientShipments"));
const ClientSettings = lazy(() => import("./pages/ClientSettings"));
const ClientIntegrations = lazy(() => import("./pages/ClientIntegrations"));
const AddShipment = lazy(() => import("./pages/AddShipment"));

const queryClient = new QueryClient();

// Shared Loading Component for Route Transitions
const RouteLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/" element={<Login />} />

              {/* Admin Routes */}
              <Route path="/admin-dashboard" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/clients" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Clients />
                </ProtectedRoute>
              } />
              <Route path="/shipments" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Shipments />
                </ProtectedRoute>
              } />

              {/* Client Routes */}
              <Route path="/client-dashboard" element={
                <ProtectedRoute allowedRoles={['franchise', 'shopify']}>
                  <ClientDashboard />
                </ProtectedRoute>
              } />
              <Route path="/client-shipments" element={
                <ProtectedRoute allowedRoles={['franchise', 'shopify']}>
                  <ClientShipments />
                </ProtectedRoute>
              } />
              <Route path="/client-settings" element={
                <ProtectedRoute allowedRoles={['franchise', 'shopify']}>
                  <ClientSettings />
                </ProtectedRoute>
              } />
              <Route path="/client-integrations" element={
                <ProtectedRoute allowedRoles={['franchise', 'shopify']}>
                  <ClientIntegrations />
                </ProtectedRoute>
              } />
              <Route path="/add-shipment" element={
                <ProtectedRoute allowedRoles={['franchise', 'shopify']}>
                  <AddShipment />
                </ProtectedRoute>
              } />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
