import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { clearCart, getCart, removeCartItem } from "@/lib/userCart";
import { createOrder, createOrderOptimistic, hasSoundPlayed, markSoundPlayed } from "@/lib/sellerOrders";
import { pinItem } from "@/lib/userPins";
import { playOrderConfirmation } from "../../utils/orderConfirmation";
import { supabase } from "@/integrations/supabase/client";
import { getUserSession } from "@/utils/sessionManager";
import { getActiveDiscountPctForSeller, loadOffersFromBackend } from "@/lib/sellerOffers";
import { isIOSPWA } from "../../utils/deviceDetect";
import { beginOrder, endOrder } from "@/utils/orderGuard";
import { checkCodAvailability, getCodTimeMessage } from "@/utils/codTimeCheck";

type RazorpayPaymentResponse = Record<string, unknown>;
type RazorpayOptions = {
  key: string;
  amount: number | string;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  method?: { upi: boolean; card: boolean; netbanking: boolean; wallet: boolean };
  config?: Record<string, unknown>;
  prefill: { name: string; contact: string; email?: string; method?: string };
  theme: { color: string };
  handler: (response: RazorpayPaymentResponse) => void | Promise<void>;
  modal: { ondismiss: () => void; confirm_close?: boolean; escape?: boolean; animation?: boolean };
  retry?: { enabled: boolean; max_count?: number };
  send_sms_hash?: boolean;
  remember_customer?: boolean;
  readonly?: { contact?: boolean; email?: boolean; name?: boolean };
  hidden?: { contact?: boolean; email?: boolean };
};
type RazorpayInstance = {
  on: (event: "payment.failed", handler: (response: RazorpayPaymentResponse) => void) => void;
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// Normalize any stored phone to the bare 10-digit Indian mobile format
// Razorpay expects in `prefill.contact`. Strips +, spaces, dashes, and a
// leading 91 country code. If the result is not 10 digits, returns "" so
// Razorpay won't render the broken value.
const formatIndianPhone = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return "";
};

const releaseMobileScrollLocks = () => {
  if (typeof document === "undefined") return;
  [document.documentElement, document.body].forEach((node) => {
    node.style.overflow = "";
    node.style.position = "";
    node.style.top = "";
    node.style.left = "";
    node.style.right = "";
    node.style.height = "";
    node.style.touchAction = "";
  });
  document.querySelectorAll(".razorpay-container").forEach((node) => node.remove());
};

const liquidGlass: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(40px)",
  WebkitBackdropFilter: "blur(40px)",
  borderRadius: 26,
  boxShadow:
    "inset 0 1.5px 0 0 rgba(255,255,255,0.55), 0 8px 32px rgba(0,0,0,0.06)",
  position: "relative",
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.03)",
};

const glassHighlight: React.CSSProperties = {
  content: '""',
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "45%",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)",
  pointerEvents: "none",
  zIndex: 1,
};

const Payment = () => {
  const HERO_IMG =
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCiwJoiptyTfJjocBll2nIls6RlxY48tdulifddR5Ese8rvs5cmf6-rAcmLqNJxycS-Dr7ud8C7bRLZRUD8N8A5ClckwSyiZ_53kZFF9u5ZDYD5J8K1_wyYKp6HVxKbxaknaAEVb8RLOCcRXNnp5rNMMv94vETDcFlU2eZrm_p6ruQmZFNwjJWcWWFNNfZGOR3CbPJ7D-ISlZkiKOjKJmaxhuWB07R05v80Qyr406FF2HO2IXveIpxwF4qF68gr1dwINcGXsEKikaWe";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [placing, setPlacing] = useState(false);
  const selectedCanteenId = params.get("canteenId");
  const [codAllowed, setCodAllowed] = useState(false);
  const [codChecking, setCodChecking] = useState(true);

  // Re-verify COD availability against the server clock on mount and every
  // 60s while the page is open so an expired window disables the button
  // without needing a manual refresh.
  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      setCodChecking(true);
      const { allowed } = await checkCodAvailability();
      if (cancelled) return;
      setCodAllowed(allowed);
      setCodChecking(false);
    };
    void verify();
    const interval = window.setInterval(verify, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Pre-warm the OrderStatus chunk so post-payment navigation is instant.
  useEffect(() => {
    void import("@/pages/user/OrderStatus");
  }, []);

  // Preload the Razorpay checkout.js SDK silently the moment Payment mounts
  // so tapping "Pay" opens the sheet instantly instead of waiting on a
  // network fetch for the script.
  useEffect(() => {
    void loadRazorpay();
  }, []);

  // Pre-create a Razorpay order the moment the user lands on the Payment
  // page. By the time they tap Pay, the order_id + key are already in
  // memory and we go straight to opening the checkout UI.
  //
  // Cached by `signature` (sellerId + subtotal) so that a stale pre-created
  // order is discarded if the cart changes between mount and tap.
  const [prepaid, setPrepaid] = useState<{
    signature: string;
    order_id: string;
    amount: number | string;
    currency: string;
    key_id: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const cart = getCart();
      const canteenKeys = new Set(cart.map((c) => c.canteenId ?? "__unknown__"));
      const activeCart = selectedCanteenId
        ? cart.filter((c) => (c.canteenId ?? "__unknown__") === selectedCanteenId)
        : canteenKeys.size <= 1
        ? cart
        : [];
      if (activeCart.length === 0) return;
      const subtotal = activeCart.reduce((s, c) => s + c.price * c.qty, 0);
      const sellerKey = activeCart[0]?.canteenId ?? null;
      const signature = `${sellerKey ?? ""}::${subtotal}`;
      try {
        const { data, error } = await supabase.functions.invoke("create-razorpay-order", {
          body: {
            subtotal,
            sellerId: sellerKey,
            receipt: `bitez_${Date.now()}`,
          },
        });
        if (cancelled) return;
        if (error || !data?.order_id) return;
        setPrepaid({
          signature,
          order_id: data.order_id,
          amount: data.amount,
          currency: data.currency,
          key_id: data.key_id,
        });
      } catch {
        /* silent — click handler will retry */
      }
    };
    void run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCanteenId]);

  const playOnlineSuccessOnce = useCallback((orderUid: string) => {
    if (hasSoundPlayed(orderUid)) return;
    markSoundPlayed(orderUid);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(35);
    }
    void playOrderConfirmation();
  }, []);

  const placeOrder = async (method: "Online" | "Cash") => {
    // Hard guard — blocks any concurrent re-entry from re-renders, realtime
    // callbacks, or stray timers. Released in finalize/dismiss/failure paths.
    try {
      beginOrder();
    } catch {
      return;
    }
    if (placing) {
      endOrder();
      return;
    }
    const cart = getCart();
    const canteenKeys = new Set(cart.map((c) => c.canteenId ?? "__unknown__"));
    const activeCart = selectedCanteenId
      ? cart.filter((c) => (c.canteenId ?? "__unknown__") === selectedCanteenId)
      : canteenKeys.size <= 1
      ? cart
      : [];
    if (activeCart.length === 0) {
      endOrder();
      navigate("/app/cart");
      return;
    }
    // Require an authenticated app session before touching backend.
    const sessionForCheck = getUserSession();
    if (!sessionForCheck?.id) {
      endOrder();
      alert("Please sign in again to place this order.");
      navigate("/app/login");
      return;
    }
    // Re-verify COD against server time at the exact moment of placement.
    if (method === "Cash") {
      const { allowed } = await checkCodAvailability();
      if (!allowed) {
        endOrder();
        alert(getCodTimeMessage());
        setCodAllowed(false);
        return;
      }
    }
    setPlacing(true);
    // Last-line safety net: even if Realtime missed an inactivation, never
    // let an order go through with items that are no longer available.
    try {
      const ids = activeCart.map((c) => c.itemId);
      const uniqueIds = Array.from(new Set(ids));
      const checks = await Promise.all(
        uniqueIds.map(async (id) => {
          const { data } = await supabase.rpc("is_item_available", { product_id: id });
          return { id, available: data === true };
        }),
      );
      const unavailableIds = checks.filter((c) => !c.available).map((c) => c.id);
      const { data: nameRows } = unavailableIds.length
        ? await supabase
            .from("seller_products")
            .select("id, product_name")
            .in("id", unavailableIds)
        : { data: [] as { id: string; product_name: string }[] };
      const inactive = (nameRows ?? []).map((r) => ({ id: r.id, product_name: r.product_name }));
      if (inactive.length > 0) {
        inactive.forEach((p) => {
          activeCart
            .filter((c) => c.itemId === p.id)
            .forEach((c) => removeCartItem(c.itemId, c.canteenId));
        });
        setPlacing(false);
        endOrder();
        alert(
          `Some items are no longer available and were removed from your cart: ${inactive
            .map((p) => p.product_name)
            .join(", ")}`,
        );
        navigate("/app/cart");
        return;
      }
    } catch {
      // If the availability check itself fails (offline), fall through and
      // let the normal order path proceed rather than blocking checkout.
    }
    const subtotal = activeCart.reduce((s, c) => s + c.price * c.qty, 0);
    const sellerKey = activeCart[0]?.canteenId ?? null;
    await loadOffersFromBackend(sellerKey).catch(() => []);
    const discountPct = getActiveDiscountPctForSeller(sellerKey);
    const totalAmount = Math.max(1, Math.round(subtotal * (1 - discountPct / 100)));

    const firstCartItem = activeCart[0];

    const finalize = async (paymentStatus: "PENDING" | "SUCCESS" | "FAILED" = "PENDING") => {
      const orderPayload = {
        payment: method,
        paymentStatus,
        isSoundPlayed: false,
        sellerId: firstCartItem?.canteenId ?? null,
        sellerName: firstCartItem?.canteenName ?? null,
        items: activeCart.map((c) => ({
          itemId: c.itemId,
          name: c.name,
          icon: c.icon,
          category: c.category,
          price: c.price,
          qty: c.qty,
          canteenId: c.canteenId,
          canteenIcon: c.canteenIcon,
        })),
      } as const;
      // Online SUCCESS path => optimistic write so the order-status screen
      // appears in ~0ms instead of waiting on the analytics edge function.
      // Every other path (Cash / Pending / Failed) keeps the awaited write
      // so callers know persistence actually landed.
      const order =
        method === "Online" && paymentStatus === "SUCCESS"
          ? createOrderOptimistic(orderPayload)
          : await createOrder(orderPayload);
      clearCart(firstCartItem?.canteenId ?? "__unknown__");
      activeCart.forEach((c) => pinItem(c.itemId));
      if (method === "Online" && paymentStatus === "SUCCESS") {
        playOnlineSuccessOnce(order.uid);
      }
      releaseMobileScrollLocks();
      setPlacing(false);
      endOrder();
      navigate(`/app/order-status?method=${method === "Online" ? "upi" : "cod"}&id=${order.uid}`, {
        replace: true,
      });
    };
    try {
      if (method === "Cash") {
        // Cash on Delivery: NO sound, ever.
        await finalize("PENDING");
        return;
      }
      // Online (UPI / Razorpay)
      const signature = `${sellerKey ?? ""}::${subtotal}`;
      let data: { order_id: string; amount: number | string; currency: string; key_id: string } | null =
        prepaid && prepaid.signature === signature
          ? { order_id: prepaid.order_id, amount: prepaid.amount, currency: prepaid.currency, key_id: prepaid.key_id }
          : null;
      if (!data) {
        const resp = await supabase.functions.invoke("create-razorpay-order", {
          body: { subtotal, sellerId: sellerKey, receipt: `bitez_${Date.now()}` },
        });
        if (resp.error || !resp.data?.order_id) {
          alert("Unable to start payment. Please try again.");
          setPlacing(false);
          endOrder();
          return;
        }
        data = resp.data;
      }
      // ---- iOS PWA fork: Razorpay's checkout.js refuses to open inside
      // iOS WKWebView standalone mode ("This browser is not supported").
      // Route those users through Razorpay's hosted checkout page, which
      // opens via a regular navigation and returns to /app/payment-callback.
      if (isIOSPWA()) {
        const session = getUserSession();
        try {
          sessionStorage.setItem(
            "bitez_pending_order",
            JSON.stringify({
              razorpay_order_id: data.order_id,
              sellerId: firstCartItem?.canteenId ?? null,
              sellerName: firstCartItem?.canteenName ?? null,
              items: activeCart.map((c) => ({
                itemId: c.itemId,
                name: c.name,
                icon: c.icon,
                category: c.category,
                price: c.price,
                qty: c.qty,
                canteenId: c.canteenId,
                canteenIcon: c.canteenIcon,
              })),
              subtotal,
              totalAmount,
              timestamp: Date.now(),
            }),
          );
        } catch {
          /* sessionStorage unavailable — proceed; callback will fall back */
        }
        const callback = `${window.location.origin}/app/payment-callback`;
        const cancel = `${window.location.origin}/app/payment-callback?cancelled=true`;
        const phoneIos = formatIndianPhone(session?.phone);
        const emailIos = session?.email && String(session.email).includes("@")
          ? String(session.email)
          : "student@bitez.app";
        const fields: Record<string, string> = {
          key_id: data.key_id,
          order_id: data.order_id,
          amount: String(typeof data.amount === "number" ? data.amount : Number(data.amount) || totalAmount * 100),
          currency: data.currency,
          name: "Bitez",
          description: firstCartItem?.canteenName ?? "Order",
          "prefill[name]": session?.full_name ?? session?.name ?? "Student",
          "prefill[contact]": phoneIos,
          "prefill[email]": emailIos,
          "prefill[method]": "upi",
          "theme[color]": "#2563EB",
          callback_url: callback,
          cancel_url: cancel,
        };
        // Same-window GET navigation — keeps the checkout inside the iOS
        // standalone PWA WKWebView instead of bouncing the user out to
        // Safari (which a form POST occasionally triggers on iOS).
        const qs = new URLSearchParams(fields).toString();
        window.location.href = `https://api.razorpay.com/v1/checkout/embedded?${qs}`;
        return;
      }
      const sdkReady = await loadRazorpay();
      if (!sdkReady || !window.Razorpay) {
        alert("Payment SDK not loaded. Please refresh and try again.");
        setPlacing(false);
        endOrder();
        return;
      }
      const session = getUserSession();
      const prefillPhone = formatIndianPhone(session?.phone);
      const prefillEmail = session?.email && String(session.email).includes("@")
        ? String(session.email)
        : "student@bitez.app";
      const prefillName = session?.full_name ?? session?.name ?? "Student";
      const rzp = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        order_id: data.order_id,
        name: "Bitez",
        description: firstCartItem?.canteenName ?? "Order",
        // Show UPI as the only/first method and drive it through the intent
        // flow so Android opens the user's UPI app directly instead of
        // showing Razorpay's intermediate picker screen.
        config: {
          display: {
            blocks: {
              upi_block: {
                name: "Pay via UPI",
                instruments: [{ method: "upi", flows: ["intent"] }],
              },
            },
            sequence: ["block.upi_block"],
            preferences: { show_default_blocks: false },
          },
        },
        // Prefill name + phone (and email if present) so Razorpay skips its
        // contact-entry screen entirely. `method: 'upi'` pre-selects the UPI
        // tab so the user lands directly on app/QR options.
        prefill: {
          name: prefillName,
          contact: prefillPhone,
          email: prefillEmail,
          method: "upi",
        },
        // When we actually have a valid 10-digit phone, hide and lock the
        // contact field so Razorpay can never re-prompt for it. Email is
        // always provided (real or placeholder) so we hide that too.
        readonly: { contact: !!prefillPhone, email: true },
        hidden: { contact: !!prefillPhone, email: true },
        remember_customer: true,
        send_sms_hash: true,
        retry: { enabled: true, max_count: 2 },
        theme: { color: "#2563EB" },
        handler: async () => {
          // Razorpay success callback => Online payment SUCCESS => play once.
          await finalize("SUCCESS");
        },
        modal: {
          confirm_close: true,
          escape: true,
          animation: true,
          ondismiss: () => {
            releaseMobileScrollLocks();
            setPlacing(false);
            endOrder();
          },
        },
      });
      rzp.on("payment.failed", (response) => {
        releaseMobileScrollLocks();
        const msg =
          (response as { error?: { description?: string } })?.error?.description ||
          "Payment failed. Please try again.";
        alert(msg);
        setPlacing(false);
        endOrder();
      });
      rzp.open();
    } finally {
      // setPlacing reset by handler/modal callbacks for online
      if (method === "Cash") setPlacing(false);
    }
  };

  return (
    <div
      className="user-page"
      style={{ color: "hsl(var(--user-text))", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Standalone back arrow — no surrounding pill */}
      <button
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="fixed z-50 flex items-center justify-center transition-all duration-[400ms] ease-in-out active:scale-95"
        style={{
          top: "calc(20px + var(--ios-pwa-safe-top))",
          left: 16,
          width: 40,
          height: 40,
          background: "transparent",
          border: "none",
          padding: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ color: "#1D1D1F", fontSize: 28 }}>
          arrow_back
        </span>
      </button>

      {/* Main Content Canvas */}
      <main
        className="user-content flex flex-col w-full mx-auto px-4 sm:px-6"
        style={{
          paddingTop: "calc(84px + var(--ios-pwa-safe-top) + var(--ios-pwa-top-breathing))",
          maxWidth: "40rem",
          gap: 40,
        }}
      >
        {/* Branding Hero Moment */}
        <div
          className="relative overflow-hidden flex items-end w-full"
          style={{
            borderRadius: 26,
            height: 256,
            padding: 32,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <img
            alt="Premium Light Aesthetic"
            src={HERO_IMG}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(255,255,255,0.9), rgba(255,255,255,0.2), transparent)",
            }}
          />
          <div className="relative z-10">
            <span
              className="uppercase font-bold"
              style={{
                background: "#1D1D1F",
                color: "#FFFFFF",
                fontSize: 10,
                letterSpacing: "0.1em",
                padding: "4px 12px",
                borderRadius: 9999,
              }}
            >
              Secure Checkout
            </span>
            <h2
              className="font-extrabold tracking-tighter"
              style={{ fontSize: 30, marginTop: 8, color: "#1D1D1F" }}
            >
              Finalize Order
            </h2>
            <p
              className="font-medium"
              style={{ color: "#6E6E73", fontSize: 14, marginTop: 4 }}
            >
              Choose your preferred way to pay
            </p>
          </div>
        </div>

        {/* Payment Options Stack */}
        <section className="flex flex-col w-full" style={{ gap: 20 }}>
          {/* UPI Card */}
          <button
            type="button"
            disabled={placing}
            onClick={() => placeOrder("Online")}
            className="w-full text-left group active:scale-[0.98] transition-all duration-500 ease-out flex items-center justify-between"
            style={{ ...liquidGlass, padding: 20, borderRadius: 20, opacity: placing ? 0.65 : 1 }}
          >
            <span style={glassHighlight} aria-hidden />
            <div className="flex items-center relative z-10" style={{ gap: 14 }}>
              <div
                className="flex items-center justify-center group-hover:scale-105 transition-transform duration-500"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(0,102,204,0.10)",
                  color: "#0066CC",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}
                >
                  account_balance_wallet
                </span>
              </div>
              <div>
                <h3
                  className="font-bold tracking-tight"
                  style={{ color: "#1D1D1F", fontSize: 15 }}
                >
                  UPI Payment
                </h3>
                <p style={{ color: "#6E6E73", fontSize: 12, marginTop: 2 }}>
                  Pay via UPI
                </p>
              </div>
            </div>
            <span
              className="material-symbols-outlined relative z-10"
              style={{ color: "#1D1D1F", fontSize: 22 }}
            >
              chevron_right
            </span>
          </button>

          {/* Cash Card */}
          <button
            type="button"
            disabled={placing || !codAllowed || codChecking}
            onClick={() => placeOrder("Cash")}
            className="w-full text-left group active:scale-[0.98] transition-all duration-500 ease-out flex items-center justify-between"
            style={{ ...liquidGlass, padding: 20, borderRadius: 20, opacity: placing || !codAllowed || codChecking ? 0.5 : 1, cursor: !codAllowed && !codChecking ? "not-allowed" : undefined }}
          >
            <span style={glassHighlight} aria-hidden />
            <div className="flex items-center relative z-10" style={{ gap: 14 }}>
              <div
                className="flex items-center justify-center group-hover:scale-105 transition-transform duration-500"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(52,199,89,0.10)",
                  color: "#34C759",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}
                >
                  payments
                </span>
              </div>
              <div>
                <h3
                  className="font-bold tracking-tight"
                  style={{ color: "#1D1D1F", fontSize: 15 }}
                >
                  Cash on Delivery
                </h3>
                <p style={{ color: "#6E6E73", fontSize: 12, marginTop: 2 }}>
                  {codChecking ? "Checking availability…" : codAllowed ? "Pay with Cash" : "Available 8 AM – 8 PM only"}
                </p>
              </div>
            </div>
            <span
              className="material-symbols-outlined relative z-10"
              style={{ color: "#1D1D1F", fontSize: 22 }}
            >
              chevron_right
            </span>
          </button>
        </section>
      </main>
    </div>
  );
};

export default Payment;
