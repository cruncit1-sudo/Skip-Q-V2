import { supabase } from "@/integrations/supabase/client";
import {
  getAdminSession,
  saveAdminSession,
  clearAdminSession,
} from "@/utils/sessionManager";

// Legacy key from when admin session was duplicated across two stores.
// Cleared on read so old data can never resurface and overlap with a new login.
const LEGACY_SESSION_KEY = "ma_session_v1";

export type MaSession = {
  role: "master_admin";
  authenticated: true;
  username: string;
  timestamp: number;
};

export function getSession(): MaSession | null {
  try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ }
  const s = getAdminSession();
  if (!s) return null;
  return {
    role: "master_admin",
    authenticated: true,
    username: s.username || "",
    timestamp: s.savedAt || Date.now(),
  };
}

export function setSession(username: string) {
  // Single source of truth: sessionManager. Username is preserved so the UI
  // can never display a different admin's identity than the one logged in.
  saveAdminSession({ username });
}

export function clearSession() {
  try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ }
  clearAdminSession();
}

export async function loginMasterAdmin(username: string, password: string) {
  const { data, error } = await supabase.rpc("verify_master_admin", {
    p_username: username,
    p_password: password,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function logAudit(
  action_type: string,
  target?: string,
  details?: Record<string, unknown>,
) {
  try {
    const s = getSession();
    if (!s?.username) return;
    await supabase.functions.invoke("admin-audit-log", {
      body: {
        username: s.username,
        action_type,
        target: target ?? null,
        details: details ?? null,
      },
    });
  } catch {
    /* fire and forget */
  }
}