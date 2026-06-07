import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserSession } from "@/utils/sessionManager";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const UserLogin = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (getUserSession()) navigate("/app/home", { replace: true });
    const t = setTimeout(() => {
      if (getUserSession()) navigate("/app/home", { replace: true });
    }, 100);
    return () => clearTimeout(t);
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!/^\d{10}$/.test(phone)) {
      setErrorMsg("Enter a valid 10-digit mobile number");
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      const db = getFirestore();
      const userRef = doc(db, "users", phone);
      const userSnap = await getDoc(userRef);

      let session;

      // 1. Check if user exists in Firebase Firestore
      if (userSnap.exists()) {
        const userData = userSnap.data();
        session = { id: phone, role: "user", phone, full_name: userData.full_name || "Student" };
      } else {
        // 2. If not, create a new user profile in Firebase
        const newUser = { phone, role: "user", full_name: "Student", user_id: phone, created_at: Date.now() };
        await setDoc(userRef, newUser);
        session = { id: phone, role: "user", phone, full_name: "Student" };
      }

      // Fallback session storage. If your sessionManager uses a specific key 
      // (like 'active_session' or 'bitez_user_session'), it will be written here.
      localStorage.setItem("bitez_user_session", JSON.stringify(session));
      localStorage.setItem("active_session", JSON.stringify(session));

      // Trigger hard reload so session manager cleanly reads the fresh login cache
      window.location.href = "/app/home";
    } catch (err) {
      setErrorMsg((err as Error).message || "Could not log in");
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = () => {
    setShake(true);
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShake(false), 500);
  };

  return (
    <main
      className="user-page relative flex flex-col items-center justify-center antialiased overflow-hidden"
      style={{ color: "hsl(var(--user-text))" }}
    >
      <BitezBloom />
      <div className="h-[280px] flex flex-col items-center justify-center">
        <h1
          className="font-extrabold tracking-tight leading-none mb-4 bitez-glow"
          style={{ fontSize: 44, color: "#1D1D1F" }}
        >
          Bitez
        </h1>
        <div className="flex items-center gap-2">
          <span
            className="font-semibold uppercase"
            style={{ fontSize: 13, color: "#86868B", letterSpacing: "0.05em" }}
          >
            FRESH. FAST. YOURS.
          </span>
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              background: "#0071E3",
              animation: "bitez-pulse 3s infinite ease-in-out",
            }}
          />
        </div>
      </div>

      <div className="user-content border-rose-200" style={{ maxWidth: 448 }}>
        <h2
          className="text-center mb-2"
          style={{ fontSize: 24, fontWeight: 700, color: "#1D1D1F" }}
        >
          Welcome back
        </h2>
        <p
          className="text-center mb-10"
          style={{ fontSize: 15, color: "#86868B" }}
        >
          Sign in to continue
        </p>

        <form onSubmit={submit} className="space-y-8">
          <div>
            <label
              className="block ml-1 mb-2 uppercase font-semibold tracking-wider"
              style={{ fontSize: 13, color: "#86868B" }}
            >
              ENTER MOBILE NUMBER
            </label>
            <div
              className="lg-input flex items-center px-5"
              style={{
                ...lgStyle,
                animation: shake ? "bitez-shake 0.5s" : undefined,
              }}
            >
              <span
                className="material-symbols-outlined mr-4"
                style={{ color: "#8E8E93", fontSize: 22 }}
              >
                call
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="10-digit number"
                className="flex-1 bg-transparent outline-none border-none font-medium"
                style={{
                  fontSize: 17,
                  color: "#1D1D1F",
                }}
                autoFocus
              />
            </div>
            {errorMsg && (
              <div
                className="ml-1 mt-2"
                style={{ fontSize: 13, color: "#EF4444" }}
              >
                {errorMsg}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full font-bold transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
            style={btnStyle}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
};

export const lgStyle: React.CSSProperties = {
  background: "hsl(var(--user-surface) / 0.66)",
  backdropFilter: "blur(18px) saturate(145%)",
  WebkitBackdropFilter: "blur(18px) saturate(145%)",
  border: "1px solid hsl(var(--user-border) / 0.82)",
  boxShadow: "0 8px 24px hsl(220 25% 40% / 0.08)",
  height: 64,
  borderRadius: 12,
};

export const btnStyle: React.CSSProperties = {
  background: "#0071E3",
  borderRadius: 9999,
  height: 54,
  fontSize: 17,
  color: "#FFFFFF",
  boxShadow: "0 4px 14px 0 rgba(0,113,227,0.3)",
};

export const BitezBloom = () => (
  <div
    aria-hidden
    className="absolute -translate-x-1/2 rounded-full pointer-events-none"
    style={{
      top: "-10%",
      left: "50%",
      width: 600,
      height: 600,
      background: "hsl(212 82% 66% / 0.12)",
      filter: "blur(100px)",
    }}
  />
);

export default UserLogin;