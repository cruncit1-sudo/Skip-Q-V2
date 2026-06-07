import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { getSellerSession } from "@/utils/sessionManager";

export type SellerCategory = "Food" | "Snacks" | "Drinks";

export type SellerInventoryItem = {
  id: string;
  sellerId: string;
  name: string;
  price: number;
  category: SellerCategory;
  icon: string;
  iconLabel?: string;
  status: "Active" | "Inactive";
  createdAt: number;
  stockLimit?: number | null;
  availableUntil?: string | null;
};

// Internal memory cache for quick UI updates
let inventoryCache: SellerInventoryItem[] = [];
let listeners: Array<() => void> = [];
let realtimeUnsub: (() => void) | null = null;

const notifyListeners = () => listeners.forEach((l) => l());

export const getInventory = (sellerId?: string | null): SellerInventoryItem[] => {
  if (sellerId) return inventoryCache.filter((i) => i.sellerId === sellerId);
  return inventoryCache;
};

export const subscribeInventory = (listener: () => void) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
};

export const loadInventoryFromBackend = async (sellerId?: string | null): Promise<SellerInventoryItem[]> => {
  const db = getFirestore();
  let q = collection(db, "inventory");
  
  if (sellerId) {
    q = query(q, where("sellerId", "==", sellerId)) as any;
  }
  
  const snapshot = await getDocs(q);
  const items: SellerInventoryItem[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    items.push({
      id: docSnap.id,
      sellerId: data.sellerId,
      name: data.name,
      price: data.price,
      category: data.category as SellerCategory,
      icon: data.icon,
      iconLabel: data.iconLabel,
      status: data.status,
      createdAt: data.createdAt || Date.now(),
      stockLimit: data.stockLimit,
      availableUntil: data.availableUntil,
    });
  });
  
  inventoryCache = items.sort((a, b) => b.createdAt - a.createdAt);
  notifyListeners();
  return getInventory(sellerId);
};

export const addInventoryItem = async (
  item: Omit<SellerInventoryItem, "id" | "sellerId" | "createdAt">
): Promise<SellerInventoryItem> => {
  const session = getSellerSession();
  if (!session?.id) throw new Error("No active seller session");

  const db = getFirestore();
  const docRef = doc(collection(db, "inventory"));
  const newItem: SellerInventoryItem = {
    ...item,
    id: docRef.id,
    sellerId: session.id,
    createdAt: Date.now(),
  };

  await setDoc(docRef, newItem);
  
  inventoryCache = [newItem, ...inventoryCache];
  notifyListeners();
  return newItem;
};

export const updateInventoryItem = async (
  id: string,
  updates: Partial<Omit<SellerInventoryItem, "id" | "sellerId" | "createdAt">>
): Promise<void> => {
  const db = getFirestore();
  const docRef = doc(db, "inventory", id);
  await updateDoc(docRef, updates);
  
  inventoryCache = inventoryCache.map((item) =>
    item.id === id ? { ...item, ...updates } : item
  );
  notifyListeners();
};

export const removeInventoryItem = async (id: string): Promise<void> => {
  const db = getFirestore();
  await deleteDoc(doc(db, "inventory", id));
  
  inventoryCache = inventoryCache.filter((item) => item.id !== id);
  notifyListeners();
};

export const setInventoryStatus = async (id: string, status: "Active" | "Inactive"): Promise<void> => {
  await updateInventoryItem(id, { status });
};

export const setInventoryLimit = async (
  id: string,
  limit: { stockLimit?: number | null; availableUntil?: string | null }
): Promise<void> => {
  await updateInventoryItem(id, limit);
};

export const enforceTimeLimits = () => {
  let changed = false;
  const now = Date.now();
  
  inventoryCache = inventoryCache.map((item) => {
    if (item.status === "Active" && item.availableUntil) {
      const until = new Date(item.availableUntil).getTime();
      if (until <= now) {
        changed = true;
        setInventoryStatus(item.id, "Inactive").catch(() => {});
        return { ...item, status: "Inactive" };
      }
    }
    return item;
  });

  if (changed) notifyListeners();
};

export const initInventoryRealtime = () => {
  if (realtimeUnsub) return realtimeUnsub;
  const db = getFirestore();
  const q = collection(db, "inventory");
  
  realtimeUnsub = onSnapshot(q, (snapshot) => {
    const items: SellerInventoryItem[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        sellerId: data.sellerId,
        name: data.name,
        price: data.price,
        category: data.category,
        icon: data.icon,
        iconLabel: data.iconLabel,
        status: data.status,
        createdAt: data.createdAt,
        stockLimit: data.stockLimit,
        availableUntil: data.availableUntil,
      });
    });
    inventoryCache = items.sort((a, b) => b.createdAt - a.createdAt);
    notifyListeners();
  });
  
  return realtimeUnsub;
};

export const preloadInventoryForSellers = async (sellerIds: string[]) => {
  if (!sellerIds.length) return;
  const db = getFirestore();
  
  const chunks = [];
  for (let i = 0; i < sellerIds.length; i += 10) {
    chunks.push(sellerIds.slice(i, i + 10));
  }
  
  let allItems: SellerInventoryItem[] = [];
  for (const chunk of chunks) {
    const q = query(collection(db, "inventory"), where("sellerId", "in", chunk));
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      allItems.push({
        id: docSnap.id,
        sellerId: data.sellerId,
        name: data.name,
        price: data.price,
        category: data.category,
        icon: data.icon,
        iconLabel: data.iconLabel,
        status: data.status,
        createdAt: data.createdAt,
        stockLimit: data.stockLimit,
        availableUntil: data.availableUntil,
      });
    });
  }
  
  inventoryCache = allItems.sort((a, b) => b.createdAt - a.createdAt);
  notifyListeners();
};

export const isItemAvailable = (item: SellerInventoryItem): boolean => {
  if (item.status !== "Active") return false;
  if (item.availableUntil) {
    const until = new Date(item.availableUntil).getTime();
    if (until <= Date.now()) return false;
  }
  return true;
};

export const maxPurchasableQty = (item: SellerInventoryItem): number => {
  return typeof item.stockLimit === "number" ? item.stockLimit : Infinity;
};