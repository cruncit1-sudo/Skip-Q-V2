// AES-256-GCM tokenization for sensitive analytics metadata.
// Key is derived from SUPABASE_SERVICE_ROLE_KEY so it never leaves the server
// and rotates automatically if the service key is rotated.

const enc = new TextEncoder();
const dec = new TextDecoder();

let cachedKey: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = (async () => {
    const src = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!src) throw new Error("missing service role for analytics crypto");
    const material = await crypto.subtle.digest(
      "SHA-256",
      enc.encode(src + "::analytics-vault-v1"),
    );
    return crypto.subtle.importKey(
      "raw",
      material,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  return cachedKey;
}

function toB64(b: ArrayBuffer | Uint8Array): string {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type Encrypted = { v: 1; alg: "AES-GCM-256"; iv: string; ct: string };

export async function encryptJson(value: unknown): Promise<Encrypted> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc.encode(JSON.stringify(value ?? null));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { v: 1, alg: "AES-GCM-256", iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJson<T = unknown>(blob: Encrypted | null | undefined): Promise<T | null> {
  if (!blob || typeof blob !== "object" || blob.alg !== "AES-GCM-256") return null;
  const key = await getKey();
  const iv = fromB64(blob.iv);
  const ct = fromB64(blob.ct);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(dec.decode(plain)) as T;
}

// Splits an order-shaped metadata blob into an indexable plaintext part
// (sellerId, appUserId only) and an encrypted blob for everything else.
export async function sealOrderMetadata(meta: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sellerId = (meta?.sellerId as string | null) ?? null;
  const appUserId = (meta?.appUserId as string | null) ?? null;
  const enc = await encryptJson(meta);
  return { sellerId, appUserId, enc };
}

export async function openOrderMetadata(stored: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  if (!stored) return null;
  const blob = stored.enc as Encrypted | undefined;
  if (!blob) return stored; // legacy plaintext row
  const opened = await decryptJson<Record<string, unknown>>(blob);
  return opened ?? null;
}