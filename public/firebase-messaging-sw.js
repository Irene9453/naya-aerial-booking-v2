/*
 * Naya Aerial Booking - Firebase Messaging Service Worker
 *
 * 背景推播使用 Firebase Web App 公開設定。
 * 不使用 Firebase Admin 私密金鑰。
 */

importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js"
);

let messagingInitialized = false;
let initializationPromise = null;

async function initializeMessaging() {
  if (messagingInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const response = await fetch("/api/push/config", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(
        `Firebase push configuration unavailable: ${response.status}`
      );
    }

    const config = await response.json();

    if (
      !config.apiKey ||
      !config.projectId ||
      !config.messagingSenderId ||
      !config.appId
    ) {
      throw new Error("Incomplete Firebase push configuration.");
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      /*
       * FCM notification payload 通常由 Firebase SDK
       * 自動顯示通知，因此這裡不重複呼叫
       * showNotification，避免重複通知。
       */
      console.log(
        "[Naya Push] Background message received:",
        payload.messageId || "unknown"
      );
    });

    messagingInitialized = true;
  })();

  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

// Service Worker 每次啟動時自行初始化
initializeMessaging().catch((error) => {
  console.warn(
    "[Naya Push] Messaging initialization unavailable:",
    error.message
  );
});

// 點擊通知後開啟會員中心
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;

  const targetUrl = new URL(
    notification.data?.url || "/member",
    self.location.origin
  );

  // 僅允許開啟本站網址
  if (targetUrl.origin !== self.location.origin) {
    return;
  }

  notification.close();

  event.waitUntil(
    clients.openWindow(targetUrl.href)
  );
});