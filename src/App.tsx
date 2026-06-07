import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import OfflineBanner from "@/components/OfflineBanner";
import LoadingScreen from "@/components/LoadingScreen";
import OrbitLoader from "@/components/OrbitLoader";
import AdminRoute from "./components/guards/AdminRoute.jsx";
import { applyPwaHeadForPath } from "@/lib/pwaLaunch";
import { getAuth } from "firebase/auth";
import { app as firebaseApp } from "@/firebase";

const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const MaLogin = lazy(() => import("./master-admin/pages/Login.tsx"));
const MaSignup = lazy(() => import("./master-admin/pages/Signup.tsx"));
const MaOverview = lazy(() => import("./master-admin/pages/Overview.tsx"));
const MaSellers = lazy(() => import("./master-admin/pages/Sellers.tsx"));
const MaCreateSeller = lazy(() => import("./master-admin/pages/CreateSeller.tsx"));
const MaSellerDetail = lazy(() => import("./master-admin/pages/SellerDetail.tsx"));
const MaUsers = lazy(() => import("./master-admin/pages/Users.tsx"));
const MaUserDetail = lazy(() => import("./master-admin/pages/UserDetail.tsx"));
const MaSales = lazy(() => import("./master-admin/pages/Sales.tsx"));
const MaBehaviour = lazy(() => import("./master-admin/pages/Behaviour.tsx"));
const MaProducts = lazy(() => import("./master-admin/pages/Products.tsx"));
const MaAudit = lazy(() => import("./master-admin/pages/Audit.tsx"));

// Aggressive caching tuned for low-bandwidth campus networks.
// Data stays "fresh" for 5 min, kept in memory for 24h, and persisted to
// localStorage so a returning user sees instant results offline.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

const persister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({ storage: window.localStorage, key: "bitez-cache-v2" })
    : undefined;

const PwaRouteSync = () => {
  const location = useLocation();
  useEffect(() => {
    applyPwaHeadForPath(location.pathname);
  }, [location.pathname]);
  return null;
};

const LaunchGate = () => {
  const [appReady, setAppReady] = useState(false);
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    document.body.classList.add("app-launching");
    let cancelled = false;
    const init = async () => {
      try {
        await Promise.all([
          new Promise((resolve) => {
            const auth = getAuth(firebaseApp);
            const unsubscribe = auth.onAuthStateChanged(() => {
              resolve(true);
              unsubscribe();
            });
          }),
          new Promise((r) => setTimeout(r, 1200)),
        ]);
      } finally {
        if (cancelled) return;
        setAppReady(true);
        setTimeout(() => { if (!cancelled) setShowLoader(false); }, 450);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (appReady) document.body.classList.add("app-ready");
  }, [appReady]);

  useEffect(() => {
    if (!showLoader) document.body.classList.remove("app-launching");
  }, [showLoader]);

  if (!showLoader) return null;
  return <LoadingScreen fadeOut={appReady} />;
};

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{ persister: persister!, maxAge: 1000 * 60 * 60 * 24 }}
  >
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <OfflineBanner />
      <LaunchGate />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PwaRouteSync />
        <Suspense
          fallback={
            <div
              className="suspense-loader"
              style={{
                position: "fixed",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 50,
              }}
            >
              <OrbitLoader size={80} />
            </div>
          }
        >
          <Routes>
          <Route path="/" element={<Navigate to="/master-admin/login" replace />} />

          {/* MASTER ADMIN */}
          <Route path="/master-admin/login" element={<MaLogin />} />
          <Route path="/master-admin/signup" element={<MaSignup />} />
          <Route path="/master-admin/overview" element={<AdminRoute><MaOverview /></AdminRoute>} />
          <Route path="/master-admin/sellers" element={<AdminRoute><MaSellers /></AdminRoute>} />
          <Route path="/master-admin/sellers/new" element={<AdminRoute><MaCreateSeller /></AdminRoute>} />
          <Route path="/master-admin/sellers/:id" element={<AdminRoute><MaSellerDetail /></AdminRoute>} />
          <Route path="/master-admin/users" element={<AdminRoute><MaUsers /></AdminRoute>} />
          <Route path="/master-admin/users/:id" element={<AdminRoute><MaUserDetail /></AdminRoute>} />
          <Route path="/master-admin/sales" element={<AdminRoute><MaSales /></AdminRoute>} />
          <Route path="/master-admin/behaviour" element={<AdminRoute><MaBehaviour /></AdminRoute>} />
          <Route path="/master-admin/products" element={<AdminRoute><MaProducts /></AdminRoute>} />
          <Route path="/master-admin/audit" element={<AdminRoute><MaAudit /></AdminRoute>} />
          <Route path="/master-admin" element={<Navigate to="/master-admin/overview" replace />} />

          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<Navigate to="/master-admin/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
