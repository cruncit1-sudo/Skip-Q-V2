import { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";
import { getSellerSession } from "@/utils/sessionManager";

export type SellerProfile = {
  id: string;
  canteenName: string;
  slogan: string;
  ownerPhone: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  icon: string;
};

const PROFILE_STORAGE_KEY = "bitez.seller.profile";
const CANTEENS_STORAGE_KEY = "bitez.user.canteens";

const defaultProfile: SellerProfile = {
  id: "",
  canteenName: "",
  slogan: "",
  ownerPhone: "",
  accountNumber: "",
  ifsc: "",
  upiId: "",
  icon: "🍽️",
};

const profileSubscribers = new Set<() => void>();

export const subscribeProfile = (cb: () => void) => {
  profileSubscribers.add(cb);
  return () => profileSubscribers.delete(cb);
};

export const getRegisteredCanteens = (): SellerProfile[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CANTEENS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore storage parse errors
  }
  return [];
};

export const getProfile = (): SellerProfile => {
  if (typeof window === "undefined") return defaultProfile;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) return { ...defaultProfile, ...JSON.parse(raw) };
  } catch {
    // Ignore storage parse errors
  }
  return defaultProfile;
};

export const loadCurrentSellerProfile = async (): Promise<SellerProfile> => {
  const session = getSellerSession();
  if (!session?.id) throw new Error("No active seller session");

  const db = getFirestore();
  const docRef = doc(db, "sellers", session.id);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    throw new Error("Seller profile not found");
  }

  const data = snapshot.data();
  const profile: SellerProfile = {
    id: snapshot.id,
    canteenName: data.canteen_name || "",
    slogan: data.slogan || "",
    ownerPhone: data.phone || "",
    accountNumber: data.bank_account_number || "",
    ifsc: data.bank_ifsc || "",
    upiId: data.upi_id || "",
    icon: data.icon || "🍽️",
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    // Trigger storage event so header updates dynamically (e.g. for the avatar icon)
    window.dispatchEvent(new Event("storage"));
  }

  return profile;
};

export const saveProfileToBackend = async (
  profile: Omit<SellerProfile, "id">
): Promise<SellerProfile> => {
  const session = getSellerSession();
  if (!session?.id) throw new Error("No active seller session");

  const db = getFirestore();
  const docRef = doc(db, "sellers", session.id);

  const updates = {
    canteen_name: profile.canteenName,
    slogan: profile.slogan,
    phone: profile.ownerPhone,
    bank_account_number: profile.accountNumber,
    bank_ifsc: profile.ifsc,
    upi_id: profile.upiId,
    icon: profile.icon,
  };

  await updateDoc(docRef, updates);

  const savedProfile = { ...profile, id: session.id };
  
  if (typeof window !== "undefined") {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(savedProfile));
    window.dispatchEvent(new Event("storage"));
  }

  return savedProfile;
};

export const getRegisteredCanteensFromBackend = async (): Promise<SellerProfile[]> => {
  const db = getFirestore();
  // Fetching all active sellers to be able to map active canteens
  const q = query(collection(db, "sellers"), where("is_active", "==", true));
  const snapshot = await getDocs(q);
  
  const canteens: SellerProfile[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    canteens.push({
      id: docSnap.id,
      canteenName: data.canteen_name || "Unknown Canteen",
      slogan: data.slogan || "",
      ownerPhone: data.phone || "",
      accountNumber: data.bank_account_number || "",
      ifsc: data.bank_ifsc || "",
      upiId: data.upi_id || "",
      icon: data.icon || "🍽️",
    });
  });
  
  if (typeof window !== "undefined") {
    localStorage.setItem(CANTEENS_STORAGE_KEY, JSON.stringify(canteens));
    profileSubscribers.forEach((cb) => cb());
  }

  return canteens;
};