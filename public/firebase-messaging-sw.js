importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");

const config = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: config.get("apiKey"),
  authDomain: config.get("authDomain"),
  projectId: config.get("projectId"),
  storageBucket: config.get("storageBucket"),
  messagingSenderId: config.get("messagingSenderId"),
  appId: config.get("appId"),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || "Pátio Pro Log";
  const options = {
    body: data.body || "Há uma atualização em um chamado.",
    data: { url: data.url || "/", chamadoId: data.chamadoId || "" },
    tag: data.eventId || undefined,
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
