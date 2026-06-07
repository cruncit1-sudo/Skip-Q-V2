import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { getSellerSession } from "@/utils/sessionManager";
import { getProfile } from "@/lib/sellerProfile";
import { firebaseConfig } from "@/firebase";

export type StaffMember = {
  id: string;
  sellerId: string;
  name: string;
  staffId: string;
  email: string;
  createdAt: number;
};

let staffCache: StaffMember[] = [];
let listeners: Array<() => void> = [];
let realtimeUnsub: (() => void) | null = null;

const notifyListeners = () => listeners.forEach((l) => l());

export const getStaff = (): StaffMember[] => staffCache;

export const subscribeStaff = (listener: () => void) => {
  listeners.push(listener);
  if (!realtimeUnsub) {
    initStaffRealtime();
  }
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
};

export const initStaffRealtime = () => {
  const session = getSellerSession();
  if (!session?.id) return;

  const db = getFirestore();
  const q = query(collection(db, "staff"), where("sellerId", "==", session.id));

  realtimeUnsub = onSnapshot(q, (snapshot) => {
    const items: StaffMember[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        sellerId: data.sellerId,
        name: data.name,
        staffId: data.staffId,
        email: data.email,
        createdAt: data.createdAt,
      });
    });
    staffCache = items.sort((a, b) => b.createdAt - a.createdAt);
    notifyListeners();
  });
};

export const nextStaffToken = (): string => {
  // Type assertion to any to safely check both camelCase and snake_case variations
  const session: any = getSellerSession();
  const profile = getProfile();
  const rawName = profile.canteenName || session?.canteen_name || session?.canteenName || "shop";
  const shopName = rawName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "shop";
  
  let maxNum = 0;
  staffCache.forEach(s => {
    const match = s.staffId.match(/\d+$/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  const nextNum = (maxNum + 1).toString().padStart(2, "0");
  return `${shopName}${nextNum}`;
};

export const addStaff = async (
  input: { name: string; staffId: string; password: string }
): Promise<void> => {
  const session: any = getSellerSession();
  if (!session?.id) throw new Error("No active seller session");

  const sanitizedName = input.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "staff";
  const email = `${sanitizedName}@${input.staffId}.com`.toLowerCase();

  // 1. Create user in Firebase Auth via REST API so it doesn't log the Seller out
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: input.password, returnSecureToken: true })
  });
  
  const authData = await res.json();
  if (!res.ok) {
    if (authData.error?.message === "EMAIL_EXISTS") throw new Error("Staff ID already in use");
    throw new Error(authData.error?.message || "Failed to create Auth user");
  }
  const uid = authData.localId;

  // 2. Save to Firestore `staff` collection
  const db = getFirestore();
  await setDoc(doc(db, "staff", uid), {
    sellerId: session.id,
    name: input.name,
    staffId: input.staffId,
    email: email,
    createdAt: Date.now(),
    role: "staff",
  });
};

export const removeStaff = async (id: string): Promise<void> => {
  const db = getFirestore();
  await deleteDoc(doc(db, "staff", id));
};