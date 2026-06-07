import { getFirestore, doc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { app } from "@/firebase";

import type { SellerCategory } from "./sellerInventory";

export type OrderItem = {
  itemId: string;
  name: string;
  icon: string;
  category: SellerCategory;
  price: number;
  qty: number;
  canteenId?: string;
  canteenIcon?: string;
};

export type OrderStatus = "Pending" | "Completed" | "Cancelled" | "Expired";
export type PaymentMethod = "Online" | "Cash";

export type Order = {
  id: string;          // short readable id, e.g. 2299
  uid: string;         // unique storage id
  createdAt: number;
  completedAt?: number;
  expiresAt?: number | null; // COD only; null/undefined for Online
  payment: PaymentMethod;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  total: number;
  sellerId?: string | null;
  sellerName?: string | null;
  sellerIcon?: string | null;
  appUserId?: string | null;
  paymentStatus?: "PENDING" | "SUCCESS" | "FAILED";
  isSoundPlayed?: boolean;
  isSalesRecorded?: boolean;
};

const STORAGE_KEY = "bitez:orders";
const EVENT_NAME = "bitez:orders:change";
const ID_COUNTER_KEY = "bitez:orders:counter";
const SHORT_ID_MIN = 1000;
const SHORT_ID_RANGE = 9000;

// COD orders soft-expire (status="Expired") after this duration.
// They are NOT deleted from storage/backend — sales/audit data is preserved.
export const CASH_ORDER_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function read(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
}

function write(items: Order[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("bitez_user_session");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}

function nextShortId(): string {
  if (typeof window === "undefined") return "1000";
  const existing = new Set(read().map((o) => o.id));
  const raw = window.localStorage.getItem(ID_COUNTER_KEY);
  let n = raw ? parseInt(raw, 10) || SHORT_ID_MIN : SHORT_ID_MIN;
  for (let i = 0; i < SHORT_ID_RANGE; i += 1) {
    n = n >= 9999 ? SHORT_ID_MIN : n + 1;
    const candidate = String(n);
    if (!existing.has(candidate)) {
      window.localStorage.setItem(ID_COUNTER_KEY, candidate);
      return candidate;
    }
  }
  const fallback = String(Date.now()).slice(-6);
  window.localStorage.setItem(ID_COUNTER_KEY, fallback);
  return fallback;
}

export function getOrders(): Order[] {
  expireStaleCashOrders();
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadOrdersFromBackend(
  sellerId?: string | null,
  userId = getCurrentUserId(),
  opts: { sinceMs?: number; limit?: number; merge?: boolean } = {},
): Promise<Order[]> {
  try {
    const db = getFirestore(app);
    let q = query(collection(db, "orders"));
    
    if (sellerId) {
      q = query(q, where("sellerId", "==", sellerId));
    } else if (userId) {
      q = query(q, where("appUserId", "==", userId));
    }
    
    if (opts.sinceMs) {
      q = query(q, where("createdAt", ">=", opts.sinceMs));
    }
    q = query(q, orderBy("createdAt", "desc"), limit(opts.limit ?? 200));

    const snapshot = await getDocs(q);
    const fetched = snapshot.docs.map((docSnap) => docSnap.data() as Order);

    if (opts.merge) {
      const fetchedUids = new Set(fetched.map((o) => o.uid));
      const kept = read().filter((o) => !fetchedUids.has(o.uid));
      const merged = [...fetched, ...kept].sort((a, b) => b.createdAt - a.createdAt);
      write(merged);
      return merged;
    }
    write(fetched);
    return fetched;
  } catch (error) {
    console.error("loadOrdersFromBackend error:", error);
    return getOrders();
  }
}

export function getOrderById(id: string): Order | undefined {
  return read().find((o) => o.id === id || o.uid === id);
}

export async function createOrder(
  payload: Omit<Order, "id" | "uid" | "createdAt" | "status" | "subtotal" | "total"> & {
    subtotal?: number;
    total?: number;
  },
): Promise<Order> {
  const subtotal =
    payload.subtotal ??
    payload.items.reduce((s, i) => s + i.price * i.qty, 0);
  const total = payload.total ?? subtotal;

  const sellerId = payload.items.find((i) => i.canteenId)?.canteenId ?? null;
  const sellerIcon = payload.items.find((i) => i.canteenIcon)?.canteenIcon ?? null;
  const userId = getCurrentUserId();
  const now = Date.now();
  const isOnlineSuccess = payload.payment === "Online" && payload.paymentStatus === "SUCCESS";
  const expiresAt = payload.payment === "Cash" ? now + CASH_ORDER_TTL_MS : null;

  const db = getFirestore(app);
  const orderRef = doc(collection(db, "orders"));

  const order: Order = {
    id: nextShortId(),
    uid: orderRef.id,
    createdAt: now,
    status: "Pending",
    expiresAt,
    payment: payload.payment,
    paymentStatus: payload.paymentStatus ?? "PENDING",
    isSoundPlayed: Boolean(payload.isSoundPlayed),
    isSalesRecorded: isOnlineSuccess,
    items: payload.items,
    subtotal,
    total,
    sellerId,
    sellerName: payload.sellerName ?? null,
    sellerIcon,
    appUserId: userId,
  };

  const orderDoc = Object.fromEntries(
    Object.entries(order).filter(([_, v]) => v !== undefined)
  );

  try {
    await setDoc(orderRef, orderDoc);
  } catch (cErr: any) {
    console.error("Firestore create order failed:", cErr);
    throw new Error(cErr?.message ?? "create failed");
  }
  write([order, ...read()]);
  return order;
}

// Optimistic variant: writes the order to local storage immediately and
// fires the backend persistence call in the background. Used by the
// online-payment success handler so the user sees the order-status screen
// in ~0ms instead of waiting on an analytics edge function round-trip.
export function createOrderOptimistic(
  payload: Omit<Order, "id" | "uid" | "createdAt" | "status" | "subtotal" | "total"> & {
    subtotal?: number;
    total?: number;
  },
): Order {
  const subtotal =
    payload.subtotal ??
    payload.items.reduce((s, i) => s + i.price * i.qty, 0);
  const total = payload.total ?? subtotal;
  const sellerId = payload.items.find((i) => i.canteenId)?.canteenId ?? null;
  const sellerIcon = payload.items.find((i) => i.canteenIcon)?.canteenIcon ?? null;
  const userId = getCurrentUserId();
  const now = Date.now();
  const isOnlineSuccess = payload.payment === "Online" && payload.paymentStatus === "SUCCESS";
  const expiresAt = payload.payment === "Cash" ? now + CASH_ORDER_TTL_MS : null;

  const db = getFirestore(app);
  const orderRef = doc(collection(db, "orders"));

  const order: Order = {
    id: nextShortId(),
    uid: orderRef.id,
    createdAt: now,
    status: "Pending",
    expiresAt,
    payment: payload.payment,
    paymentStatus: payload.paymentStatus ?? "PENDING",
    isSoundPlayed: Boolean(payload.isSoundPlayed),
    isSalesRecorded: isOnlineSuccess,
    items: payload.items,
    subtotal,
    total,
    sellerId,
    sellerName: payload.sellerName ?? null,
    sellerIcon,
    appUserId: userId,
  };

  const orderDoc = Object.fromEntries(
    Object.entries(order).filter(([_, v]) => v !== undefined)
  );

  // 1) Optimistic local write — UI can navigate immediately.
  write([order, ...read()]);

  // 2) Fire backend persistence in the background with a small retry.
  const persist = (attempt: number): void => {
    setDoc(orderRef, orderDoc)
      .catch((err) => {
        console.error("Optimistic order persistence failed, retrying...", err);
        if (attempt < 3) setTimeout(() => persist(attempt + 1), 1500 * attempt);
      });
  };
  persist(1);
  return order;
}

export async function setOrderStatus(uidOrId: string, status: OrderStatus) {
  const target = read().find((o) => o.uid === uidOrId || o.id === uidOrId);
  const completedAt = status === "Completed" ? target?.completedAt ?? Date.now() : target?.completedAt;
  // Mark sales recorded when an order completes (covers both COD-on-completion and online-already-recorded).
  const isSalesRecorded =
    status === "Completed"
      ? true
      : status === "Cancelled" || status === "Expired"
      ? Boolean(target?.isSalesRecorded && target?.payment === "Online")
      : target?.isSalesRecorded;
  const next = read().map((o) =>
    o.uid === uidOrId || o.id === uidOrId
      ? {
          ...o,
          status,
          completedAt,
          isSalesRecorded: isSalesRecorded ?? o.isSalesRecorded,
        }
      : o,
  );
  if (target) {
    try {
      const db = getFirestore(app);
      const updateData: any = {
        status,
        isSalesRecorded: isSalesRecorded ?? target.isSalesRecorded,
      };
      if (completedAt !== undefined) updateData.completedAt = completedAt;

      await updateDoc(doc(db, "orders", target.uid), updateData);
    } catch (uErr: any) {
      console.error("Firestore update order status failed:", uErr);
      throw new Error(uErr?.message ?? "update failed");
    }
  }
  write(next);
}

export function subscribeOrders(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener(EVENT_NAME, onLocal as EventListener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onLocal as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}

// ------------------------------------------------------------------
// Cash-order expiry: any Pending Cash order older than CASH_ORDER_TTL_MS
// is deleted (locally + backend). Online orders never expire here.
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// One-time sound playback flag for Online orders. Persisted in
// localStorage so it survives reloads / re-opens of order pages.
// ------------------------------------------------------------------
const SOUND_PLAYED_KEY = "bitez:orders:soundPlayed";

function readSoundPlayedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SOUND_PLAYED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function hasSoundPlayed(orderUidOrId: string): boolean {
  if (readSoundPlayedSet().has(orderUidOrId)) return true;
  return read().some((o) => (o.uid === orderUidOrId || o.id === orderUidOrId) && o.isSoundPlayed === true);
}

export function markSoundPlayed(orderUidOrId: string) {
  if (typeof window === "undefined") return;
  const set = readSoundPlayedSet();
  set.add(orderUidOrId);
  window.localStorage.setItem(SOUND_PLAYED_KEY, JSON.stringify([...set]));
  // Also flag the order record itself.
  let updatedOrder: Order | undefined;
  const all = read().map((o) => {
    if (o.uid !== orderUidOrId && o.id !== orderUidOrId) return o;
    updatedOrder = { ...o, isSoundPlayed: true, paymentStatus: "SUCCESS" as const };
    return updatedOrder;
  });
  write(all);
  if (updatedOrder) {
    const db = getFirestore(app);
    updateDoc(doc(db, "orders", updatedOrder.uid), {
      isSoundPlayed: true,
      paymentStatus: "SUCCESS"
    }).catch(() => undefined);
  }
}

/**
 * Soft-expire stale COD orders: set status to "Expired" instead of deleting.
 * Online orders never expire. Sales/audit data is preserved.
 */
export function expireStaleCashOrders(): Order[] {
  if (typeof window === "undefined") return [];
  const now = Date.now();
  const all = read();
  const stale = all.filter(
    (o) =>
      o.payment === "Cash" &&
      o.status === "Pending" &&
      now - o.createdAt >= CASH_ORDER_TTL_MS,
  );
  if (stale.length === 0) return [];
  const staleIds = new Set(stale.map((o) => o.uid));
  const next = all.map((o) =>
    staleIds.has(o.uid) ? { ...o, status: "Expired" as const } : o,
  );
  write(next);
  // Best-effort backend update — preserve the row, only flip status.
  stale.forEach((o) => {
    const db = getFirestore(app);
    updateDoc(doc(db, "orders", o.uid), {
      status: "Expired"
    }).catch((err) => console.error("Failed to expire stale cash order:", err));
  });
  return stale;
}

/** @deprecated kept for backwards compatibility — now soft-expires. */
export const pruneExpiredCashOrders = expireStaleCashOrders;

// Returns ms until the next Cash order expires, or null if none pending.
export function nextCashExpiryDelayMs(): number | null {
  const now = Date.now();
  const pending = read().filter(
    (o) => o.payment === "Cash" && o.status === "Pending",
  );
  if (pending.length === 0) return null;
  const soonest = Math.min(
    ...pending.map((o) => o.createdAt + CASH_ORDER_TTL_MS - now),
  );
  return Math.max(0, soonest);
}

// Auto-start a global pruning timer in the browser. Re-arms after each run.
if (typeof window !== "undefined") {
  const w = window as unknown as { __bitezCashExpiryTimer?: number };
  const schedule = () => {
    if (w.__bitezCashExpiryTimer) {
      window.clearTimeout(w.__bitezCashExpiryTimer);
    }
    const delay = nextCashExpiryDelayMs();
    if (delay == null) {
      // Re-check periodically in case new orders are added.
      w.__bitezCashExpiryTimer = window.setTimeout(schedule, 60_000);
      return;
    }
  w.__bitezCashExpiryTimer = window.setTimeout(() => {
      expireStaleCashOrders();
      schedule();
    }, Math.min(delay + 250, 2 ** 31 - 1));
  };
  // Run once on load + whenever orders change.
  expireStaleCashOrders();
  schedule();
  window.addEventListener(EVENT_NAME, schedule);
}