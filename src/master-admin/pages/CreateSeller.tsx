import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Shell from "../components/Shell";
import { logAudit, getSession } from "../auth";
import { supabase } from "@/integrations/supabase/client";

const generatePassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 11; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + Math.floor(Math.random() * 10);
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);

export default function CreateSeller() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    canteen_name: "", canteen_location: "", canteen_type: "All",
    username: "", password: "", confirm: "",
    upi_id: "", bank_account_number: "", bank_ifsc: "", bank_name: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(form.phone)) return toast.error("Phone must be 10 digits");
    if (form.password.length < 8 || !/\d/.test(form.password)) return toast.error("Password ≥ 8 chars and include a number");
    if (form.password !== form.confirm) return toast.error("Passwords do not match");

    setSubmitting(true);
    try {
      const username = getSession()?.username ?? "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: chk } = await sb.functions.invoke("admin-sellers", {
        body: { username, op: "check_email", email: form.email },
      });
      if (chk?.exists) { toast.error("Email already in use"); setSubmitting(false); return; }

      const payload = {
        name: form.name, email: form.email, phone: form.phone,
        canteen_name: form.canteen_name, canteen_location: form.canteen_location,
        canteen_type: form.canteen_type,
        username: form.username || slug(form.canteen_name),
        upi_id: form.upi_id || null,
        bank_account_number: form.bank_account_number || null,
        bank_ifsc: form.bank_ifsc || null,
        bank_name: form.bank_name || null,
      };
      const { data: res, error } = await sb.functions.invoke("admin-sellers", {
        body: { username, op: "create", payload, password: form.password },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);

      await logAudit("SELLER_CREATED", res?.id, { canteen_name: form.canteen_name, email: form.email });
      toast.success("Seller account created. Share credentials securely.");
      setCreated({ username: form.username || slug(form.canteen_name), password: form.password });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <Shell>
        <div className="ma-card" style={{ maxWidth: 520, margin: "0 auto" }}>
          <h2 style={{ marginTop: 0 }}>Seller created ✓</h2>
          <p style={{ color: "var(--ma-text-2)", fontSize: 13 }}>Share these credentials securely. They will not be shown again.</p>
          <div style={{ background: "#0A0A14", border: "1px solid #2563EB55", padding: 16, borderRadius: 12, fontFamily: "monospace", fontSize: 13, marginTop: 16 }}>
            <div>Username: <strong>{created.username}</strong></div>
            <div>Password: <strong>{created.password}</strong></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="ma-btn" onClick={() => { navigator.clipboard.writeText(`Username: ${created.username}\nPassword: ${created.password}`); toast.success("Copied"); }}>Copy</button>
            <button className="ma-btn ma-btn-outline" onClick={() => navigate("/master-admin/sellers")}>Done</button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="ma-card" style={{ maxWidth: 800, margin: "0 auto", borderRadius: 20, padding: 32 }}>
        <Section title="Personal details">
          <Field label="Full name"><input className="ma-input" required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Email address"><input className="ma-input" required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone number"><input className="ma-input" required value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0,10))} /></Field>
        </Section>

        <Section title="Canteen details">
          <Field label="Canteen name"><input className="ma-input" required value={form.canteen_name} onChange={(e) => set("canteen_name", e.target.value)} onBlur={() => !form.username && set("username", slug(form.canteen_name))} /></Field>
          <Field label="Location / block / floor"><input className="ma-input" required value={form.canteen_location} onChange={(e) => set("canteen_location", e.target.value)} /></Field>
          <Field label="Canteen type">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["Food","Snacks","Drinks","All"].map((t) => (
                <button type="button" key={t} onClick={() => set("canteen_type", t)}
                  className={`ma-pill ${form.canteen_type === t ? "ma-pill-blue" : "ma-pill-gray"}`}
                  style={{ cursor: "pointer", padding: "8px 14px", border: 0 }}>{t}</button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="Login credentials">
          <Field label="Username"><input className="ma-input" value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="auto from canteen name" /></Field>
          <Field label="Temporary password">
            <div style={{ display: "flex", gap: 8 }}>
              <input className="ma-input" type={showPwd ? "text" : "password"} value={form.password} onChange={(e) => set("password", e.target.value)} required />
              <button type="button" className="ma-btn ma-btn-outline" onClick={() => { const p = generatePassword(); set("password", p); set("confirm", p); setShowPwd(true); }}>Generate</button>
            </div>
          </Field>
          <Field label="Confirm password"><input className="ma-input" type={showPwd ? "text" : "password"} value={form.confirm} onChange={(e) => set("confirm", e.target.value)} required /></Field>
        </Section>

        <Section title="Financial details (optional)">
          <Field label="UPI ID"><input className="ma-input" value={form.upi_id} onChange={(e) => set("upi_id", e.target.value)} /></Field>
          <Field label="Bank account number"><input className="ma-input" value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)} /></Field>
          <Field label="Bank IFSC"><input className="ma-input" value={form.bank_ifsc} onChange={(e) => set("bank_ifsc", e.target.value.toUpperCase())} /></Field>
          <Field label="Bank name"><input className="ma-input" value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} /></Field>
        </Section>

        <button className="ma-btn" disabled={submitting} style={{ width: "100%", padding: "14px 20px", marginTop: 8 }}>
          {submitting ? "Creating…" : "Create Seller Account"}
        </button>
      </form>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 12, color: "var(--ma-text-2)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="ma-form-grid">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="ma-label">{label}</label>{children}</div>;
}