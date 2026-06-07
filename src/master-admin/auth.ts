import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app as firebaseApp } from "@/firebase";
import {
  getAdminSession,
  saveAdminSession,
  clearAdminSession,
} from "@/utils/sessionManager";

// Legacy key from when admin session was duplicated across two stores.
// Cleared on read so old data can never resurface and overlap with a new login.
const LEGACY_SESSION_KEY = "ma_session_v1";

export type MaSession = {
  role: "master_admin";
  authenticated: true;
  username: string;
  timestamp: number;
};

export function getSession(): MaSession | null {
  try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ }
  const s = getAdminSession();
  if (!s) return null;
  return {
    role: "master_admin",
    authenticated: true,
    username: s.username || "",
    timestamp: s.savedAt || Date.now(),
  };
}

export function setSession(username: string) {
  // Single source of truth: sessionManager. Username is preserved so the UI
  // can never display a different admin's identity than the one logged in.
  saveAdminSession({ username });
}

export function clearSession() {
  try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ }
  clearAdminSession();
}

export async function loginMasterAdmin(username: string, password: string) {
  const auth = getAuth(firebaseApp);
  // If they typed a full email, use it. Otherwise, append the default admin domain.
  const email = username.includes("@") ? username.toLowerCase() : `${username.toLowerCase()}@admin.bitez.app`;
  
  console.log("Attempting Firebase login with email ->", `"${email}"`);
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return true;
  } catch (error: any) {
    console.error("Firebase Login Error:", error);
    
    // Extract the specific Firebase error code to show in the UI
    if (error.code === 'auth/invalid-credential') throw new Error("Incorrect username or password.");
    if (error.code === 'auth/operation-not-allowed') throw new Error("Email/Password login is not enabled in Firebase Console.");
    if (error.code === 'auth/network-request-failed') throw new Error("Network error. Check your connection.");
    throw new Error(error.message || "Login failed");
  }
}

export async function logoutMasterAdmin() {
  const auth = getAuth(firebaseApp);
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Firebase Logout Error:", error);
  }
  clearSession();
}

export async function signupMasterAdmin(username: string, email: string, password: string) {
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  
  try {
    // 1. Firebase Auth-ல் Email/Password வைத்து யூசரை உருவாக்குதல்
    const userCredential = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password);
    
    // 2. Master Admins Collection-ல் யூசர் விபரங்களைச் சேமித்தல்
    await setDoc(doc(db, "master_admins", userCredential.user.uid), {
      username: username.trim(),
      email: email.toLowerCase(),
      role: "ADMIN",
      created_at: serverTimestamp()
    });
    
    return true;
  } catch (error: any) {
    console.error("Firebase Signup Error:", error);
    if (error.code === 'auth/email-already-in-use') throw new Error("This email is already in use.");
    if (error.code === 'auth/weak-password') throw new Error("Password must be at least 6 characters.");
    throw new Error(error.message || "Signup failed");
  }
}

export async function logAudit(
  action_type: string,
  target?: string,
  details?: Record<string, unknown>,
) {
  try {
    const s = getSession();
    if (!s?.username) return;
    const db = getFirestore(firebaseApp);
    await addDoc(collection(db, "admin_audit_logs"), {
      username: s.username,
      action_type,
      target: target ?? null,
      details: details ?? null,
      timestamp: serverTimestamp(),
    });
  } catch {
    /* fire and forget */
  }
}