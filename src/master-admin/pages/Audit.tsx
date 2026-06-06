import { useEffect, useMemo, useState } from "react";
import Shell from "../components/Shell";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "../auth";

type Row = { id: string; action_type: string; target: string | null; details: Record<string, unknown> | null; ip_address: string | null; created_at: string };

export default function Audit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => { (async () => {
    const s = getSession();
    if (!s?.username) return;
    const { data } = await supabase.functions.invoke("admin-audit-log", {
      body: { username: s.username, op: "list" },
    });
    setRows(((data as { rows?: Row[] })?.rows) ?? []);
  })(); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (type !== "all" && r.action_type !== type) return false;
    if (from && r.created_at.slice(0,10) < from) return false;
    if (to && r.created_at.slice(0,10) > to) return false;
    return true;
  }), [rows, type, from, to]);

  const types = Array.from(new Set(rows.map((r) => r.action_type)));

  return (
    <Shell>
      <div className="ma-card" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="ma-input" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 220 }}>
          <option value="all">All actions</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="ma-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 170 }} />
        <input className="ma-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 170 }} />
      </div>

      <div className="ma-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="ma-table">
          <thead><tr><th>Timestamp</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={5} className="ma-empty">No audit events</td></tr>
              : filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12, fontFamily: "monospace" }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td><span className="ma-pill ma-pill-blue">{r.action_type}</span></td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.target ?? "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--ma-text-2)" }}>{r.details ? JSON.stringify(r.details) : "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.ip_address ?? "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}