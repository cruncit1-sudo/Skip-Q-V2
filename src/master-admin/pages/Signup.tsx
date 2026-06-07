import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSession, signupMasterAdmin, setSession, clearSession, logAudit } from "../auth";
import { useAdminPwa } from "../useAdminPwa";
import "../theme.css";

export default function Signup() {
  const navigate = useNavigate();
  useAdminPwa();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getSession()) navigate("/master-admin/overview", { replace: true });
    const t = setTimeout(() => {
      if (getSession()) navigate("/master-admin/overview", { replace: true });
    }, 100);
    return () => clearTimeout(t);
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signupMasterAdmin(username.trim(), email.trim(), password);
      clearSession();
      setSession(username.trim());
      await logAudit("ADMIN_SIGNUP", username.trim());
      navigate("/master-admin/overview", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ma-root" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <form onSubmit={submit} style={{
        width: "100%", maxWidth: 420, background: "#111118",
        borderRadius: 20, padding: "40px 48px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        border: "1px solid var(--ma-border)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "rgba(34, 197, 94, 0.15)", // Greenish tint for Signup
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16,
          }}>
            <span className="material-symbols-outlined" style={{ color: "#22C55E", fontSize: 30 }}>person_add</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "white", margin: 0 }}>Create Account</h1>
          <p style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
            Register a new Master Admin account
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="ma-label">Username</label>
          <input className="ma-input" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="ma-label">Email</label>
          <input className="ma-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div style={{ marginBottom: 16, position: "relative" }}>
          <label className="ma-label">Password</label>
          <input className="ma-input" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required style={{ paddingRight: 44 }} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label="Toggle password" style={{ position: "absolute", right: 12, top: 32, background: "transparent", border: 0, color: "#6B7280", cursor: "pointer" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{show ? "visibility_off" : "visibility"}</span>
          </button>
        </div>

        {error && <div style={{ color: "#FCA5A5", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={loading} className="ma-btn" style={{ width: "100%", padding: "14px 20px", fontSize: 16 }}>
          {loading ? "Signing up…" : "Sign Up"}
        </button>
        
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>
          Already have an account? <a href="/master-admin/login" onClick={(e) => { e.preventDefault(); navigate("/master-admin/login"); }} style={{ color: "#22C55E", textDecoration: "none", fontWeight: 600 }}>Log In</a>
        </div>
      </form>
    </div>
  );
}