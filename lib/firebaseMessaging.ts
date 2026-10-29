import app from "@/lib/firebase";
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  type Messaging,
} from "firebase/messaging";

function isEmulatorMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"
  );
}

export async function getFirebaseMessaging():
  Promise<Messaging | null> {
  if (typeof window === "undefined") {
    return null;
  }

  // Emulator 模式不連接真正的 FCM
  if (isEmulatorMode()) {
    return null;
  }

  const supported = await isSupported();

  if (!supported) {
    return null;
  }

  return getMessaging(app);
}

export async function requestPushToken(
  serviceWorkerRegistration: ServiceWorkerRegistration
): Promise<string | null> {
  if (isEmulatorMode()) {
    throw new Error(
      "Emulator 測試模式不會向正式 Firebase 申請推播 Token。"
    );
  }

  if (
    typeof window === "undefined" ||
    !("Notification" in window)
  ) {
    throw new Error("目前的瀏覽器不支援通知功能。");
  }

  const vapidKey =
    process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

  if (!vapidKey) {
    throw new Error("尚未設定 Firebase Web Push 公開金鑰。");
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return null;
  }

  const messaging = await getFirebaseMessaging();

  if (!messaging) {
    return null;
  }

  return getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  });
}
/**
 * 清除目前瀏覽器的 Firebase Cloud Messaging Token。
 * Emulator 模式下不執行任何正式 Firebase 操作。
 */
export async function deletePushToken(): Promise<void> {
  if (isEmulatorMode()) {
    return;
  }

  const messaging = await getFirebaseMessaging();

  if (!messaging) {
    return;
  }

  const deleted = await deleteToken(messaging);

  if (!deleted) {
    throw new Error("無法清除目前裝置的推播 Token。");
  }
}