import { supabase } from "@/integrations/supabase/client";
import { clearSellerScopedCaches } from "@/lib/sellerCaches";

const SESSION_KEY = "bitez_seller_session";
const LEGACY_SESSION_KEY = "bitez.seller.session.v1";
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

export type SellerSession = {
  id: string;
  username: string;
  name: string;
  email: string;
  canteen_name: string;
  timestamp: number;
};

export function getSellerSession(): SellerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SellerSession;
    if (!s?.id) return null;
    if (Date.now() - s.timestamp > SESSION_MAX_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearSellerSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
  clearSellerScopedCaches();
}

export async function loginSeller(identifier: string, password: string): Promise<SellerSession> {
  const id = identifier.trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // The sellers table is locked to service_role for sensitive columns
  // (password_hash, email, phone, bank details). Login is done server-side.
  const { data, error } = await sb.functions.invoke("seller-login", {
    body: { identifier: id, password },
  });
  if (error) throw new Error(error.message || "Login failed");
  if (data?.error) throw new Error(data.error);
  const seller = data?.session;
  if (!seller?.id) throw new Error("Invalid username or password");

  // If a different seller was previously logged in on this device, wipe any
  // single-seller caches before storing the new session so the new canteen
  // never sees the previous canteen's profile / offers / staff / orders.
  try {
    const prevRaw = localStorage.getItem(SESSION_KEY);
    const prev = prevRaw ? (JSON.parse(prevRaw) as { id?: string }) : null;
    if (!prev?.id || prev.id !== seller.id) clearSellerScopedCaches();
  } catch {
    clearSellerScopedCaches();
  }

  const session: SellerSession = {
    id: seller.id,
    username: seller.username ?? "",
    name: seller.name ?? "",
    email: seller.email ?? "",
    canteen_name: seller.canteen_name ?? "",
    timestamp: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));

  // Fire-and-forget session log (table is service-role only)
  try {
    await sb.functions.invoke("seller-session-log", { body: { seller_id: seller.id } });
  } catch { /* ignore */ }

  return session;
}