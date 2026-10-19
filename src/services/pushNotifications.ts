import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { v4 as uuidv4 } from "uuid";
import { auth, db, default as firebaseApp, useFirebaseEmulators } from "../config/firebase";

const INSTALLATION_KEY = "patio_push_installation_id";

export interface PushProfile {
  uid: string;
  empresaId: string;
  supermercadoId: string | null;
  perfil: string;
  status: string;
}

export function getPushConfigurationError(): string | null {
  if (!firebaseApp || !auth || !db) return "Firebase não está configurado neste ambiente.";
  if (useFirebaseEmulators) return "Push real fica desativado no modo Emulator; os testes locais não enviam mensagens externas.";
  if (!import.meta.env.VITE_FIREBASE_VAPID_KEY) return "Falta configurar a chave VAPID pública do Firebase.";
  if (!import.meta.env.VITE_PUSH_WORKER_URL) return "Falta configurar o endereço do serviço de notificações.";
  return null;
}

function installationId(): string {
  let id = localStorage.getItem(INSTALLATION_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(INSTALLATION_KEY, id);
  }
  return id;
}

export async function enablePushNotifications(profile: PushProfile): Promise<void> {
  const configError = getPushConfigurationError();
  if (configError) throw new Error(configError);
  if (!auth?.currentUser || auth.currentUser.uid !== profile.uid || !db) {
    throw new Error("Entre novamente para ativar notificações nesta conta.");
  }
  if (profile.status !== "Ativo" || !profile.empresaId) {
    throw new Error("Somente usuários ativos vinculados a uma empresa podem ativar push.");
  }
  if (!(await isSupported())) throw new Error("Este navegador não oferece suporte a notificações push.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de notificações não concedida pelo navegador.");

  const config = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${config}`, { scope: "/" });
  const messaging = getMessaging(firebaseApp!);
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("O Firebase não forneceu um token para este navegador.");

  await setDoc(doc(db, "usuarios", profile.uid, "push_tokens", installationId()), {
    token,
    uid: profile.uid,
    empresa_id: profile.empresaId,
    supermercado_id: profile.supermercadoId,
    perfil: profile.perfil,
    status: profile.status,
    updated_at: new Date().toISOString(),
    platform: "web",
  });
}

export async function disablePushNotifications(uid: string): Promise<void> {
  if (!db) throw new Error("Firestore não está configurado.");
  await deleteDoc(doc(db, "usuarios", uid, "push_tokens", installationId()));
}

export function listenForForegroundPush(
  onPush: (data: Record<string, string>) => void
): () => void {
  const app = firebaseApp;
  if (!app || useFirebaseEmulators) return () => undefined;
  let cancelled = false;
  let unsubscribe: (() => void) | undefined;
  void isSupported().then((supported) => {
    if (!supported || cancelled) return;
    unsubscribe = onMessage(getMessaging(app), (payload) => {
      onPush(payload.data ?? {});
    });
  }).catch(() => undefined);
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export async function requestPushDelivery(auditId?: string): Promise<void> {
  if (!auditId || !auth?.currentUser || !import.meta.env.VITE_PUSH_WORKER_URL) return;
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(`${import.meta.env.VITE_PUSH_WORKER_URL.replace(/\/$/, "")}/api/notify`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ auditId }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Serviço push respondeu HTTP ${response.status}.`);
  }
}
