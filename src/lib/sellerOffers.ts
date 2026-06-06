import { supabase } from "@/integrations/supabase/client";
import { queryWithTimeout } from "@/utils/networkStatus";

// Shared store for seller-created offers. Backend is the source of truth so
// offers created by sellers are visible to users on every device/session.

export type OfferKind = "general" | "inventory";

export type SellerOffer = {
  id: string;
  sellerId: string | null;
  kind: OfferKind;
  name: string;
  discountPct: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  condition: string;
  itemIds: string[]; // for inventory offers
  createdAt: number;
};

const STORAGE_KEY = "bitez:seller:offers";
const EVENT_NAME = "bitez:seller:offers:change";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function normalizeKind(value: unknown): OfferKind {
  return value === "inventory" ? "inventory" : "general";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): SellerOffer {
  return {
    id: String(row.id),
    sellerId: row.seller_id ?? null,
    kind: normalizeKind(row.kind),
    name: row.name ?? "Offer",
    discountPct: Number(row.discount_pct ?? 0),
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    condition: row.condition ?? "",
    itemIds: Array.isArray(row.item_ids) ? row.item_ids : [],
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

function read(): SellerOffer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SellerOffer[]) : [];
  } catch {
    return [];
  }
}

function write(items: SellerOffer[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function upsertCache(incoming: SellerOffer[], sellerId?: string | null) {
  const existing = read();
  const kept = sellerId ? existing.filter((o) => o.sellerId !== sellerId) : [];
  const nextById = new Map<string, SellerOffer>();
  [...incoming, ...kept].forEach((offer) => nextById.set(offer.id, offer));
  write(Array.from(nextById.values()));
}

function toDbRow(offer: SellerOffer, keepId = false) {
  return {
    ...(keepId ? { id: offer.id } : {}),
    seller_id: offer.sellerId,
    kind: offer.kind,
    name: offer.name,
    discount_pct: offer.discountPct,
    start_date: offer.startDate || null,
    end_date: offer.endDate || null,
    condition: offer.condition,
    item_ids: offer.itemIds,
    is_active: true,
  };
}

export function getOffers(): SellerOffer[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export async function migrateCachedOffersToBackend(sellerId?: string | null): Promise<void> {
  if (!sellerId) return;
  const cached = read().filter((o) => o.sellerId === sellerId);
  if (cached.length === 0) return;
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const rows: SellerOffer[] = [];
  const withIds = cached.filter((o) => uuidLike.test(o.id));
  const withoutIds = cached.filter((o) => !uuidLike.test(o.id));
  if (withIds.length > 0) {
    const { data, error } = await db
      .from("seller_offers")
      .upsert(withIds.map((offer) => toDbRow(offer, true)), { onConflict: "id" })
      .select("id, seller_id, kind, name, discount_pct, start_date, end_date, condition, item_ids, created_at");
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []).map(fromRow)));
  }
  if (withoutIds.length > 0) {
    const { data, error } = await db
      .from("seller_offers")
      .insert(withoutIds.map((offer) => toDbRow(offer)))
      .select("id, seller_id, kind, name, discount_pct, start_date, end_date, condition, item_ids, created_at");
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []).map(fromRow)));
  }
  if (rows.length > 0) upsertCache(rows, sellerId);
}

export async function loadOffersFromBackend(sellerId?: string | null): Promise<SellerOffer[]> {
  let query = db
    .from("seller_offers")
    .select("id, seller_id, kind, name, discount_pct, start_date, end_date, condition, item_ids, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (sellerId) query = query.eq("seller_id", sellerId);

  const { data, error } = await queryWithTimeout(query, 5000);
  if (error) return getOffers().filter((o) => !sellerId || o.sellerId === sellerId);
  const incoming = (data ?? []).map(fromRow);
  upsertCache(incoming, sellerId);
  return incoming;
}

export function getActiveOffers(now = Date.now()): SellerOffer[] {
  return getOffers().filter((o) => {
    const start = o.startDate ? new Date(o.startDate + "T00:00:00").getTime() : -Infinity;
    const end = o.endDate ? new Date(o.endDate + "T23:59:59").getTime() : Infinity;
    return now >= start && now <= end;
  });
}

/** Return the highest active general-offer % for a given seller (0 if none). */
export function getActiveDiscountPctForSeller(sellerId?: string | null, now = Date.now()): number {
  if (!sellerId) return 0;
  const pct = getActiveOffers(now)
    .filter((o) => o.kind === "general" && o.sellerId === sellerId)
    .reduce((max, o) => Math.max(max, Number(o.discountPct) || 0), 0);
  return Math.max(0, Math.min(100, pct));
}

export function getActiveOfferForSeller(sellerId?: string | null, now = Date.now()): SellerOffer | null {
  if (!sellerId) return null;
  const list = getActiveOffers(now)
    .filter((o) => o.kind === "general" && o.sellerId === sellerId)
    .sort((a, b) => b.discountPct - a.discountPct);
  return list[0] ?? null;
}

export async function addOffer(input: Omit<SellerOffer, "id" | "createdAt">): Promise<SellerOffer> {
  const { data, error } = await db
    .from("seller_offers")
    .insert(toDbRow({ ...input, id: "", createdAt: Date.now() }))
    .select("id, seller_id, kind, name, discount_pct, start_date, end_date, condition, item_ids, created_at")
    .single();
  if (error) throw new Error(error.message);
  const newOffer = fromRow(data);
  write([newOffer, ...read().filter((o) => o.id !== newOffer.id)]);
  return newOffer;
}

export async function updateOffer(id: string, patch: Partial<Omit<SellerOffer, "id" | "createdAt">>) {
  const payload: Record<string, unknown> = {};
  if (patch.sellerId !== undefined) payload.seller_id = patch.sellerId;
  if (patch.kind !== undefined) payload.kind = patch.kind;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.discountPct !== undefined) payload.discount_pct = patch.discountPct;
  if (patch.startDate !== undefined) payload.start_date = patch.startDate || null;
  if (patch.endDate !== undefined) payload.end_date = patch.endDate || null;
  if (patch.condition !== undefined) payload.condition = patch.condition;
  if (patch.itemIds !== undefined) payload.item_ids = patch.itemIds;
  const { error } = await db.from("seller_offers").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  write(read().map((o) => (o.id === id ? { ...o, ...patch } : o)));
}

export async function removeOffer(id: string) {
  const { error } = await db.from("seller_offers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  write(read().filter((o) => o.id !== id));
}

export function subscribeOffers(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  const channel = db
    .channel("seller-offers-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "seller_offers" }, () => {
      loadOffersFromBackend().then(cb).catch(() => cb());
    })
    .subscribe();
  window.addEventListener(EVENT_NAME, onLocal as EventListener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onLocal as EventListener);
    window.removeEventListener("storage", onStorage);
    db.removeChannel(channel);
  };
}
