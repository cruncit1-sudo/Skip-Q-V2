import { getFirestore } from "firebase/firestore";
import { app as firebaseApp } from "@/firebase";

export const firestoreDb = getFirestore(firebaseApp);

// Legacy shim for Supabase queries we haven't migrated yet
// This prevents other master-admin pages from crashing while we migrate them one by one.
const createChain = () => {
  const chain: any = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    single: () => chain,
    maybeSingle: () => chain,
    limit: () => chain,
    in: () => chain,
    then: (resolve: any) => resolve({ data: [], error: null }),
    catch: () => chain,
  };
  return chain;
};

export const db = {
  from: () => createChain()
} as any;