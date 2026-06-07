import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyCH6FjwX0FwWEAs9QU5SwSRfXzmg9p582E",
  authDomain: "cruncit-8d1ba.firebaseapp.com",
  projectId: "cruncit-8d1ba",
  storageBucket: "cruncit-8d1ba.firebasestorage.app",
  messagingSenderId: "931947149639",
  appId: "1:931947149639:web:ec913119f49453f2fef462",
  measurementId: "G-5955J1JLWT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

if (app) {
  console.log("🔥 Firebase is successfully connected to the app!");
  console.log("Firebase Project:", app.options.projectId);
}

export { app, analytics, db };