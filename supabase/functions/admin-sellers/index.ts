import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Master-admin operations on the sellers table. The table is locked to
// service_role; all admin reads/writes (including viewing email, phone, bank
// details, suspending, resetting password, creating sellers) go through here
// after verifying the caller is a master_admin.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { username, op } = body ?? {};
    if (!username || typeof username !== "string") return json({ error: "missing username" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: who } = await admin
      .from("master_admin")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (!who) return json({ error: "unauthorized" }, 401);

    if (op === "list") {
      const { data, error } = await admin
        .from("sellers")
        .select("id, name, canteen_name, phone, email, is_active, is_suspended, created_at")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ rows: data ?? [] });
    }

    if (op === "list_seed_scan") {
      const { data, error } = await admin
        .from("sellers")
        .select("id, name, canteen_name, email, phone")
        .limit(500);
      if (error) return json({ error: error.message }, 500);
      return json({ rows: data ?? [] });
    }

    if (op === "get") {
      const { id } = body;
      if (!id) return json({ error: "missing id" }, 400);
      // Explicitly exclude password_hash — never return credential material.
      const { data, error } = await admin
        .from("sellers")
        .select(
          "id, name, username, email, phone, canteen_name, canteen_location, canteen_type, bank_name, bank_ifsc, bank_account_number, upi_id, is_active, is_suspended, created_at, created_by",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ row: data });
    }

    if (op === "check_email") {
      const { email } = body;
      if (!email) return json({ error: "missing email" }, 400);
      const { data } = await admin.from("sellers").select("id").eq("email", email).maybeSingle();
      return json({ exists: Boolean(data) });
    }

    if (op === "create") {
      const { payload, password } = body;
      if (!payload || !password) return json({ error: "missing payload" }, 400);
      const { data: hash, error: he } = await admin.rpc("hash_password", { p_password: password });
      if (he) return json({ error: he.message }, 500);
      const { data, error } = await admin
        .from("sellers")
        .insert({ ...payload, password_hash: hash })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ id: data?.id });
    }

    if (op === "suspend") {
      const { id, suspended } = body;
      if (!id) return json({ error: "missing id" }, 400);
      const { error } = await admin.from("sellers").update({ is_suspended: Boolean(suspended) }).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (op === "reset_password") {
      const { id, password } = body;
      if (!id || !password) return json({ error: "missing id/password" }, 400);
      const { data: hash, error: he } = await admin.rpc("hash_password", { p_password: password });
      if (he) return json({ error: he.message }, 500);
      const { error } = await admin.from("sellers").update({ password_hash: hash }).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown op" }, 400);
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