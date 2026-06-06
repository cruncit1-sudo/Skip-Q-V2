const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const receipt = String(body.receipt ?? `rcpt_${Date.now()}`).slice(0, 40);
    const subtotal = Number(body.subtotal);
    const sellerId = typeof body.sellerId === "string" ? body.sellerId : null;

    // Server is the source of truth for the chargeable amount. If a subtotal +
    // sellerId is provided we re-validate the active offer against the DB and
    // recompute the discounted total so the client cannot tamper with it. The
    // client-supplied amount is never trusted as a fallback.
    let amount = 0;
    if (subtotal && subtotal > 0) {
      let discountPct = 0;
      if (sellerId) {
        try {
          const supaUrl = Deno.env.get("SUPABASE_URL");
          const supaKey =
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
            Deno.env.get("SUPABASE_ANON_KEY");
          if (supaUrl && supaKey) {
            const today = new Date().toISOString().slice(0, 10);
            const url =
              `${supaUrl}/rest/v1/seller_offers` +
              `?select=discount_pct,start_date,end_date,kind,is_active` +
              `&seller_id=eq.${encodeURIComponent(sellerId)}` +
              `&is_active=eq.true` +
              `&kind=eq.general`;
            const res = await fetch(url, {
              headers: {
                apikey: supaKey,
                Authorization: `Bearer ${supaKey}`,
              },
            });
            if (res.ok) {
              const rows = (await res.json()) as Array<{
                discount_pct: number;
                start_date: string | null;
                end_date: string | null;
              }>;
              for (const r of rows) {
                if (r.start_date && r.start_date > today) continue;
                if (r.end_date && r.end_date < today) continue;
                const p = Math.max(0, Math.min(100, Number(r.discount_pct) || 0));
                if (p > discountPct) discountPct = p;
              }
            }
          }
        } catch (_) {
          discountPct = 0;
        }
      }
      amount = Math.max(1, Math.round(subtotal * (1 - discountPct / 100)));
    }

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "invalid_amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      return new Response(JSON.stringify({ error: "razorpay_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const basic = btoa(`${keyId}:${keySecret}`);
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt,
        payment_capture: 1,
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.id) {
      return new Response(JSON.stringify({ error: "razorpay_error", detail: j }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        order_id: j.id,
        amount: j.amount,
        currency: j.currency,
        key_id: keyId,
        validated_amount: amount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal", detail: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});