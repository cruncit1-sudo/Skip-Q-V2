export type AdminPwaKind = "seller-admin" | "master-admin";

const LAUNCH_INTENT_KEY = "bitez:pwa_launch_intent:v1";
const INTENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type LaunchIntent = {
  kind: AdminPwaKind;
  savedAt: number;
};

type PwaHeadConfig = {
  manifest: string;
  title: string;
  theme: string;
  statusBar: string;
  standalone: boolean;
  kind: AdminPwaKind | "user";
};

export function adminPwaKindForPath(pathname: string): AdminPwaKind | null {
  return null;
}

export function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function adminHomeForKind(kind: AdminPwaKind, authenticated: boolean) {
  return "/";
}

function hasStoredSession(kind: AdminPwaKind) {
  if (typeof window === "undefined") return false;
  const keys = kind === "master-admin" ? ["bitez_admin_session", "ma_session_v1"] : ["bitez_seller_session", "bitez.seller.session.v1"];
  return keys.some((key) => {
    try {
      const raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.authenticated || parsed?.id || parsed?.role === "seller" || parsed?.role === "master_admin");
    } catch {
      return false;
    }
  });
}

export function getAdminStandaloneRedirect(pathname = window.location.pathname) {
  if (!isStandalonePwa()) return null;
  if (adminPwaKindForPath(pathname)) return null;
  if (!(pathname === "/" || pathname.startsWith("/app"))) return null;
  const kind = getStoredAdminLaunchKind();
  if (!kind) return null;
  return adminHomeForKind(kind, hasStoredSession(kind));
}

export function getStoredAdminLaunchKind(): AdminPwaKind | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAUNCH_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LaunchIntent;
    if ((parsed.kind !== "seller-admin" && parsed.kind !== "master-admin") || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > INTENT_MAX_AGE_MS) return null;
    return parsed.kind;
  } catch {
    return null;
  }
}

function configForPath(pathname: string): PwaHeadConfig {
  // User app uses the light surface (matches --user-app-bg hsl(214 32% 94%)).
  // Using a dark theme color here paints a black bar in the iOS PWA status
  // area and behind translucent surfaces — keep it in sync with the page bg.
  return { manifest: "/manifest.webmanifest", title: "Bitez", theme: "#E9EEF5", statusBar: "default", standalone: false, kind: "user" };
}

function ensureMeta(name: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  return meta;
}

export function applyPwaHeadForPath(pathname = window.location.pathname) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const config = configForPath(pathname);
  const isUserApp = true;

  document.documentElement.classList.remove("seller-admin-route", "master-admin-route", "admin-app-route");
  document.body?.classList.remove("admin-app-route");
  document.documentElement.classList.toggle("user-app-route", isUserApp);
  document.body?.classList.toggle("user-app-route", isUserApp);

  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.setAttribute("href", config.manifest);

  ensureMeta("theme-color").setAttribute("content", config.theme);
  ensureMeta("apple-mobile-web-app-status-bar-style").setAttribute("content", config.statusBar);
  ensureMeta("apple-mobile-web-app-title").setAttribute("content", config.title);
  ensureMeta("apple-mobile-web-app-capable").setAttribute("content", config.standalone ? "yes" : "no");
  ensureMeta("mobile-web-app-capable").setAttribute("content", config.standalone ? "yes" : "no");
}