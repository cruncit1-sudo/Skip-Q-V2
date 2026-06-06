import { supabase } from "@/integrations/supabase/client";
import {
  saveUserSession,
  clearUserSession,
  getUserSession,
} from "@/utils/sessionManager";

const USERID_KEY = "bitez_user_id";
// Legacy keys that older builds may have written. Purge on every read so a
// stale identity from a previous account can never overlap the current one.
const LEGACY_SESSION_KEYS = ["bitez_user_session_v1", "bitez-user-session"];

export type UserSessionData = {
  id: string;
  full_name: string;
  user_id: string;
  phone: string;
  college_name: string;
  razorpay_customer_id?: string | null;
  role: "user";
  savedAt: number;
};

export function getStoredUserId() {
  return localStorage.getItem(USERID_KEY) || "";
}

function persist(s: Omit<UserSessionData, "role" | "savedAt">) {
  // Always wipe the previous session first so two different user accounts
  // can never blend on the same device (same bug we fixed for admins).
  clearLocalSession();
  saveUserSession(s);
  try { localStorage.setItem(USERID_KEY, s.user_id); } catch { /* ignore */ }
  return { ...s, role: "user", savedAt: Date.now() } as UserSessionData;
}

export function clearLocalSession() {
  clearUserSession();
  for (const k of LEGACY_SESSION_KEYS) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
    try { sessionStorage.removeItem(k); } catch { /* ignore */ }
  }
  // keep bitez_user_id for auto-fill on next login
}

export type SignupInput = {
  fullName: string;
  userId: string;
  phone: string;
  collegeName: string;
  pin: string;
};

async function unwrap(data: unknown, error: unknown, fallback: string) {
  const errMsg = (data as { error?: string })?.error;
  if (errMsg) throw new Error(errMsg);
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j?.error) throw new Error(j.error);
      }
    } catch (e) {
      if (e instanceof Error && e.message) throw e;
    }
    throw new Error((error as Error).message || fallback);
  }
}

export async function signupUser(input: SignupInput) {
  const { data, error } = await supabase.functions.invoke("user-signup", {
    body: {
      full_name: input.fullName,
      user_id: input.userId,
      phone: input.phone,
      college_name: input.collegeName,
      pin: input.pin,
    },
  });
  await unwrap(data, error, "Could not create account");
  const u = (data as { user: Omit<UserSessionData, "role" | "savedAt"> }).user;
  return persist(u);
}

export async function checkUserIdAvailable(userId: string) {
  const { data } = await supabase.functions.invoke("user-check-id", {
    body: { user_id: userId },
  });
  return Boolean((data as { available?: boolean })?.available);
}

export async function loginWithPin(userId: string, pin: string) {
  const { data, error } = await supabase.functions.invoke("user-login", {
    body: { user_id: userId, pin },
  });
  await unwrap(data, error, "Incorrect User ID or PIN");
  const u = (data as { user: Omit<UserSessionData, "role" | "savedAt"> }).user;
  return persist(u);
}

export async function resetPin(userId: string, phone: string, newPin: string) {
  const { data, error } = await supabase.functions.invoke("user-forgot-pin", {
    body: { user_id: userId, phone, new_pin: newPin },
  });
  await unwrap(data, error, "Could not reset PIN");
}

export async function logoutUser() {
  clearLocalSession();
  // Drop any cached user-scoped data so a different account signing in next
  // never sees the previous user's cart/orders.
  try { localStorage.removeItem("bitez-cache-v2"); } catch { /* ignore */ }
  try { localStorage.removeItem(USERID_KEY); } catch { /* ignore */ }
}

// Re-export for callers that previously imported from this module.
export { getUserSession };