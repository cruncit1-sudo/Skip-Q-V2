import { supabase } from "@/integrations/supabase/client";

// Server-time COD availability check. Never trusts the device clock.
export async function checkCodAvailability(): Promise<{ allowed: boolean; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("is_cod_allowed");
    if (error) throw error;
    return { allowed: Boolean(data), error: null };
  } catch (e) {
    // Fail closed: if we can't verify, block COD.
    return { allowed: false, error: (e as Error).message || "Unable to verify COD availability" };
  }
}

export function getCodTimeMessage(): string {
  return "Cash on Delivery is available between 8:00 AM and 8:00 PM only.";
}