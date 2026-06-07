import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getSellerSession } from "@/utils/sessionManager";
import { collection, query, where, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";

type OrderItem = { emoji: string; name: string; qty: number };
type Order = {
  id: string;
  uid: string;
  agoMinutes: number;
  payment: "UPI" | "Cash";
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

const formatAgo = (m: number) => {
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
};

const SellerOrders = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => endOfDay(new Date()));
  const [salesOrders, setSalesOrders] = useState<Order[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(() => getSellerSession()?.id ?? null);

  useEffect(() => {
    setSellerId(getSellerSession()?.id ?? null);
  }, []);

  useEffect(() => {
    if (!sellerId) return;

    const from = startOfDay(startDate).getTime();
    const to = endOfDay(endDate).getTime();
    
    const salesRef = collection(db, "sellers", sellerId, "sales");
    const q = query(
      salesRef,
      where("timestamp", ">=", Timestamp.fromMillis(from)),
      where("timestamp", "<=", Timestamp.fromMillis(to))
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const historyList: Order[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const d = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        
        historyList.push({
          id: data.orderId || data.uid,
          uid: data.uid,
          agoMinutes: Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000)),
          payment: data.payment === "Cash" ? "Cash" : "UPI",
          total: data.totalAmount || 0,
          items: (data.items || []).map((i: any) => ({ emoji: i.icon || "🍽️", name: i.name, qty: i.qty })),
          completedAt: d,
        });
      });
      historyList.sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
      setSalesOrders(historyList);
    });

    return () => unsub();
  }, [startDate, endDate, sellerId]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return salesOrders;
    return salesOrders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [salesOrders, searchQuery]);

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
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">Order History</h1>
        </header>

        {/* Date range */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <DateField label="Start date" value={startDate} onChange={(d) => setStartDate(startOfDay(d))} />
          <DateField label="End date" value={endDate} onChange={(d) => setEndDate(endOfDay(d))} />
        </div>

          <section className="mt-6">
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" style={{ fontSize: 20 }}>
                search
              </span>
              <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                      o.payment === "Cash" ? "text-success" : "text-warning"
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
                </article>
              ))}
            </div>
          </section>
      </div>
    </div>
  );
};

export default SellerOrders;

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
