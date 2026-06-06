import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import {
  getOrderById,
  getOrders,
  loadOrdersFromBackend,
  subscribeOrders,
  type Order,
} from "@/lib/sellerOrders";
import { getUserSession } from "@/utils/sessionManager";
import OrderConfirmedAnimation from "../../components/OrderConfirmedAnimation";
import { QRCodeSVG } from "qrcode.react";

const OrderStatus = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const method = (params.get("method") || "cod").toLowerCase();
  const orderParamId = params.get("id");

  const [revealed, setRevealed] = useState(false);
  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isAppleTouch = /iPad|iPhone|iPod/.test(nav.userAgent) ||
      (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
    return isAppleTouch || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Pull the most recent order (or the one referenced in the URL).
  // Subscribe so a late-arriving backend sync (or realtime update) hydrates
  // the page if the order wasn't yet in localStorage on first paint.
  const resolve = (): Order | undefined =>
    orderParamId ? getOrderById(orderParamId) : getOrders()[0];
  const [order, setOrder] = useState<Order | undefined>(() => resolve());

  useEffect(() => {
    setOrder(resolve());
    const unsub = subscribeOrders(() => setOrder(resolve()));
    // If the order is missing (e.g., fresh session, new device, cache wipe),
    // pull from backend and retry. This is the root-cause fix for "items
    // missing" when tapping a canteen in My Orders.
    let cancelled = false;
    const ensure = async () => {
      if (resolve()) return;
      try {
        await loadOrdersFromBackend(null, getUserSession()?.id);
      } catch {
        /* offline — subscription will pick it up later */
      }
      if (!cancelled) setOrder(resolve());
    };
    ensure();
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderParamId]);

  const orderId = order?.id ?? "----";
  const items = order?.items ?? [];
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const total = order?.total ?? 0;
  const sellerName = order?.sellerName ?? "Canteen";
  const sellerIcon = order?.sellerIcon ?? items.find((i) => i.canteenIcon)?.canteenIcon ?? "🍽️";

  const paymentLabel = method === "upi" ? "Paid via UPI" : "Cash on Delivery";
  const paymentSub = method === "upi" ? "Transaction Successful" : "Pay at pickup";

  // COD countdown — order is valid for 2h from creation.
  const isCod = order?.payment === "Cash";
  const expiresAt = order?.expiresAt ?? null;
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!isCod || !expiresAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [isCod, expiresAt]);
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const formatRemaining = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };
  const showCodTimer = isCod && expiresAt != null && order?.status === "Pending";

  return (
    <div
      className="user-page w-full flex flex-col items-center"
      style={{
        color: "hsl(var(--user-text))",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Top AppBar */}
      <header
        className="user-content border-rose-200 user-content-readable flex items-center justify-start"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: 10,
        }}
      >
        <h1 className="font-bold text-lg" style={{ color: "#0F172A" }}>
          Order Status
        </h1>
      </header>

      <main
        className="user-content border-rose-200 user-content-readable flex-1 flex flex-col items-center"
        style={{
          paddingTop: 8,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        }}
      >
        <OrderConfirmedAnimation reduceMotion={reduceMotion} />

        {/* Bento Grid */}
        <div className="grid grid-cols-1 gap-3 w-full">
          {/* QR Code — for billing scan */}
          <div
            className="flex flex-col items-center justify-center"
            style={{
              animation: reduceMotion ? "none" : 'ob-card-slide-up 500ms 800ms ease both',
              background: "#FFFFFF",
              padding: 24,
              borderRadius: 20,
              boxShadow: "0 4px 20px -4px rgba(0,0,0,0.05)",
              border: "1px solid #F1F5F9",
            }}
          >
            <span
              className="uppercase mb-4"
              style={{
                color: "#64748B",
                fontSize: 12,
                letterSpacing: "0.12em",
                fontWeight: 600,
              }}
            >
              Scan at Counter
            </span>
            <div
              style={{
                padding: 18,
                borderRadius: 18,
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                boxShadow: "0 2px 12px -4px rgba(15,23,42,0.08)",
              }}
            >
              <QRCodeSVG
                value={JSON.stringify({
                  orderId,
                  total,
                  items: items.map((i) => ({ n: i.name, q: i.qty })),
                  seller: sellerName,
                  payment: order?.payment ?? method,
                  ts: order?.createdAt ?? Date.now(),
                })}
                size={320}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#0F172A"
                marginSize={0}
              />
            </div>
            <p
              className="mt-4"
              style={{ color: "#64748B", fontSize: 12, textAlign: "center" }}
            >
              Show this to the billing counter for instant printing
            </p>
          </div>

          {/* Order ID */}
          <div
            className="flex flex-col items-center justify-center transition-all duration-400"
            style={{
              animation: reduceMotion ? "none" : 'ob-card-slide-up 500ms 900ms ease both',
              background: "#FFFFFF",
              padding: 16,
              borderRadius: 16,
              boxShadow: "0 4px 20px -4px rgba(0,0,0,0.05)",
              border: "1px solid #F1F5F9",
            }}
          >
            <span
              className="uppercase mb-1"
              style={{
                color: "#64748B",
                fontSize: 11,
                letterSpacing: "0.1em",
              }}
            >
              Order ID
            </span>
            <div
              className="font-bold mb-3"
              style={{
                color: "#0F172A",
                fontSize: 22,
                letterSpacing: "0.1em",
              }}
            >
              {revealed ? `#${orderId}` : "XXXX"}
            </div>
            <button
              onClick={() => {
                if (revealed) return;
                setRevealed(true);
                window.setTimeout(() => setRevealed(false), 5000);
              }}
              disabled={revealed}
              className="font-bold transition-all"
              style={{
                color: "#2563EB",
                fontSize: 12,
                padding: "6px 20px",
                borderRadius: 9999,
                border: "1px solid rgba(37,99,235,0.2)",
                background: "transparent",
                opacity: revealed ? 0.5 : 1,
                cursor: revealed ? "default" : "pointer",
              }}
            >
              {revealed ? "Revealed" : "Tap to reveal"}
            </button>
          </div>

          {/* Payment Info */}
          <div
            className="flex items-center justify-between"
            style={{
              animation: reduceMotion ? "none" : 'ob-card-slide-up 500ms 1050ms ease both',
              background: "#FFFFFF",
              padding: 16,
              borderRadius: 16,
              boxShadow: "0 4px 20px -4px rgba(0,0,0,0.05)",
              border: "1px solid #F1F5F9",
            }}
          >
            <div className="flex items-center" style={{ gap: 12 }}>
              <div
                className="flex items-center justify-center rounded-full"
                style={{ width: 40, height: 40, background: "#F1F5F9" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: "#64748B" }}
                >
                  {method === "upi" ? "account_balance_wallet" : "payments"}
                </span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#0F172A" }}>
                  {paymentLabel}
                </p>
                <p style={{ fontSize: 12, color: "#64748B" }}>{paymentSub}</p>
                {showCodTimer && (
                  <p
                    style={{
                      fontSize: 12,
                      color: remainingMs < 10 * 60 * 1000 ? "#DC2626" : "#0F172A",
                      marginTop: 2,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {remainingMs > 0
                      ? `${formatRemaining(remainingMs)} remaining`
                      : "Order expired"}
                  </p>
                )}
              </div>
            </div>
            <span
              className="material-symbols-outlined"
              style={{
                color: "#22C55E",
                fontVariationSettings: "'FILL' 1",
              }}
            >
              verified
            </span>
          </div>

          {/* Order Details */}
          <div
            className="relative overflow-hidden"
            style={{
              animation: reduceMotion ? "none" : 'ob-card-slide-up 500ms 1200ms ease both',
              background: "#FFFFFF",
              padding: 18,
              borderRadius: 16,
              boxShadow: "0 4px 20px -4px rgba(0,0,0,0.05)",
              border: "1px solid #F1F5F9",
            }}
          >
            <div
              className="absolute rounded-full"
              style={{
                top: 0,
                right: 0,
                width: 128,
                height: 128,
                marginRight: -64,
                marginTop: -64,
                opacity: 0.1,
                filter: "blur(48px)",
                background:
                  "linear-gradient(135deg, #B4C5FF 0%, #2563EB 100%)",
              }}
            />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="flex items-center min-w-0" style={{ gap: 10 }}>
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, borderRadius: 9999, background: "#EFF6FF", fontSize: 22 }}
                >
                  {sellerIcon}
                </div>
                <div className="min-w-0">
                  <h3
                    className="font-bold mb-1"
                    style={{ fontSize: 18, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {sellerName}
                  </h3>
                  <p style={{ color: "#64748B", fontSize: 13 }}>
                    Order details
                  </p>
                </div>
              </div>
              <div
                className="font-bold uppercase"
                style={{
                  background: "#EFF6FF",
                  padding: "4px 12px",
                  borderRadius: 9999,
                  fontSize: 11,
                  color: "#2563EB",
                  letterSpacing: "-0.02em",
                }}
              >
                {itemCount} Item{itemCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="space-y-2 mb-4 relative z-10">
              {items.length === 0 ? (
                <div className="flex justify-between" style={{ fontSize: 14, color: "#64748B" }}>
                  <span>No items</span>
                </div>
              ) : (
                items.map((it, index) => (
                  <div
                    key={`${it.canteenId ?? "unknown"}-${it.itemId}-${index}`}
                    className="flex justify-between"
                    style={{ fontSize: 14, color: "#64748B" }}
                  >
                    <span>
                      <span style={{ marginRight: 6 }}>{it.icon}</span>
                      {it.name}
                    </span>
                    <span>x{it.qty}</span>
                  </div>
                ))
              )}
            </div>
            <div
              className="flex justify-between items-center relative z-10"
              style={{
                paddingTop: 12,
                borderTop: "1px solid #F1F5F9",
              }}
            >
              <span style={{ color: "#64748B", fontSize: 14 }}>
                Total Paid Amount
              </span>
              <span
                className="font-extrabold"
                style={{ fontSize: 20, color: "#0F172A" }}
              >
                ₹{total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="mt-5 w-full flex flex-col gap-4">
          <button
            onClick={() => navigate("/app/home")}
            className="w-full font-bold transition-all duration-400"
            style={{
              background: "#FFFFFF",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              border: "1px solid #E2E8F0",
              color: "#0F172A",
              padding: "14px 0",
              borderRadius: 9999,
              fontSize: 15,
            }}
          >
            Back to Home
          </button>
        </div>
      </main>
    </div>
  );
};

export default OrderStatus;