"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  requestPushToken,
  deletePushToken,
} from "@/lib/firebaseMessaging";
const DEVICE_ID_KEY = "naya-push-device-id";

function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);

  if (existing) {
    return existing;
  }

  const newId = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, newId);

  return newId;
}

export default function PushNotificationSettings() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const emulatorMode =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

  useEffect(() => {
    const available =
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      window.isSecureContext;

    setSupported(available);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUserId(user?.uid ?? null);
      setEnabled(false);

      if (!user || emulatorMode || !available) {
        return;
      }

      try {
        const deviceId = getDeviceId();

        const tokenRef = doc(
          db,
          "users",
          user.uid,
          "pushTokens",
          deviceId
        );

        const snapshot = await getDoc(tokenRef);

        setEnabled(snapshot.exists());
      } catch (error) {
        console.error("[Naya Push] Failed to check token:", error);
      }
    });

    return () => unsubscribe();
  }, [emulatorMode]);

  async function enablePush() {
    if (emulatorMode || !userId || !supported || loading) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
      );

      const token = await requestPushToken(registration);

      if (!token) {
        setMessage("尚未取得通知權限，請確認瀏覽器設定。");
        return;
      }


      const deviceId = getDeviceId();

const tokenRef = doc(
  db,
  "users",
  userId,
  "pushTokens",
  deviceId
);

const existingToken = await getDoc(tokenRef);

if (auth.currentUser?.uid !== userId) {
  throw new Error("會員登入狀態已變更，請重新操作。");
}

if (
  existingToken.exists() &&
  existingToken.data().token !== token
) {
  await deleteDoc(tokenRef);
}

if (
  !existingToken.exists() ||
  existingToken.data().token !== token
) {
  if (auth.currentUser?.uid !== userId) {
    throw new Error("會員登入狀態已變更，請重新操作。");
  }

  await setDoc(tokenRef, {
    token,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

setEnabled(true);
      setMessage("已成功開啟推播通知！");
    } catch (error) {
      console.error("[Naya Push] Enable failed:", error);
      setMessage("無法開啟推播通知，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  async function disablePush() {
    if (emulatorMode || !userId || loading) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const deviceId = getDeviceId();

      await deleteDoc(
        doc(db, "users", userId, "pushTokens", deviceId)
      );

      setEnabled(false);
await deletePushToken();
      setMessage("已關閉此裝置的推播通知。");
    } catch (error) {
      console.error("[Naya Push] Disable failed:", error);
      setMessage("無法關閉推播通知，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  const disabled =
    emulatorMode || supported !== true || !userId || loading;

  return (
    <section className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          🔔
        </span>

        <div>
          <h2 className="text-lg font-bold text-slate-900">
            手機推播通知
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            候補課程有空位時，接收通知提醒。
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-sky-50 p-4">
        {emulatorMode ? (
          <p className="text-sm text-sky-800">
            目前為測試環境，手機推播功能尚未啟用。
          </p>
        ) : supported === false ? (
          <p className="text-sm text-amber-800">
            目前的瀏覽器或使用環境不支援推播通知。
          </p>
        ) : !userId ? (
          <p className="text-sm text-slate-600">
            請先登入會員帳號，再開啟推播通知。
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            {enabled
              ? "此裝置已開啟推播通知。"
              : "開啟後，候補課程有空位時可收到通知。"}
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={enabled ? disablePush : enablePush}
        className={`mt-4 rounded-xl px-5 py-3 text-sm font-semibold ${
          disabled
            ? "bg-slate-200 text-slate-500"
            : enabled
            ? "bg-rose-100 text-rose-700"
            : "bg-sky-600 text-white"
        }`}
      >
        {loading
          ? "處理中..."
          : enabled
          ? "關閉此裝置推播"
          : "開啟推播通知"}
      </button>

      {message && (
        <p className="mt-3 text-sm text-slate-700">
          {message}
        </p>
      )}
    </section>
  );
}
