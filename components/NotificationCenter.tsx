"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type NotificationData = {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: Timestamp | null;
  classStartTime: Timestamp | null;
};

function formatDateTime(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "";
  }

  return timestamp.toDate().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      return;
    }

    const notificationQuery = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      notificationQuery,
      (snapshot) => {
        const nextNotifications = snapshot.docs
          .map((notificationDocument) => {
            const data = notificationDocument.data();

            return {
              id: notificationDocument.id,
              title: String(data.title ?? ""),
              body: String(data.body ?? ""),
              type: String(data.type ?? ""),
              isRead: Boolean(data.isRead ?? false),
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null,
              classStartTime:
                data.classStartTime instanceof Timestamp
                  ? data.classStartTime
                  : null,
            };
          })
          .sort((first, second) => {
            const firstTime = first.createdAt?.toMillis() ?? 0;
            const secondTime = second.createdAt?.toMillis() ?? 0;

            return secondTime - firstTime;
          });

        setNotifications(nextNotifications);
setMessage("");
      },
      (error) => {
        console.error(error);
        setMessage("讀取通知失敗。");
      }
    );

    return unsubscribe;
  }, []);

  async function handleMarkAsRead(notificationId: string) {
    try {
      await updateDoc(doc(db, "notifications", notificationId), {
        isRead: true,
      });
    } catch (error) {
      console.error(error);
      setMessage("更新通知狀態失敗。");
    }
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  return (
    <article className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Notifications
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            最新通知
          </h2>
        </div>

        {unreadCount > 0 && (
          <span className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white">
            {unreadCount} 則未讀
          </span>
        )}
      </div>

      {message && (
        <p className="mt-5 text-sm text-red-600">
          {message}
        </p>
      )}

      {notifications.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前沒有通知。
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-4">
          {notifications.slice(0, 10).map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleMarkAsRead(notification.id)}
              className={`w-full rounded-2xl border p-5 text-left transition ${
                notification.isRead
                  ? "border-slate-200 bg-white"
                  : "border-sky-200 bg-sky-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900">
                    {notification.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {notification.body}
                  </p>

                  {notification.classStartTime && (
                    <p className="mt-2 text-xs text-slate-500">
                      課程時間：
                      {formatDateTime(notification.classStartTime)}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-slate-400">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </div>

                {!notification.isRead && (
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}