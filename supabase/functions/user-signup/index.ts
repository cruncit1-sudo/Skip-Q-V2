import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const fullName = String(body.full_name ?? "").trim();
    const userId = String(body.user_id ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const collegeName = String(body.college_name ?? "").trim();
    const pin = String(body.pin ?? "").trim();

    if (fullName.length < 2)
      return json({ error: "Full name required" }, 400);
    if (!/^[a-z0-9_]{3,30}$/.test(userId))
      return json({ error: "Invalid user ID" }, 400);
    if (!/^\d{10}$/.test(phone))
      return json({ error: "Phone must be 10 digits" }, 400);
    if (!collegeName) return json({ error: "College required" }, 400);
    if (!/^\d{4}$/.test(pin))
      return json({ error: "PIN must be 4 digits" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) return json({ error: "User ID already taken" }, 409);

    const pinHash = await sha256Hex(pin + userId);
    const { data: created, error } = await admin
      .from("users")
      .insert({
        full_name: fullName,
        user_id: userId,
        phone,
        college_name: collegeName,
        pin_hash: pinHash,
      })
      .select("id, full_name, user_id, phone, college_name")
      .single();
    if (error) return json({ error: error.message }, 500);

    // Fire-and-forget Razorpay customer creation.
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    let razorpayId: string | null = null;
    if (keyId && keySecret) {
      try {
        const r = await fetch("https://api.razorpay.com/v1/customers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
          },
          body: JSON.stringify({
            name: fullName,
            contact: phone,
            fail_existing: "0",
          }),
        });
        if (r.ok) {
          const j = await r.json();
          razorpayId = j.id ?? null;
          if (razorpayId) {
            await admin
              .from("users")
              .update({ razorpay_customer_id: razorpayId })
              .eq("id", created.id);
          }
        }
      } catch {
        /* non-blocking */
      }
    }

    return json({
      user: { ...created, razorpay_customer_id: razorpayId },
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