import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  getOrders,
  loadOrdersFromBackend,
  setOrderStatus,
  subscribeOrders,
  type Order as StoreOrder,
} from "@/lib/sellerOrders";
import { getSellerSession } from "@/utils/sessionManager";

type TabKey = "live" | "history";
type ViewKey = "bulk" | "individual";

type BulkRow = {
  emoji: string;
  name: string;
  category: string;
  units: number;
  tone: "primary" | "accent" | "warning";
};

type OrderItem = { emoji: string; name: string; qty: number };
type Order = {
  id: string;
  uid: string;
  agoMinutes: number;
  payment: "Online" | "Cash";
  total: number;
  items: OrderItem[];
  completedAt?: Date;
};

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const toneClasses: Record<BulkRow["tone"], string> = {
  primary: "text-primary",
  accent: "text-accent",
  warning: "text-warning",
};

const formatAgo = (m: number) => {
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
};

const SellerOrders = () => {
  const [tab, setTab] = useState<TabKey>("live");
  const [view, setView] = useState<ViewKey>("bulk");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => endOfDay(new Date()));
  const [storeOrders, setStoreOrders] = useState<StoreOrder[]>(() => getOrders());
  const [sellerId, setSellerId] = useState<string | null>(() => getSellerSession()?.id ?? null);

  useEffect(() => {
    const sid = getSellerSession()?.id ?? null;
    setSellerId(sid);
    const unsub = subscribeOrders(() => setStoreOrders(getOrders()));
    loadOrdersFromBackend(sid).then(setStoreOrders).catch(() => setStoreOrders([]));
    return unsub;
  }, []);

  // Scope every derived list to the currently logged-in seller so other
  // sellers' cached orders never leak into bulk/individual views.
  const sellerOrders = useMemo(
    () => (sellerId ? storeOrders.filter((o) => o.sellerId === sellerId) : storeOrders),
    [storeOrders, sellerId],
  );

  const liveOrders: Order[] = useMemo(
    () =>
      sellerOrders
        .filter((o) => o.status === "Pending")
        .map(toOrder),
    [sellerOrders],
  );

  const historyOrders: Order[] = useMemo(
    () =>
      sellerOrders
        .filter((o) => o.status !== "Pending")
        .map(toOrder),
    [sellerOrders],
  );

  // Aggregate items across live orders for the bulk summary view.
  const bulkRows: BulkRow[] = useMemo(() => {
    const map = new Map<string, BulkRow & { units: number }>();
    const tones: BulkRow["tone"][] = ["primary", "accent", "warning"];
    sellerOrders
      .filter((o) => o.status === "Pending")
      .forEach((o) =>
        o.items.forEach((it) => {
          // Stable composite key: prefer itemId, but always include name+category
          // so different products never collide on a missing/duplicate itemId,
          // and the same product across orders always merges into one row.
          const key = `${(it.itemId ?? "").trim()}|${it.name.trim().toLowerCase()}|${it.category}`;
          const cur = map.get(key);
          if (cur) cur.units += it.qty;
          else
            map.set(key, {
              emoji: it.icon,
              name: it.name,
              category: it.category,
              units: it.qty,
              tone: tones[map.size % tones.length],
            });
        }),
      );
    return Array.from(map.values()).sort((a, b) => b.units - a.units);
  }, [sellerOrders]);

  const sourceOrders = useMemo(() => {
    if (tab === "live") return liveOrders;
    const from = startOfDay(startDate).getTime();
    const to = endOfDay(endDate).getTime();
    return historyOrders.filter((o) => {
      if (!o.completedAt) return false;
      const t = o.completedAt.getTime();
      return t >= from && t <= to;
    });
  }, [tab, startDate, endDate, liveOrders, historyOrders]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sourceOrders;
    return sourceOrders.filter(
      (o) =>
        o.id.includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [sourceOrders, query]);

  const totalOrders = sourceOrders.length;

  return (
    <div className="seller-admin-shell">
      <div className="seller-admin-content">
        {/* Header */}
        <header className="flex items-center gap-3">
          <Link
            to="/seller/dashboard"
            aria-label="Back"
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">Orders</h1>
        </header>

        {/* Tabs */}
        <div className="mt-6 flex items-center gap-6 border-b border-border">
          {(["live", "history"] as TabKey[]).map((k) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`relative pb-3 text-sm font-bold tracking-wide transition ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "live" ? "Live Orders" : "History"}
                {active && (
                  <span className="absolute -bottom-px left-0 h-0.5 w-8 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {/* View segmented — only on Live */}
        {tab === "live" && (
          <div className="mt-5 inline-flex rounded-full bg-secondary/70 p-1">
            {(["bulk", "individual"] as ViewKey[]).map((k) => {
              const active = view === k;
              return (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold capitalize transition ${
                    active ? "bg-background text-primary shadow-card" : "text-muted-foreground"
                  }`}
                >
                  {k}
                </button>
              );
            })}
          </div>
        )}

        {/* Date range — only on History */}
        {tab === "history" && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <DateField label="Start date" value={startDate} onChange={(d) => setStartDate(startOfDay(d))} />
            <DateField label="End date" value={endDate} onChange={(d) => setEndDate(endOfDay(d))} />
          </div>
        )}

        {tab === "live" && view === "bulk" ? (
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-[0.2em] text-muted-foreground">
                BULK SUMMARY
              </h2>
              <span className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold tracking-[0.15em] text-primary">
                FROM {totalOrders} ORDERS
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {bulkRows.map((row) => (
                <div
                  key={row.name}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-gradient-card p-4 shadow-card"
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">
                    {row.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold leading-tight">{row.name}</p>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      {row.category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-extrabold ${toneClasses[row.tone]}`}>
                      {row.units}
                    </p>
                    <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">
                      UNITS
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-6">
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" style={{ fontSize: 20 }}>
                search
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by order ID or item"
                className="w-full rounded-full border border-border bg-secondary/60 py-3 pl-11 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="mt-4 space-y-4">
              {filteredOrders.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
                  No orders found
                </p>
              )}
              {filteredOrders.map((o) => (
                <article
                  key={o.uid}
                  className="rounded-2xl border border-border bg-gradient-card p-4 shadow-card"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                        ORDER ID
                      </p>
                      <p className="mt-1 text-2xl font-extrabold tracking-tight">#{o.id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                        STATUS
                      </p>
                      <p className="mt-1 text-sm font-semibold text-primary">
                        {formatAgo(o.agoMinutes)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-secondary/50 p-3">
                    {o.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-1.5 text-sm"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base">{it.emoji}</span>
                          <span className="truncate font-semibold">{it.name}</span>
                        </div>
                        <span className="font-bold text-muted-foreground">x{it.qty}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                        PAYMENT
                      </p>
                      <p
                        className={`mt-0.5 text-sm font-bold ${
                          o.payment === "Online" ? "text-warning" : "text-success"
                        }`}
                      >
                        {o.payment}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                        TOTAL
                      </p>
                      <p className="mt-0.5 text-xl font-extrabold">₹{o.total}</p>
                    </div>
                  </div>
                  {tab === "live" && (
                    <button
                      type="button"
                      onClick={() => setOrderStatus(o.uid, "Completed")}
                      className="mt-3 w-full rounded-full bg-primary py-2 text-xs font-extrabold uppercase tracking-wider text-primary-foreground transition hover:bg-primary/90"
                    >
                      Mark Completed
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Live syncing pill */}
      {tab === "live" && (
        <div className="pointer-events-none fixed bottom-5 left-0 right-0 flex justify-center">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 shadow-card backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            <span className="text-[11px] font-bold tracking-[0.2em] text-foreground">
              LIVE SYNCING
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerOrders;

// Convert a store order to the local UI shape.
function toOrder(o: StoreOrder): Order {
  const completedAt = o.completedAt ? new Date(o.completedAt) : undefined;
  const ago = Math.max(0, Math.floor((Date.now() - o.createdAt) / 60000));
  return {
    id: o.id,
    uid: o.uid,
    agoMinutes: ago,
    payment: o.payment,
    total: o.total,
    items: o.items.map((i) => ({ emoji: i.icon, name: i.name, qty: i.qty })),
    completedAt,
  };
}

type DateFieldProps = {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
};

const DateField = ({ label, value, onChange }: DateFieldProps) => {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
        {label.toUpperCase()}
      </p>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center justify-between rounded-full border border-border bg-secondary/60 px-4 py-2.5 text-sm font-semibold transition hover:border-primary/40"
            )}
          >
            <span>{format(value, "dd MMM yyyy")}</span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => d && onChange(d)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};
