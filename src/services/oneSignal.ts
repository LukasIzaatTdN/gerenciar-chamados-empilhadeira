import OneSignal from "react-onesignal";

let initialization: Promise<void> | undefined;

export function initializeOneSignal(): Promise<void> {
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID?.trim();
  if (!appId || typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve();
  }

  initialization ??= OneSignal.init({
    appId,
    safari_web_id: import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID?.trim() || undefined,
    serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
    serviceWorkerParam: { scope: "/onesignal/" },
  }).catch(() => {
    // Push setup must not interrupt the operational application or expose config.
    console.warn("[push] OneSignal initialization failed. Verifique o AppID e a origem configurada no OneSignal.");
    initialization = undefined;
  });

  return initialization;
}
