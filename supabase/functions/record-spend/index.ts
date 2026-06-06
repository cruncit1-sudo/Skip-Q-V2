import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Server-only writer for user_spend. The custom-auth client never inserts
// directly any more — RLS denies anon/authenticated writes.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const {
      user_id,
      order_id,
      seller_id,
      amount,
      payment_method,
      product_names,
    } = body ?? {};

    if (!user_id || typeof user_id !== "string" || !user_id.includes("-")) {
      return json({ error: "invalid user_id" }, 400);
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      return json({ error: "invalid amount" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await admin.from("user_spend").insert({
      user_id,
      order_id: order_id ?? null,
      seller_id: seller_id ?? null,
      amount,
      payment_method: payment_method ?? null,
      product_names: Array.isArray(product_names) ? product_names : null,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}