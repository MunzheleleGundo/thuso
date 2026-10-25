import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const env = import.meta.env;
export const usingEmulators = env.VITE_USE_EMULATORS === "true";

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "demo-thuso.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "demo-thuso",
  appId: env.VITE_FIREBASE_APP_ID || "demo-app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
});

export const auth = getAuth(app);

/** Offline-first: reads come from a local cache and writes queue until the connection returns. */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || "europe-west1");

if (usingEmulators) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}
