import { supabase } from "@/integrations/supabase/client";
import { queryWithTimeout } from "@/utils/networkStatus";
import { getCart, removeCartItem, setCartQty } from "@/lib/userCart";

export type SellerCategory = "Food" | "Snacks" | "Drinks";
export type SellerStatus = "Active" | "Inactive";

export type SellerInventoryItem = {
  id: string;
  sellerId?: string | null;
  name: string;
  price: number;
  category: SellerCategory;
  icon: string;
  iconLabel: string;
  status: SellerStatus;
  createdAt: number;
  stockLimit?: number | null;
  availableUntil?: string | null;
  inventoryType?: "none" | "quantity" | "time" | null;
  stockQuantity?: number | null;
  availableFrom?: string | null;
  availableTo?: string | null;
};

/**
 * Whether an item is currently buyable. Combines status, time cutoff and
 * stock cap. Used by the user-facing menu and cart to instantly hide or
 * drop items the seller has limited.
 */
export function isItemAvailable(it: SellerInventoryItem): boolean {
  if (it.status !== "Active") return false;
  if (it.availableUntil && new Date(it.availableUntil).getTime() <= Date.now()) return false;
  if (typeof it.stockLimit === "number" && it.stockLimit <= 0) return false;
  if (it.inventoryType === "quantity") {
    if (typeof it.stockQuantity !== "number" || it.stockQuantity <= 0) return false;
  }
  if (it.inventoryType === "time") {
    if (!it.availableFrom || !it.availableTo) return false;
    const ist = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    );
    const cur = ist.getHours() * 60 + ist.getMinutes();
    const [fh, fm] = it.availableFrom.split(":").map(Number);
    const [th, tm] = it.availableTo.split(":").map(Number);
    const from = fh * 60 + (fm || 0);
    const to = th * 60 + (tm || 0);
    if (from <= to) {
      if (cur < from || cur > to) return false;
    } else {
      if (cur < from && cur > to) return false;
    }
  }
  return true;
}

/** Max purchasable qty for an item, given the seller's stock cap. */
export function maxPurchasableQty(it: SellerInventoryItem): number {
  if (it.inventoryType === "quantity" && typeof it.stockQuantity === "number") {
    return Math.max(0, it.stockQuantity);
  }
  if (typeof it.stockLimit === "number") return Math.max(0, it.stockLimit);
  return Number.POSITIVE_INFINITY;
}

const STORAGE_KEY = "bitez:shared:inventory:v2";
const EVENT_NAME = "bitez:seller:inventory:change";
const SESSION_KEY = "bitez_seller_session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function currentSellerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}

function normalizeCategory(value: unknown): SellerCategory {
  return value === "Snacks" || value === "Drinks" ? value : "Food";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromProduct(row: any): SellerInventoryItem {
  return {
    id: row.id,
    sellerId: row.seller_id ?? null,
    name: row.product_name ?? "Untitled item",
    price: Number(row.price ?? 0),
    category: normalizeCategory(row.category),
    icon: row.emoji ?? "🍽️",
    iconLabel: row.category ?? "Food",
    status: row.is_active === false ? "Inactive" : "Active",
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    stockLimit: row.stock_limit ?? null,
    availableUntil: row.available_until ?? null,
    inventoryType: (row.inventory_type as "none" | "quantity" | "time" | null) ?? "none",
    stockQuantity: row.stock_quantity ?? null,
    availableFrom: row.available_from ?? null,
    availableTo: row.available_to ?? null,
  };
}

function read(): SellerInventoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SellerInventoryItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: SellerInventoryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function upsertCache(incoming: SellerInventoryItem[], sellerId?: string | null) {
  const existing = read();
  const kept = sellerId ? existing.filter((it) => it.sellerId !== sellerId) : [];
  const nextById = new Map<string, SellerInventoryItem>();
  [...incoming, ...kept].forEach((it) => nextById.set(it.id, it));
  write(Array.from(nextById.values()));
}

export function getInventory(sellerId?: string | null): SellerInventoryItem[] {
  const rows = read();
  const scoped = sellerId ? rows.filter((it) => it.sellerId === sellerId) : rows;
  return scoped.sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadInventoryFromBackend(sellerId?: string | null): Promise<SellerInventoryItem[]> {
  let query = db
    .from("seller_products")
    .select("id, seller_id, product_name, price, category, emoji, is_active, created_at, stock_limit, available_until, inventory_type, stock_quantity, available_from, available_to")
    .order("created_at", { ascending: false });
  if (sellerId) query = query.eq("seller_id", sellerId);

  const { data, error } = await queryWithTimeout(query, 5000);
  if (error) return getInventory(sellerId);
  const incoming = (data ?? []).map(fromProduct);
  upsertCache(incoming, sellerId);
  return incoming;
}

export async function preloadInventoryForSellers(sellerIds: string[]): Promise<SellerInventoryItem[]> {
  const ids = Array.from(new Set(sellerIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const { data, error } = await queryWithTimeout(db
    .from("seller_products")
    .select("id, seller_id, product_name, price, category, emoji, is_active, created_at, stock_limit, available_until, inventory_type, stock_quantity, available_from, available_to")
    .in("seller_id", ids)
    .order("created_at", { ascending: false }), 5000);
  if (error) return getInventory().filter((it) => it.sellerId && ids.includes(it.sellerId));
  const incoming = (data ?? []).map(fromProduct);
  const existing = read().filter((it) => !it.sellerId || !ids.includes(it.sellerId));
  write([...incoming, ...existing]);
  return incoming;
}

export async function addInventoryItem(
  item: Omit<SellerInventoryItem, "id" | "createdAt">,
): Promise<SellerInventoryItem> {
  const sellerId = item.sellerId ?? currentSellerId();
  const { data, error } = await db
    .from("seller_products")
    .insert({
      seller_id: sellerId,
      product_name: item.name,
      price: item.price,
      category: item.category,
      emoji: item.icon,
      is_active: item.status === "Active",
    })
    .select("id, seller_id, product_name, price, category, emoji, is_active, created_at, stock_limit, available_until, inventory_type, stock_quantity, available_from, available_to")
    .single();
  if (error) throw new Error(error.message);
  const newItem = fromProduct(data);
  write([newItem, ...read().filter((it) => it.id !== newItem.id)]);
  return newItem;
}

export async function updateInventoryItem(
  id: string,
  patch: Partial<Omit<SellerInventoryItem, "id" | "createdAt">>,
) {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.product_name = patch.name;
  if (patch.price !== undefined) payload.price = patch.price;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.icon !== undefined) payload.emoji = patch.icon;
  if (patch.status !== undefined) payload.is_active = patch.status === "Active";
  if (patch.stockLimit !== undefined) payload.stock_limit = patch.stockLimit;
  if (patch.availableUntil !== undefined) payload.available_until = patch.availableUntil;
  const { error } = await db.from("seller_products").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  write(read().map((it) => (it.id === id ? { ...it, ...patch } : it)));
}

/**
 * Set a sales limit on an item. Either a quantity cap (stockLimit) or a
 * cutoff time (availableUntil). Pass null to clear. Both can coexist.
 */
export async function setInventoryLimit(
  id: string,
  limits: { stockLimit?: number | null; availableUntil?: string | null },
) {
  await updateInventoryItem(id, limits);
}

/**
 * Check all items in cache: if their availableUntil has passed, mark
 * them Inactive automatically. Safe to call on a timer.
 */
export async function enforceTimeLimits(): Promise<void> {
  const now = Date.now();
  const expired = read().filter(
    (it) => it.status === "Active" && it.availableUntil && new Date(it.availableUntil).getTime() <= now,
  );
  for (const it of expired) {
    try {
      await updateInventoryItem(it.id, { status: "Inactive" });
    } catch {
      /* best effort */
    }
  }
}

export async function setInventoryStatus(id: string, status: SellerStatus) {
  await updateInventoryItem(id, { status });
}

export async function removeInventoryItem(id: string) {
  const { error } = await db.from("seller_products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  write(read().filter((it) => it.id !== id));
}

/** Subscribe to changes (same tab + cross-tab). Returns unsubscribe fn. */
export function subscribeInventory(cb: () => void): () => void {
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

/**
 * Global Supabase Realtime subscription on seller_products. Pushes every
 * INSERT / UPDATE / DELETE into the local cache so all subscribers (menu,
 * cart, seller dashboard) reflect inventory changes within milliseconds.
 * When an item becomes inactive or is deleted, it is also auto-removed
 * from every active cart line for that item. Idempotent — calling more
 * than once is a no-op.
 */
let realtimeStarted = false;
export function initInventoryRealtime(): () => void {
  if (typeof window === "undefined") return () => {};
  if (realtimeStarted) return () => {};
  realtimeStarted = true;

  const pruneCartFor = (itemId: string) => {
    try {
      getCart()
        .filter((c) => c.itemId === itemId)
        .forEach((c) => removeCartItem(c.itemId, c.canteenId));
    } catch {
      // best-effort
    }
  };

  const capCartFor = (it: SellerInventoryItem) => {
    try {
      const cap = maxPurchasableQty(it);
      if (!Number.isFinite(cap)) return;
      getCart()
        .filter((c) => c.itemId === it.id && c.qty > cap)
        .forEach((c) => {
          if (cap <= 0) removeCartItem(c.itemId, c.canteenId);
          else setCartQty(c.itemId, cap, c.canteenId);
        });
    } catch {
      // best-effort
    }
  };

  const channel = db
    .channel("global-inventory-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "seller_products" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        const evt = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        if (evt === "DELETE") {
          const oldId = payload.old?.id as string | undefined;
          if (!oldId) return;
          write(read().filter((it) => it.id !== oldId));
          pruneCartFor(oldId);
          return;
        }
        const row = payload.new;
        if (!row) return;
        const next = fromProduct(row);
        const existing = read();
        const found = existing.some((it) => it.id === next.id);
        write(found ? existing.map((it) => (it.id === next.id ? next : it)) : [next, ...existing]);
        if (!isItemAvailable(next)) pruneCartFor(next.id);
        else capCartFor(next);
      },
    )
    .subscribe();

  return () => {
    try { db.removeChannel(channel); } catch { /* noop */ }
    realtimeStarted = false;
  };
}