import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearCart } from "@/lib/userCart";
import { createOrderOptimistic, hasSoundPlayed, markSoundPlayed, type OrderItem } from "@/lib/sellerOrders";
import { pinItem } from "@/lib/userPins";
import { playOrderConfirmation } from "../../utils/orderConfirmation";
import { beginOrder, endOrder } from "@/utils/orderGuard";

type PendingOrder = {
  razorpay_order_id?: string;
  sellerId: string | null;
  sellerName: string | null;
  items: OrderItem[];
  totalAmount: number;
  subtotal: number;
  timestamp: number;
};

const PENDING_KEY = "bitez_pending_order";

const PaymentCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Confirming payment…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    try {
      beginOrder();
    } catch {
      // Another order flow is already in progress — bail.
      navigate("/app/orders", { replace: true });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const razorpayPaymentId = params.get("razorpay_payment_id");
    const cancelled = params.get("cancelled") === "true";

    let pending: PendingOrder | null = null;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) pending = JSON.parse(raw) as PendingOrder;
    } catch {
      pending = null;
    }

    if (cancelled || !razorpayPaymentId) {
      sessionStorage.removeItem(PENDING_KEY);
      endOrder();
      navigate("/app/cart", { replace: true });
      return;
    }
    if (!pending || !Array.isArray(pending.items) || pending.items.length === 0) {
      endOrder();
      navigate("/app/orders", { replace: true });
      return;
    }

    try {
      // Optimistic local order so the status screen renders instantly.
      const order = createOrderOptimistic({
        payment: "Online",
        paymentStatus: "SUCCESS",
        isSoundPlayed: false,
        sellerId: pending.sellerId,
        sellerName: pending.sellerName,
        items: pending.items,
        subtotal: pending.subtotal,
        total: pending.totalAmount,
      });
      pending.items.forEach((c) => pinItem(c.itemId));
      clearCart(pending.sellerId ?? "__unknown__");
      sessionStorage.removeItem(PENDING_KEY);
      if (!hasSoundPlayed(order.uid)) {
        markSoundPlayed(order.uid);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(35);
        }
        void playOrderConfirmation();
      }
      setStatus("Order confirmed");
      endOrder();
      navigate(`/app/order-status?method=upi&id=${order.uid}`, { replace: true });
    } catch {
      endOrder();
      setStatus("Verification failed. Opening your orders…");
      setTimeout(() => navigate("/app/orders", { replace: true }), 1200);
    }
  }, [navigate]);

  return (
    <div
      className="user-page flex flex-col items-center justify-center"
      style={{
        minHeight: "100dvh",
        background: "hsl(214 32% 94%)",
        color: "#1D1D1F",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "3px solid rgba(0,0,0,0.1)",
          borderTopColor: "#2563EB",
          animation: "bitez-spin 0.9s linear infinite",
        }}
      />
      <p style={{ fontSize: 14, color: "#6E6E73" }}>{status}</p>
      <style>{`@keyframes bitez-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default PaymentCallback;