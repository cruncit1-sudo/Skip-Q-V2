import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Writes a row to admin_audit_log using the service role. The caller passes
// the logged-in admin username; we verify it exists in master_admin before
// inserting. The table is fully locked to anon/authenticated so this is the
// only write path. Reads are also restricted (service role only).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { username, op, action_type, target, details } = body ?? {};
    if (!username) return json({ error: "missing username" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: who } = await admin
      .from("master_admin")
      .select("id")
      .eq("username", String(username))
      .maybeSingle();
    if (!who) return json({ error: "unauthorized" }, 401);

    if (op === "list") {
      const { data, error } = await admin
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return json({ error: error.message }, 500);
      return json({ rows: data ?? [] });
    }

    // Default: append a log entry
    if (!action_type) return json({ error: "missing action_type" }, 400);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const { error } = await admin.from("admin_audit_log").insert({
      action_type: String(action_type).slice(0, 100),
      target: target ? String(target).slice(0, 200) : null,
      details: details ?? null,
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