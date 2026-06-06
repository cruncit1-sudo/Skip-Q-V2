import { supabase } from "@/integrations/supabase/client";
import { queryWithTimeout } from "@/utils/networkStatus";

export type SellerProfile = {
  id: string;
  canteenName: string;
  slogan: string;
  ownerPhone: string;
  icon: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
};

const STORAGE_KEY = "bitez.seller.profile";
const CANTEENS_STORAGE_KEY = "bitez:shared:canteens:v1";
const EVENT = "bitez:seller:profile:change";
const DEFAULT_ID = "main";
const SESSION_KEY = "bitez_seller_session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const empty: SellerProfile = {
  id: DEFAULT_ID,
  canteenName: "",
  slogan: "",
  ownerPhone: "",
  icon: "🍽️",
  accountNumber: "",
  ifsc: "",
  upiId: "",
};

export function getProfile(): SellerProfile {
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as Partial<SellerProfile>), id: DEFAULT_ID };
  } catch {
    return empty;
  }
}

export function saveProfile(p: Omit<SellerProfile, "id">): SellerProfile {
  const next: SellerProfile = { ...p, id: DEFAULT_ID };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
  return next;
}

export function isProfileComplete(p: SellerProfile): boolean {
  return Boolean(
    p.canteenName.trim() &&
      p.slogan.trim() &&
      p.ownerPhone.trim() &&
      p.accountNumber.trim() &&
      p.ifsc.trim() &&
      p.upiId.trim(),
  );
}

export function getRegisteredCanteens(): SellerProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CANTEENS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SellerProfile[]) : [];
  } catch {
    return [];
  }
}

function writeProfile(p: SellerProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent(EVENT));
}

function writeCanteens(rows: SellerProfile[]) {
  if (typeof window === "undefined") return;
  try {
    const prev = window.localStorage.getItem(CANTEENS_STORAGE_KEY);
    const next = JSON.stringify(rows);
    if (prev === next) return; // no-op: avoids re-render / re-fetch loops
    window.localStorage.setItem(CANTEENS_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  // NOTE: intentionally do NOT dispatch the profile-change event here.
  // That event is for the seller's own profile edits; firing it on every
  // canteen list refresh causes an infinite fetch loop in subscribers
  // (Home re-fetches → writes → event → re-fetches → ...).
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromSeller(row: any): SellerProfile {
  const rawIcon = String(row.canteen_type ?? "").trim();
  const icon = /^\p{Extended_Pictographic}/u.test(rawIcon) ? rawIcon : "🍽️";
  return {
    id: row.id,
    canteenName: row.canteen_name ?? "Canteen",
    slogan: row.canteen_location ?? row.canteen_type ?? "Open now",
    ownerPhone: row.phone ?? "",
    icon,
    accountNumber: row.bank_account_number ?? "",
    ifsc: row.bank_ifsc ?? "",
    upiId: row.upi_id ?? "",
  };
}

export async function getRegisteredCanteensFromBackend(): Promise<SellerProfile[]> {
  // Public canteen list — only non-sensitive columns are readable by anon.
  // Bank/UPI/phone are intentionally not exposed to user-facing canteen cards.
  const { data, error } = await queryWithTimeout(
    db
      .from("sellers")
      .select("id, canteen_name, canteen_location, canteen_type, is_active, is_suspended")
      .eq("is_active", true)
      .eq("is_suspended", false)
      .order("created_at", { ascending: false }),
    5000,
  );
  if (error) {
    return getRegisteredCanteens();
  }
  const rows = (data ?? []).map(fromSeller);
  writeCanteens(rows);
  return rows;
}

export async function loadCurrentSellerProfile(): Promise<SellerProfile> {
  if (typeof window === "undefined") return empty;
  const raw = window.localStorage.getItem(SESSION_KEY);
  const session = raw ? (JSON.parse(raw) as { id?: string }) : null;
  if (!session?.id) return empty;
  // Sensitive columns (phone, bank, UPI) require service role; go via edge fn.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any;
  const { data: res, error } = await sb.functions.invoke("seller-self", {
    body: { seller_id: session.id, op: "get" },
  });
  if (error) throw new Error(error.message);
  if (res?.error) throw new Error(res.error);
  if (!res?.row) return empty;
  const profile = fromSeller(res.row);
  writeProfile(profile);
  return profile;
}

export async function saveProfileToBackend(p: Omit<SellerProfile, "id">): Promise<SellerProfile> {
  if (typeof window === "undefined") return { ...p, id: DEFAULT_ID };
  const raw = window.localStorage.getItem(SESSION_KEY);
  const session = raw ? (JSON.parse(raw) as { id?: string }) : null;
  if (!session?.id) return saveProfile(p);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = db as any;
  const { data: res, error } = await sb.functions.invoke("seller-self", {
    body: {
      seller_id: session.id,
      op: "update",
      patch: {
        canteen_name: p.canteenName,
        canteen_location: p.slogan,
        canteen_type: p.icon,
        phone: p.ownerPhone,
        bank_account_number: p.accountNumber,
        bank_ifsc: p.ifsc,
        upi_id: p.upiId,
      },
    },
  });
  if (error) throw new Error(error.message);
  if (res?.error) throw new Error(res.error);
  const next = fromSeller(res.row);
  writeProfile(next);
  return next;
}

export function subscribeProfile(cb: () => void): () => void {
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener(EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}