import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  sealOrderMetadata,
  openOrderMetadata,
} from "../_shared/analytics-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Server-only writer/reader for order analytics rows.
// All sensitive fields (items, totals, payment, sellerName, sellerIcon, ...)
// are encrypted at rest. Only sellerId and appUserId stay queryable.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body?.op ?? "");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (op === "create") {
      const { user_id, session_id, metadata } = body ?? {};
      if (!session_id || !metadata) return json({ error: "missing session_id/metadata" }, 400);
      // ----- Server-side guards against ghost / malformed orders. -----
      // 1. Items must be a non-empty array.
      const items = (metadata as Record<string, unknown>)?.items;
      if (!Array.isArray(items) || items.length === 0) {
        return json({ error: "order has no items" }, 400);
      }
      // 2. Total must be > 0.
      const total = Number((metadata as Record<string, unknown>)?.total ?? 0);
      if (!Number.isFinite(total) || total <= 0) {
        return json({ error: "order total must be positive" }, 400);
      }
      // 3. App user id must be present.
      const appUserId = (metadata as Record<string, unknown>)?.appUserId;
      if (!appUserId || typeof appUserId !== "string") {
        return json({ error: "missing appUserId" }, 400);
      }
      // 4. Dedupe — refuse to create a second row for the same session_id.
      const { data: existing } = await admin
        .from("user_analytics")
        .select("id")
        .eq("session_id", session_id)
        .eq("event_type", "order")
        .limit(1)
        .maybeSingle();
      if (existing) {
        return json({ ok: true, deduped: true });
      }
      // 5. Server-side availability check for every cart item. Blocks orders
      //    that contain items whose stock is depleted or whose time window
      //    has closed — even if the client missed a realtime update.
      type OrderItemShape = { itemId?: string; qty?: number; name?: string };
      const typedItems = items as OrderItemShape[];
      const productIds = Array.from(
        new Set(typedItems.map((i) => i?.itemId).filter((v): v is string => !!v)),
      );
      const unavailable: string[] = [];
      for (const pid of productIds) {
        const { data: ok, error: availErr } = await admin.rpc("is_item_available", {
          product_id: pid,
        });
        if (availErr) return json({ error: "availability check failed" }, 500);
        if (!ok) {
          const name = typedItems.find((i) => i.itemId === pid)?.name ?? pid;
          unavailable.push(name);
        }
      }
      if (unavailable.length > 0) {
        return json({
          error: `These items are no longer available: ${unavailable.join(", ")}`,
        }, 409);
      }
      // 6. Cash on Delivery — enforce server-time window via is_cod_allowed().
      const payment = (metadata as Record<string, unknown>)?.payment;
      if (payment === "Cash") {
        const { data: codOk, error: codErr } = await admin.rpc("is_cod_allowed");
        if (codErr) return json({ error: "cod check failed" }, 500);
        if (!codOk) {
          return json({ error: "Cash on Delivery is not available at this time." }, 403);
        }
      }
      const sealed = await sealOrderMetadata(metadata);
      const { error } = await admin.from("user_analytics").insert({
        user_id: user_id && String(user_id).includes("-") ? user_id : null,
        session_id,
        screen_name: "order",
        event_type: "order",
        metadata: sealed,
      });
      if (error) return json({ error: error.message }, 500);
      // 7. Decrement stock for quantity-mode items. Best effort — the order
      //    is already persisted; stock failures here just get logged.
      for (const it of typedItems) {
        const pid = it?.itemId;
        const qty = Number(it?.qty ?? 0);
        if (!pid || !Number.isFinite(qty) || qty <= 0) continue;
        const { error: rErr } = await admin.rpc("reduce_seller_stock", {
          p_product_id: pid,
          p_qty: Math.floor(qty),
        });
        if (rErr) console.error("reduce_seller_stock failed", pid, rErr.message);
      }
      return json({ ok: true });
    }

    if (op === "update") {
      const { session_id, metadata } = body ?? {};
      if (!session_id || !metadata) return json({ error: "missing session_id/metadata" }, 400);
      const sealed = await sealOrderMetadata(metadata);
      const { error } = await admin
        .from("user_analytics")
        .update({ metadata: sealed })
        .eq("session_id", session_id)
        .eq("event_type", "order");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (op === "list") {
      const { seller_id, user_id, limit, since } = body ?? {};
      let q = admin
        .from("user_analytics")
        .select("id, session_id, created_at, metadata, user_id")
        .eq("event_type", "order")
        .eq("screen_name", "order")
        .order("created_at", { ascending: false })
        .limit(Number(limit) > 0 ? Math.min(Number(limit), 500) : 200);
      if (seller_id) q = q.eq("metadata->>sellerId", String(seller_id));
      else if (user_id && String(user_id).includes("-")) q = q.eq("user_id", String(user_id));
      else if (user_id) q = q.eq("metadata->>appUserId", String(user_id));
      if (since) {
        const d = new Date(typeof since === "number" ? since : String(since));
        if (!isNaN(d.getTime())) q = q.gte("created_at", d.toISOString());
      }
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      const rows = await Promise.all(
        (data ?? []).map(async (r) => ({
          id: r.id,
          session_id: r.session_id,
          created_at: r.created_at,
          user_id: r.user_id,
          metadata: await openOrderMetadata(r.metadata as Record<string, unknown> | null),
        })),
      );
      return json({ rows });
    }

    return json({ error: "unknown op" }, 400);
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