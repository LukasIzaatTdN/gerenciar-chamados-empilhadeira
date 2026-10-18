import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";

const runtimeEnv = import.meta.env ?? {};
const firebaseConfig = {
  apiKey: runtimeEnv.VITE_FIREBASE_API_KEY,
  authDomain: runtimeEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: runtimeEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: runtimeEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: runtimeEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: runtimeEnv.VITE_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
export const useFirebaseEmulators = runtimeEnv.VITE_USE_FIREBASE_EMULATORS === "true";

if (useFirebaseEmulators && !firebaseConfig.projectId?.startsWith("demo-")) {
  throw new Error("O modo Firebase Emulator exige um projeto fictício com prefixo demo-.");
}

const app = hasFirebaseConfig
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

let firestoreInstance: Firestore | null = null;
if (app) {
  try {
    firestoreInstance = initializeFirestore(app, {
      // More resilient transport mode for production networks/proxies.
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    firestoreInstance = getFirestore(app);
  }
}

export const db = firestoreInstance;
export const auth = app ? getAuth(app) : null;

if (useFirebaseEmulators && auth && db) {
  connectAuthEmulator(auth, `http://127.0.0.1:${import.meta.env.VITE_AUTH_EMULATOR_PORT || "9099"}`, { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || "8080"));
}

export default app;
