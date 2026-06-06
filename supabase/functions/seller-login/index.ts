import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Verifies seller credentials server-side using the service role (the sellers
// table is locked down at the database level so the anon key cannot read
// password_hash, email, phone, or bank details).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { identifier, password } = await req.json();
    if (!identifier || !password || typeof identifier !== "string" || typeof password !== "string") {
      return json({ error: "missing credentials" }, 400);
    }
    const id = identifier.trim();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sellers, error } = await admin
      .from("sellers")
      .select("id, username, name, email, canteen_name, is_active, is_suspended")
      .or(`username.ilike.${id},email.ilike.${id}`)
      .limit(1);
    if (error) return json({ error: error.message }, 500);
    const seller = sellers?.[0];
    if (!seller) return json({ error: "Invalid username or password" }, 401);
    if (seller.is_suspended) return json({ error: "Your account has been suspended. Contact admin." }, 403);
    if (seller.is_active === false) return json({ error: "Account is inactive" }, 403);

    const { data: ok, error: rpcErr } = await admin.rpc("verify_seller_password", {
      p_seller_id: seller.id,
      p_password: password,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 500);
    if (!ok) return json({ error: "Invalid username or password" }, 401);

    return json({
      session: {
        id: seller.id,
        username: seller.username ?? "",
        name: seller.name ?? "",
        email: seller.email ?? "",
        canteen_name: seller.canteen_name ?? "",
      },
    });
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