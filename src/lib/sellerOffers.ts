import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collectionGroup,
} from "firebase/firestore";
import { getSellerSession } from "@/utils/sessionManager";

// Shared store for seller-created offers. Backend is the source of truth so
// offers created by sellers are visible to users on every device/session.

export type OfferKind = "general" | "inventory";

export type SellerOffer = {
  id: string;
  sellerId: string | null;
  kind: OfferKind;
  name: string;
  discountPct: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  condition: string;
  itemIds: string[]; // for inventory offers
  createdAt: number;
};

const STORAGE_KEY = "bitez:seller:offers";
const EVENT_NAME = "bitez:seller:offers:change";
let realtimeUnsub: (() => void) | null = null;

function read(): SellerOffer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o: any) => ({
      ...o,
      itemIds: Array.isArray(o.itemIds) ? o.itemIds : [],
      discountPct: Number(o.discountPct) || 0,
    })) as SellerOffer[];
  } catch {
    return [];
  }
}

function write(items: SellerOffer[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function upsertCache(incoming: SellerOffer[], sellerId?: string | null) {
  const existing = read();
  const kept = sellerId ? existing.filter((o) => o.sellerId !== sellerId) : [];
  const nextById = new Map<string, SellerOffer>();
  [...incoming, ...kept].forEach((offer) => nextById.set(offer.id, offer));
  write(Array.from(nextById.values()));
}

export function getOffers(): SellerOffer[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export async function migrateCachedOffersToBackend(sellerId?: string | null): Promise<void> {
  if (!sellerId) return;
  const cached = read().filter((o) => o.sellerId === sellerId);
  if (cached.length === 0) return;
  
  const db = getFirestore();
  const offersRef = collection(db, "sellers", sellerId, "offers");
  
  for (const offer of cached) {
    if (!offer.id || offer.id.startsWith("local-") || !offer.id.includes("-")) {
      const newDoc = doc(offersRef);
      await setDoc(newDoc, { ...offer, id: newDoc.id });
    } else {
      const existingDoc = doc(offersRef, offer.id);
      await setDoc(existingDoc, offer, { merge: true });
    }
  }
}

export async function loadOffersFromBackend(sellerId?: string | null): Promise<SellerOffer[]> {
  const db = getFirestore();
  let snapshot;
  try {
    if (sellerId) {
      snapshot = await getDocs(collection(db, "sellers", sellerId, "offers"));
    } else {
      snapshot = await getDocs(collectionGroup(db, "offers"));
    }
    
    const incoming = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        sellerId: data.sellerId ?? sellerId,
        kind: data.kind,
        name: data.name,
        discountPct: data.discountPct,
        startDate: data.startDate,
        endDate: data.endDate,
        condition: data.condition,
        itemIds: data.itemIds ?? [],
        createdAt: data.createdAt ?? Date.now(),
      } as SellerOffer;
    });

    upsertCache(incoming, sellerId);
    return incoming;
  } catch (error) {
    console.error("Failed to load offers:", error);
    return getOffers().filter((o) => !sellerId || o.sellerId === sellerId);
  }
}

export function getActiveOffers(now = Date.now()): SellerOffer[] {
  return getOffers().filter((o) => {
    const start = o.startDate ? new Date(o.startDate + "T00:00:00").getTime() : -Infinity;
    const end = o.endDate ? new Date(o.endDate + "T23:59:59").getTime() : Infinity;
    return now >= start && now <= end;
  });
}

/** Return the highest active general-offer % for a given seller (0 if none). */
export function getActiveDiscountPctForSeller(sellerId?: string | null, now = Date.now()): number {
  if (!sellerId) return 0;
  const pct = getActiveOffers(now)
    .filter((o) => o.kind === "general" && o.sellerId === sellerId)
    .reduce((max, o) => Math.max(max, Number(o.discountPct) || 0), 0);
  return Math.max(0, Math.min(100, pct));
}

export function getActiveOfferForSeller(sellerId?: string | null, now = Date.now()): SellerOffer | null {
  if (!sellerId) return null;
  const list = getActiveOffers(now)
    .filter((o) => o.kind === "general" && o.sellerId === sellerId)
    .sort((a, b) => b.discountPct - a.discountPct);
  return list[0] ?? null;
}

export async function addOffer(input: Omit<SellerOffer, "id" | "createdAt">): Promise<SellerOffer> {
  const session = getSellerSession();
  if (!session?.id) throw new Error("No active seller session");

  const db = getFirestore();
  const offersRef = collection(db, "sellers", session.id, "offers");
  const newDoc = doc(offersRef);

  const newOffer: SellerOffer = {
    ...input,
    id: newDoc.id,
    sellerId: session.id,
    createdAt: Date.now(),
  };

  await setDoc(newDoc, newOffer);
  write([newOffer, ...read().filter((o) => o.id !== newOffer.id)]);
  return newOffer;
}

export async function updateOffer(id: string, patch: Partial<Omit<SellerOffer, "id" | "createdAt">>) {
  const session = getSellerSession();
  if (!session?.id) throw new Error("No active seller session");

  const db = getFirestore();
  const docRef = doc(db, "sellers", session.id, "offers", id);
  
  await updateDoc(docRef, patch as any);
  write(read().map((o) => (o.id === id ? { ...o, ...patch } : o)));
}

export async function removeOffer(id: string) {
  const session = getSellerSession();
  if (!session?.id) throw new Error("No active seller session");

  const db = getFirestore();
  const docRef = doc(db, "sellers", session.id, "offers", id);
  
  await deleteDoc(docRef);
  write(read().filter((o) => o.id !== id));
}

export function subscribeOffers(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };

  const session = getSellerSession();
  if (session?.id && !realtimeUnsub) {
    const db = getFirestore();
    realtimeUnsub = onSnapshot(collection(db, "sellers", session.id, "offers"), (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        ...docSnap.data(),
        id: docSnap.id,
      })) as SellerOffer[];
      upsertCache(items, session.id);
      cb();
    });
  }

  window.addEventListener(EVENT_NAME, onLocal as EventListener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onLocal as EventListener);
    window.removeEventListener("storage", onStorage);
    if (realtimeUnsub) {
      realtimeUnsub();
      realtimeUnsub = null;
    }
  };
}
