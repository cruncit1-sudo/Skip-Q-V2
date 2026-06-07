import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getSellerSession, saveSellerSession } from "@/utils/sessionManager";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const SellerLogin = () => {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getSellerSession()) navigate("/seller/dashboard", { replace: true });
    const t = setTimeout(() => {
      if (getSellerSession()) navigate("/seller/dashboard", { replace: true });
    }, 100);
    return () => clearTimeout(t);
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error("Enter your username and password");
      return;
    }
    setLoading(true);
    try {
      const auth = getAuth();
      const db = getFirestore();
      
      // 1. Firebase Authentication
      const userCred = await signInWithEmailAndPassword(auth, identifier, password);
      const user = userCred.user;

      // 2. Fetch seller profile from Firestore (Assuming a 'sellers' collection)
      let canteenName = "My Canteen";
      let sellerName = user.displayName || "Seller";
      
      const q = query(collection(db, "sellers"), where("email", "==", identifier));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        canteenName = data.canteenName || data.canteen_name || canteenName;
        sellerName = data.name || sellerName;
      }

      saveSellerSession({
        id: user.uid,
        name: sellerName,
        email: user.email || identifier,
        username: identifier,
        canteenName: canteenName,
      });

      toast.success("Welcome back");
      navigate("/seller/dashboard", { replace: true });
    } catch (err: any) {
      console.error("Firebase Login Error:", err);
      let errMsg = "Login failed";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        errMsg = "Invalid email or password";
      }
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="seller-admin-shell flex items-center justify-center px-5 py-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl space-y-6 sm:p-8"
      >
        <div className="text-center space-y-2">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <span className="material-symbols-outlined text-primary-foreground" style={{ fontSize: 28 }}>
              storefront
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Seller Login</h1>
          <p className="text-sm text-muted-foreground">
            Use the credentials shared by your Bitez admin.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Email ID</label>
          <input
            autoFocus
            autoComplete="username"
            className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. seller@canteen.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Password</label>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label={showPwd ? "Hide password" : "Show password"}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {showPwd ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
        >
        {loading ? "Logging in…" : "Log in"}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Don't have an account? Ask your Bitez admin to create one.
        </p>
      </form>
    </main>
  );
};

export default SellerLogin;