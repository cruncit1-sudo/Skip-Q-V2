import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

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

const functions = getFunctions(app);
// Uncomment this if you are running the Firebase Emulator locally!
// if (window.location.hostname === "localhost" || window.location.hostname.startsWith("10.")) {
//   connectFunctionsEmulator(functions, window.location.hostname, 5001);
// }

export { app, analytics, db };