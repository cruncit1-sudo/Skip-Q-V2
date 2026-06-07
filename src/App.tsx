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
import RootRedirect from "./components/RootRedirect.jsx";
import UserRoute from "./components/guards/UserRoute.jsx";
import { preloadInventoryForSellers } from "@/lib/sellerInventory";
import { initInventoryRealtime } from "@/lib/sellerInventory";
import { loadOrdersFromBackend } from "@/lib/sellerOrders";
import { getRegisteredCanteensFromBackend } from "@/lib/sellerProfile";
import { getUserSession } from "@/utils/sessionManager";
import { pruneCartByCanteens } from "@/lib/userCart";
import { getCart } from "@/lib/userCart";
import { applyPwaHeadForPath } from "@/lib/pwaLaunch";

const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const UserHome = lazy(() => import("./pages/user/Home.tsx"));
const UserCart = lazy(() => import("./pages/user/Cart.tsx"));
const UserOrders = lazy(() => import("./pages/user/Orders.tsx"));
const UserProfile = lazy(() => import("./pages/user/Profile.tsx"));
const UserMenu = lazy(() => import("./pages/user/Menu.tsx"));
const UserPayment = lazy(() => import("./pages/user/Payment.tsx"));
const UserPaymentCallback = lazy(() => import("./pages/user/PaymentCallback.tsx"));
const UserOrderStatus = lazy(() => import("./pages/user/OrderStatus.tsx"));
const UserLogin = lazy(() => import("./pages/user/Login.tsx"));

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

const AppDataPreloader = () => {
  useEffect(() => {
    let alive = true;
    const stopRealtime = initInventoryRealtime();
    getRegisteredCanteensFromBackend()
      .then((canteens) => {
        if (!alive) return;
        const ids = canteens.map((c) => c.id);
        pruneCartByCanteens(ids);
        preloadInventoryForSellers(ids);
      })
      .catch(() => null);
    const userId = getUserSession()?.id;
    if (userId) loadOrdersFromBackend(null, userId).catch(() => null);
    (async () => {
      const cart = getCart();
      if (!cart || cart.length === 0) return;
    })().catch(() => null);
    return () => { alive = false; stopRealtime(); };
  }, []);
  return null;
};

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
      <AppDataPreloader />
      <LaunchGate />
      <BrowserRouter>
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
            <Route path="/" element={<RootRedirect />} />

          {/* USER APP */}
          <Route path="/app/login" element={<UserLogin />} />
          <Route path="/app/home" element={<UserRoute><UserHome /></UserRoute>} />
          <Route path="/app/cart" element={<UserRoute><UserCart /></UserRoute>} />
          <Route path="/app/orders" element={<UserRoute><UserOrders /></UserRoute>} />
          <Route path="/app/profile" element={<UserRoute><UserProfile /></UserRoute>} />
          <Route path="/app/menu/:id" element={<UserRoute><UserMenu /></UserRoute>} />
          <Route path="/app/payment" element={<UserRoute><UserPayment /></UserRoute>} />
          <Route path="/app/payment-callback" element={<UserRoute><UserPaymentCallback /></UserRoute>} />
          <Route path="/app/order-status" element={<UserRoute><UserOrderStatus /></UserRoute>} />
          <Route path="/app" element={<Navigate to="/app/home" replace />} />

          <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
