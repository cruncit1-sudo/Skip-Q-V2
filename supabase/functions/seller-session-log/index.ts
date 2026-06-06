import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Append-only seller session logger. Verifies the seller exists & is active
// before inserting. Direct anon/authenticated access to seller_sessions is
// blocked at the database level.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { seller_id } = await req.json();
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

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const { error } = await admin.from("seller_sessions").insert({
      seller_id,
      ip_address: ip,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
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