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
import { getFirestore, collection, query, documentId, where, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import SellerRoute from "./components/guards/SellerRoute.jsx";
import { preloadInventoryForSellers } from "@/lib/sellerInventory";
import { initInventoryRealtime } from "@/lib/sellerInventory";
import { loadOrdersFromBackend } from "@/lib/sellerOrders";
import { getRegisteredCanteensFromBackend } from "@/lib/sellerProfile";
import { getUserSession } from "@/utils/sessionManager";
import { pruneCartByCanteens } from "@/lib/userCart";
import { getCart } from "@/lib/userCart";
import { applyPwaHeadForPath } from "@/lib/pwaLaunch";

const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const SellerDashboard = lazy(() => import("./pages/seller/Dashboard.tsx"));
const SellerInventory = lazy(() => import("./pages/seller/Inventory.tsx"));
const SellerMenu = lazy(() => import("./pages/seller/Menu.tsx"));
const SellerStaff = lazy(() => import("./pages/seller/Staff.tsx"));
const SellerOffers = lazy(() => import("./pages/seller/Offers.tsx"));
const SellerSettings = lazy(() => import("./pages/seller/Settings.tsx"));
const SellerOrders = lazy(() => import("./pages/seller/Orders.tsx"));
const SalesDashboard = lazy(() => import("./pages/seller/SalesDashboard.tsx"));
const SalesReports = lazy(() => import("./pages/seller/SalesReports.tsx"));
const SellerLogin = lazy(() => import("./pages/seller/Login.tsx"));

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
    let stopRealtime = () => {};
    try {
      stopRealtime = initInventoryRealtime() || (() => {});
    } catch (e) {
      console.warn("Realtime inventory init failed (likely due to Firebase migration):", e);
    }
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
    // Validate every item in cart against live product table on app mount.
    // Removes any line whose product was deactivated since last visit so a
    // stale cart can never silently turn into a ghost order.
    (async () => {
      const cart = getCart();
      if (!cart || cart.length === 0) return;
      const ids = cart.map((c) => c.itemId);
      let data: any[] | null = null;
      let error = null;
      try {
        const db = getFirestore();
        data = [];
        for (let i = 0; i < ids.length; i += 30) {
          const chunk = ids.slice(i, i + 30);
          const q = query(collection(db, "inventory"), where(documentId(), "in", chunk));
          const snapshot = await getDocs(q);
          snapshot.forEach((doc) => {
            data!.push({ id: doc.id, is_active: doc.data().status === "Active" || doc.data().is_active });
          });
        }
      } catch (err) {
        error = err;
      }
      if (error || !data) return;
      const validIds = new Set(data.filter((p) => p.is_active).map((p) => p.id));
      const cleaned = cart.filter((c) => validIds.has(c.itemId));
      if (cleaned.length !== cart.length) {
        // Re-write cart via the canonical helper to fire change events.
        const { clearCart, addToCart } = await import("@/lib/userCart");
        clearCart();
        cleaned.forEach((c) => addToCart({ ...c }, c.qty));
      }
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
          getAuth().authStateReady().catch(() => null) || Promise.resolve(),
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
            <Route path="/" element={<Navigate to="/seller/login" replace />} />

          {/* SELLER APP */}
          <Route path="/seller/login" element={<SellerLogin />} />
          <Route path="/seller/dashboard" element={<SellerRoute><SellerDashboard /></SellerRoute>} />
          <Route path="/seller/inventory" element={<SellerRoute><SellerInventory /></SellerRoute>} />
          <Route path="/seller/menu" element={<SellerRoute><SellerMenu /></SellerRoute>} />
          <Route path="/seller/staff" element={<SellerRoute><SellerStaff /></SellerRoute>} />
          <Route path="/seller/offers" element={<SellerRoute><SellerOffers /></SellerRoute>} />
          <Route path="/seller/settings" element={<SellerRoute><SellerSettings /></SellerRoute>} />
          <Route path="/seller/orders" element={<SellerRoute><SellerOrders /></SellerRoute>} />
          <Route path="/seller/sales" element={<SellerRoute><SalesDashboard /></SellerRoute>} />
          <Route path="/seller/sales/reports" element={<SellerRoute><SalesReports /></SellerRoute>} />
          <Route path="/seller" element={<Navigate to="/seller/dashboard" replace />} />

          <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/seller/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
