import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import Shell from "../components/Shell";
import { db } from "../db";
import { logAudit, getSession } from "../auth";
import { supabase } from "@/integrations/supabase/client";
import { axisStyle, daysAgoISO, inr, todayISO, tooltipStyle } from "../format";

type Seller = {
  id: string; name: string; email: string; phone: string;
  canteen_name: string; canteen_location: string; canteen_type: string | null;
  upi_id: string | null; bank_account_number: string | null; bank_ifsc: string | null; bank_name: string | null;
  is_active: boolean; is_suspended: boolean; created_at: string;
};
type Sale = { date: string; total_orders: number; total_revenue: number };
type Product = { id: string; product_name: string; emoji: string | null; category: string | null; price: number; total_sold: number; total_revenue: number; is_active: boolean; last_sold_at: string | null };
type Session = { logged_in_at: string; logged_out_at: string | null; ip_address: string | null };

export default function SellerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [showFullAcct, setShowFullAcct] = useState(false);
  const [resetPwd, setResetPwd] = useState("");
  const [resetPwd2, setResetPwd2] = useState("");

  const load = async () => {
    if (!id) return;
    const username = getSession()?.username ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: sRes }, { data: ss }, { data: p }, { data: ses }] = await Promise.all([
      (supabase as any).functions.invoke("admin-sellers", { body: { username, op: "get", id } }),
      db.from("seller_sales").select("date, total_orders, total_revenue").eq("seller_id", id).gte("date", daysAgoISO(30)).order("date"),
      db.from("seller_products").select("*").eq("seller_id", id),
      db.from("seller_sessions").select("logged_in_at, logged_out_at, ip_address").eq("seller_id", id).order("logged_in_at", { ascending: false }).limit(10),
    ]);
    setSeller((sRes?.row ?? null) as Seller | null);
    setSales(ss ?? []);
    setProducts(p ?? []);
    setSessions(ses ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!seller) {
    return <Shell><div className="ma-card ma-empty">Loading…</div></Shell>;
  }

  const today = todayISO();
  const month = new Date().toISOString().slice(0,7);
  const todayRev = sales.filter((r) => r.date === today).reduce((a, r) => a + Number(r.total_revenue), 0);
  const monthRev = sales.filter((r) => r.date.startsWith(month)).reduce((a, r) => a + Number(r.total_revenue), 0);
  const allTimeRev = products.reduce((a, p) => a + Number(p.total_revenue || 0), 0);

  const sortedProducts = [...products].sort((a, b) => b.total_sold - a.total_sold);
  const dead = products.filter((p) => {
    if (p.total_sold === 0) return true;
    if (!p.last_sold_at) return false;
    return new Date(p.last_sold_at) < new Date(daysAgoISO(7));
  });

  const reveal = () => {
    if (!revealed && !confirm("You are viewing sensitive financial data. Continue?")) return;
    setRevealed((v) => !v);
  };

  const toggleSuspend = async () => {
    const next = !seller.is_suspended;
    const username = getSession()?.username ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).functions.invoke("admin-sellers", {
      body: { username, op: "suspend", id: seller.id, suspended: next },
    });
    await logAudit(next ? "SELLER_SUSPENDED" : "SELLER_REACTIVATED", seller.id);
    toast.success(next ? "Suspended" : "Reactivated");
    load();
  };

  const resetPassword = async () => {
    if (resetPwd.length < 8 || !/\d/.test(resetPwd)) return toast.error("Password ≥ 8 chars + number");
    if (resetPwd !== resetPwd2) return toast.error("Passwords do not match");
    const username = getSession()?.username ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: res, error } = await (supabase as any).functions.invoke("admin-sellers", {
      body: { username, op: "reset_password", id: seller.id, password: resetPwd },
    });
    if (error || res?.error) return toast.error(error?.message || res?.error);
    await logAudit("SELLER_PASSWORD_RESET", seller.id);
    toast.success("Password reset");
    setResetPwd(""); setResetPwd2("");
  };

  const acct = seller.bank_account_number ?? "";
  const acctMask = acct ? "•••• •••• " + acct.slice(-4) : "—";

  return (
    <Shell>
      <button onClick={() => navigate(-1)} className="ma-btn ma-btn-ghost" style={{ marginBottom: 12 }}>← Back</button>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }} className="ma-detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="ma-card">
            <div style={{ fontSize: 24, fontWeight: 800, color: "white" }}>{seller.canteen_name}</div>
            <div style={{ color: "var(--ma-text-2)", marginTop: 4 }}>{seller.name}</div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
              {seller.is_suspended ? <span className="ma-pill ma-pill-red">Suspended</span> : <span className="ma-pill ma-pill-green">Active</span>}
              <span style={{ color: "var(--ma-text-3)", fontSize: 12 }}>· Joined {new Date(seller.created_at).toLocaleDateString()}</span>
              <span style={{ color: "var(--ma-text-3)", fontSize: 12 }}>· {seller.canteen_location}</span>
            </div>
          </div>

          <div className="ma-grid-3">
            <div className="ma-card"><div style={{ fontSize: 12, color: "var(--ma-text-2)" }}>Today's Revenue</div><div style={{ fontSize: 22, fontWeight: 800, color: "#93C5FD" }}>{inr(todayRev)}</div></div>
            <div className="ma-card"><div style={{ fontSize: 12, color: "var(--ma-text-2)" }}>This Month</div><div style={{ fontSize: 22, fontWeight: 800, color: "#86EFAC" }}>{inr(monthRev)}</div></div>
            <div className="ma-card"><div style={{ fontSize: 12, color: "var(--ma-text-2)" }}>All Time</div><div style={{ fontSize: 22, fontWeight: 800, color: "#FBBF24" }}>{inr(allTimeRev)}</div></div>
          </div>

          <div className="ma-card">
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ma-text-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sales (30 days)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={sales}>
                <CartesianGrid stroke="#1E1E2E" />
                <XAxis dataKey="date" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="total_revenue" stroke="#2563EB" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="ma-card">
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ma-text-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Top selling products</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="ma-table">
                <thead><tr><th></th><th>Product</th><th>Cat</th><th>Price</th><th>Sold</th><th>Revenue</th><th>Status</th></tr></thead>
                <tbody>
                  {sortedProducts.map((p, i) => (
                    <tr key={p.id} style={i < 3 ? { borderLeft: `3px solid ${["#FBBF24","#9CA3AF","#D97706"][i]}` } : undefined}>
                      <td>{p.emoji ?? "•"}</td><td>{p.product_name}</td><td>{p.category ?? "—"}</td>
                      <td>{inr(p.price)}</td><td>{p.total_sold}</td><td>{inr(p.total_revenue)}</td>
                      <td>{p.is_active ? <span className="ma-pill ma-pill-green">Active</span> : <span className="ma-pill ma-pill-gray">Inactive</span>}</td>
                    </tr>
                  ))}
                  {sortedProducts.length === 0 && <tr><td colSpan={7} className="ma-empty">No products yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {dead.length > 0 && (
            <div className="ma-card" style={{ background: "#1A0A0A", borderColor: "#3D1515" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#FCA5A5", textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠ Products with no recent sales</h3>
              <div style={{ overflowX: "auto" }}>
                <table className="ma-table">
                  <thead><tr><th></th><th>Product</th><th>Last sold</th></tr></thead>
                  <tbody>
                    {dead.map((p) => <tr key={p.id}><td>{p.emoji ?? "•"}</td><td>{p.product_name}</td><td>{p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString() : "Never"}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="ma-card" style={{ background: "#0A0A14", borderColor: "rgba(37,99,235,0.3)" }}>
            <button onClick={reveal} style={{ background: "transparent", border: 0, color: "white", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
              <span className="material-symbols-outlined">{revealed ? "lock_open" : "lock"}</span>
              Sensitive information — click to {revealed ? "hide" : "reveal"}
            </button>
            {revealed && (
              <div style={{ marginTop: 16, fontSize: 13, color: "var(--ma-text-2)", display: "grid", gap: 8 }}>
                <Row k="Phone" v={seller.phone} />
                <Row k="Email" v={seller.email} />
                <Row k="UPI ID" v={seller.upi_id ?? "—"} />
                <Row k="Bank Acc" v={
                  <span onMouseEnter={() => setShowFullAcct(true)} onMouseLeave={() => setShowFullAcct(false)} style={{ fontFamily: "monospace" }}>
                    {showFullAcct && acct ? acct : acctMask}
                  </span>
                } />
                <Row k="IFSC" v={seller.bank_ifsc ?? "—"} />
                <Row k="Bank" v={seller.bank_name ?? "—"} />
              </div>
            )}
          </div>

          <div className="ma-card">
            <h3 style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ma-text-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Login history</h3>
            {sessions.length === 0 ? <div className="ma-empty" style={{ padding: 16 }}>No logins yet</div> : (
              <table className="ma-table">
                <thead><tr><th>Date</th><th>Time</th><th>IP</th></tr></thead>
                <tbody>
                  {sessions.map((s, i) => {
                    const d = new Date(s.logged_in_at);
                    return <tr key={i}><td style={{ fontSize: 12 }}>{d.toLocaleDateString()}</td><td style={{ fontSize: 12 }}>{d.toLocaleTimeString()}</td><td style={{ fontSize: 12, fontFamily: "monospace" }}>{s.ip_address ?? "—"}</td></tr>;
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="ma-card">
            <h3 style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ma-text-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Admin controls</h3>
            <button onClick={toggleSuspend} className={`ma-btn ${seller.is_suspended ? "ma-btn-success" : "ma-btn-danger"}`} style={{ width: "100%", marginBottom: 10 }}>
              {seller.is_suspended ? "Reactivate Seller" : "Suspend Seller"}
            </button>
            <div style={{ marginTop: 10 }}>
              <label className="ma-label">Reset password</label>
              <input className="ma-input" type="password" placeholder="New password" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} style={{ marginBottom: 8 }} />
              <input className="ma-input" type="password" placeholder="Confirm new password" value={resetPwd2} onChange={(e) => setResetPwd2(e.target.value)} style={{ marginBottom: 8 }} />
              <button onClick={resetPassword} className="ma-btn ma-btn-warning" style={{ width: "100%" }}>Reset Seller Password</button>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: "var(--ma-text-3)" }}>{k}</span><span style={{ color: "white" }}>{v}</span></div>;
}