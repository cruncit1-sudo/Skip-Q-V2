import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { rangeBounds, type RangeKey } from "@/lib/sellerStats";
import { getSellerSession } from "@/utils/sessionManager";
import { collection, query, where, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";

const CATEGORY_EMOJI: Record<string, string> = {
  Food: "🍛",
  Snacks: "🍟",
  Drinks: "🥤",
};

const SalesDashboard = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeKey>("today");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [stats, setStats] = useState({
    revenue: 0,
    totalOrders: 0,
    categories: [] as { category: string; totalSold: number; items: { name: string; sold: number }[] }[],
    peakHour: "—",
    topItem: "—"
  });

  useEffect(() => {
    const sellerId = getSellerSession()?.id;
    if (!sellerId) return;

    const { from, to } = rangeBounds(range);
    const salesRef = collection(db, "sellers", sellerId, "sales");
    const q = query(
      salesRef,
      where("timestamp", ">=", Timestamp.fromMillis(from)),
      where("timestamp", "<=", Timestamp.fromMillis(to))
    );

    const unsub = onSnapshot(q, (snapshot) => {
      let revenue = 0;
      let totalOrders = 0;
      const cats = new Map<string, { totalSold: number; items: Map<string, { name: string; sold: number }> }>();
      const hours = new Array(24).fill(0);
      const itemMap = new Map<string, { name: string; qty: number }>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        revenue += data.totalAmount || 0;
        totalOrders += 1;

        if (data.timestamp) {
          const d = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
          hours[d.getHours()] += data.totalAmount || 0;
        }

        if (data.items && Array.isArray(data.items)) {
          data.items.forEach((item: any) => {
            const catName = item.category || "Other";
            if (!cats.has(catName)) cats.set(catName, { totalSold: 0, items: new Map() });
            const c = cats.get(catName)!;
            c.totalSold += item.qty;

            if (!c.items.has(item.itemId)) c.items.set(item.itemId, { name: item.name, sold: 0 });
            c.items.get(item.itemId)!.sold += item.qty;

            if (!itemMap.has(item.itemId)) itemMap.set(item.itemId, { name: item.name, qty: 0 });
            itemMap.get(item.itemId)!.qty += item.qty;
          });
        }
      });

      const categories = Array.from(cats.entries()).map(([category, v]) => ({
        category,
        totalSold: v.totalSold,
        items: Array.from(v.items.values()).sort((a, b) => b.sold - a.sold),
      })).sort((a, b) => b.totalSold - a.totalSold);

      let bestHour = 0;
      let bestVal = 0;
      hours.forEach((v, i) => { if (v > bestVal) { bestVal = v; bestHour = i; } });
      const peakHour = bestVal === 0 ? "—" : `${bestHour % 12 === 0 ? 12 : bestHour % 12}:00 ${bestHour < 12 ? "AM" : "PM"}`;

      let topItem = "—";
      let topQty = 0;
      itemMap.forEach((v) => { if (v.qty > topQty) { topQty = v.qty; topItem = v.name; } });

      setStats({ revenue, totalOrders, categories, peakHour, topItem });
    }, (err) => {
      console.error("Sales real-time error:", err);
    });

    return () => unsub();
  }, [range]);

  const { revenue, categories, peakHour, topItem } = stats;
  const totalCats = categories.length;
  // Default-open the first category for visual consistency.
  const effectiveOpenKey = openKey ?? categories[0]?.category ?? null;

  return (
    <div className="seller-admin-shell">
      <div className="seller-admin-content">
        {/* Title */}
        <section className="flex items-start gap-3">
          <Link
            to="/seller/dashboard"
            aria-label="Back"
            className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <div className="min-w-0 flex-1">
          <h2 className="text-3xl font-extrabold tracking-tight">Sales Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your canteen performance
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full bg-secondary/70 p-1">
              {(["today", "week", "month"] as RangeKey[]).map((k) => {
                const active = range === k;
                return (
                  <button
                    key={k}
                    onClick={() => setRange(k)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition sm:px-4 sm:text-xs ${
                      active ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground"
                    }`}
                  >
                    {k}
                    {active && (
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        check_circle
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => navigate("/seller/sales/reports")}
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-primary transition hover:bg-primary/20 sm:px-4 sm:text-xs"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                bar_chart
              </span>
              <span className="whitespace-nowrap">View Reports</span>
            </button>
          </div>
          </div>
        </section>

        {/* Sales card */}
        <section className="mt-5 rounded-3xl border border-border bg-gradient-card p-5 shadow-card">
          <div className="flex items-start justify-between">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
              <span className="material-symbols-outlined">payments</span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                trending_up
              </span>
              +8.5%
            </span>
          </div>
          <p className="mt-5 text-xs font-bold tracking-[0.2em] text-muted-foreground">
            {range === "today" ? "TODAY'S SALES" : range === "week" ? "THIS WEEK" : "THIS MONTH"}
          </p>
          <p className="mt-1.5 text-4xl font-extrabold tracking-tight">
            ₹{revenue.toLocaleString("en-IN")}
            <span className="ml-2 align-middle text-xs font-bold tracking-wide text-muted-foreground">
              INR
            </span>
          </p>
        </section>

        {/* Sales by category */}
        <section className="mt-7">
          <div className="flex items-end justify-between">
            <h3 className="text-lg font-extrabold tracking-tight">Sales by Category</h3>
            <span className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground">
              {totalCats} CATEGORIES
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {categories.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
                No sales in this range yet.
              </p>
            )}
            {categories.map((cat) => {
              const open = effectiveOpenKey === cat.category;
              return (
                <div
                  key={cat.category}
                  className="overflow-hidden rounded-2xl border border-border bg-gradient-card shadow-card"
                >
                  <button
                    onClick={() => setOpenKey(open ? "" : cat.category)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                    aria-expanded={open}
                  >
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">
                      {CATEGORY_EMOJI[cat.category] ?? "🍽️"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold leading-tight">{cat.category}</p>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                        {cat.totalSold} items sold
                      </p>
                    </div>
                    <span
                      className="material-symbols-outlined text-muted-foreground transition-transform"
                      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      keyboard_arrow_down
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-border/60 bg-secondary/30 p-3 space-y-2">
                      {cat.items.map((it) => (
                        <div
                          key={it.name}
                          className="flex items-center justify-between rounded-xl bg-background/60 px-4 py-2.5"
                        >
                          <span className="truncate text-sm font-semibold">{it.name}</span>
                          <span className="text-sm font-bold text-primary">{it.sold} sold</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom stats */}
        <section className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-gradient-card p-4 shadow-card">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-warning/15 text-warning">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                schedule
              </span>
            </div>
            <p className="mt-3 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
              PEAK HOUR
            </p>
            <p className="mt-1 text-xl font-extrabold tracking-tight">
              {peakHour}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-gradient-card p-4 shadow-card">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                star
              </span>
            </div>
            <p className="mt-3 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
              TOP ITEM
            </p>
            <p className="mt-1 truncate text-xl font-extrabold tracking-tight">
              {topItem}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SalesDashboard;
