import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Read/update the seller's own profile including sensitive fields
// (phone, bank, UPI). The sellers table denies direct anon writes/reads on
// those columns, so this proxy is the only path. Caller passes seller_id
// from their session; we verify the seller is active before each operation.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { seller_id, op, patch } = body ?? {};
    if (!seller_id || typeof seller_id !== "string") return json({ error: "missing seller_id" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: seller } = await admin
      .from("sellers")
      .select("id, is_active, is_suspended")
      .eq("id", seller_id)
      .maybeSingle();
    if (!seller || seller.is_active === false || seller.is_suspended) {
      return json({ error: "unauthorized" }, 401);
    }

    const cols = "id, canteen_name, canteen_location, canteen_type, phone, bank_account_number, bank_ifsc, upi_id";
    // Public canteen listing must never expose phone, bank, or UPI details.
    const publicCols = "id, canteen_name, canteen_location, canteen_type";

    if (op === "list_canteens") {
      const { data, error } = await admin
        .from("sellers")
        .select(publicCols)
        .eq("is_active", true)
        .eq("is_suspended", false)
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ rows: data ?? [] });
    }

    if (op === "update" && patch && typeof patch === "object") {
      const allowed: Record<string, unknown> = {};
      const keys = ["canteen_name", "canteen_location", "canteen_type", "phone", "bank_account_number", "bank_ifsc", "upi_id"];
      for (const k of keys) if (k in patch) allowed[k] = (patch as Record<string, unknown>)[k];
      const { data, error } = await admin
        .from("sellers")
        .update(allowed)
        .eq("id", seller_id)
        .select(cols)
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ row: data });
    }

    // default: get own profile
    const { data, error } = await admin
      .from("sellers")
      .select(cols)
      .eq("id", seller_id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ row: data });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}