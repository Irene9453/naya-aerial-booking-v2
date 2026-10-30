"use client";

import {
  getClassLocationAddress,
  getClassLocationMapsUrl,
} from "@/lib/classLocations";


import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, reload, sendEmailVerification, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import CancelBookingButton from "@/components/CancelBookingButton";
import NotificationCenter from "@/components/NotificationCenter";
import PushNotificationSettings from "@/components/PushNotificationSettings";
import { cleanupCurrentUserPushToken } from "@/lib/pushTokenCleanup";
import SpecialLeaveBalance from "@/components/SpecialLeaveBalance";
import MemberAerialJourney from "@/components/MemberAerialJourney";
import LegacyMemberClaim from "@/components/LegacyMemberClaim";

type MemberData = {
  name: string;
  email: string;
  phone: string;
  experience: string;
  points: number;
  role: "student" | "admin";
   legacyStatus:
    | "eligible"
    | "claimed"
    | "new";
};

type BookingData = {
  id: string;
  classId: string;
  location: string;
  courseName: string;
  classStartTime: Timestamp | null;
  pointsUsed: number;
  status: string;
  createdAt: Timestamp | null;
};

type PointTransactionData = {
  id: string;
  courseName: string;
  type: string;
  amount: number;
  balanceAfter: number;
  classStartTime: Timestamp | null;
  createdAt: Timestamp | null;
};

function timestampToMilliseconds(timestamp: Timestamp | null) {
  return timestamp ? timestamp.toMillis() : 0;
}

function formatDateTime(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "時間尚未設定";
  }

  return timestamp.toDate().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function formatClassDateTime(
  timestamp: Timestamp | null
) {
  if (!timestamp) {
    return "";
  }

  return timestamp.toDate().toLocaleString(
    "zh-TW",
    {
      timeZone: "Asia/Taipei",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );
}
export default function MemberPage() {
  const router = useRouter();

  const [member, setMember] = useState<MemberData | null>(null);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [classLocations, setClassLocations] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState("");
  const [pointTransactions, setPointTransactions] = useState<
    PointTransactionData[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
const [showAllPointTransactions, setShowAllPointTransactions] =
  useState(false);
  useEffect(() => {
    let unsubscribeMember: (() => void) | undefined;
    let unsubscribeBookings: (() => void) | undefined;
    let unsubscribeClasses: (() => void) | undefined;
    let unsubscribePoints: (() => void) | undefined;
    let cancelled = false;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        // 先確認管理員身分，避免將既有管理員鎖在後台外。
        const profile = await getDoc(doc(db, "users", user.uid));
        if (cancelled) return;
        if (!profile.exists()) {
          setMessage("找不到會員資料，請聯繫老師。");
          setIsLoading(false);
          return;
        }
        const isAdmin = profile.data().role === "admin";
        if (!isAdmin) {
          await reload(user);
          if (cancelled) return;
          if (!user.emailVerified) {
            setVerificationEmail(user.email ?? "");
            setVerificationRequired(true);
            setIsLoading(false);
            return;
          }

          // Emulator-only：已驗證 Email 的舊會員自動接續認領。
          if (
            process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-naya-aerial"
          ) {
            // 認領資料由後端查詢，避免前端直接讀取敏感資料。
            const token = await user.getIdToken(true);

            if (cancelled) return;

            const response = await fetch(
              "/api/legacy-members/auto-claim",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
              }
            );

            // 404 表示沒有舊會員認領申請，一般會員正常進入。
            if (response.status !== 404) {
              const result = await response.json().catch(() => ({}));

              if (!response.ok || result.status !== "approved") {
                throw new Error(
                  typeof result.error === "string"
                    ? result.error
                    : "舊會員點數自動移轉失敗。"
                );
              }
            }
          }
        }
      } catch (error) {
        console.error("確認會員 Email 驗證狀態失敗：", error);
        if (!cancelled) {
          setMessage("無法確認會員驗證狀態，請稍後重新整理。");
          setIsLoading(false);
        }
        return;
      }

      if (cancelled) return;
      setVerificationRequired(false);
      setUserId(user.uid);
      // 即時會員資料與點數
      unsubscribeMember = onSnapshot(
        doc(db, "users", user.uid),
        (snapshot) => {
          if (!snapshot.exists()) {
            setMessage("找不到會員資料，請聯繫老師。");
            setIsLoading(false);
            return;
          }

          const data = snapshot.data();
setMember({
  name: String(data.name ?? ""),
  email: String(data.email ?? user.email ?? ""),
  phone: String(data.phone ?? ""),
  experience: String(data.experience ?? ""),
  points: Number(data.points ?? 0),
  role: data.role === "admin" ? "admin" : "student",

  legacyStatus:
    data.legacyMemberId || data.legacyClaimedAt || data.legacyStatus === "claimed"
      ? "claimed"
      : data.isNewStudent === true || data.legacyStatus === "new"
      ? "new"
      : "eligible",
});

          setIsLoading(false);
        },
        (error) => {
          console.error(error);
          setMessage("讀取會員資料失敗。");
          setIsLoading(false);
        }
      );

      // 取得課程地點，供會員預約紀錄顯示
      unsubscribeClasses = onSnapshot(
        collection(db, "classes"),
        (snapshot) => {
          if (cancelled) return;

          const locations: Record<string, string> = {};

          snapshot.docs.forEach((classDocument) => {
            locations[classDocument.id] = String(
              classDocument.data().location ?? ""
            );
          });

          setClassLocations(locations);
        },
        (error) => {
          console.error("讀取課程地點失敗：", error);
        }
      );

      // 只查詢目前會員自己的預約
      const bookingsQuery = query(
        collection(db, "bookings"),
        where("userId", "==", user.uid)
      );

      unsubscribeBookings = onSnapshot(
        bookingsQuery,
        (snapshot) => {
          const nextBookings = snapshot.docs
            .map((bookingDocument) => {
              const data = bookingDocument.data();

             return {
  id: bookingDocument.id,
  classId: String(data.classId ?? ""),
  courseName: String(data.courseName ?? ""),
  location: String(data.location ?? ""),
                classStartTime:
                  data.classStartTime instanceof Timestamp
                    ? data.classStartTime
                    : null,
                pointsUsed: Number(data.pointsUsed ?? 0),
                status: String(data.status ?? ""),
                createdAt:
                  data.createdAt instanceof Timestamp
                    ? data.createdAt
                    : null,
              };
            })
            .sort(
              (first, second) =>
                timestampToMilliseconds(first.classStartTime) -
                timestampToMilliseconds(second.classStartTime)
            );

          setBookings(nextBookings);
        },
        (error) => {
          console.error(error);
          setMessage("讀取預約紀錄失敗。");
        }
      );

      // 只查詢目前會員自己的點數紀錄
      const pointsQuery = query(
        collection(db, "pointTransactions"),
        where("userId", "==", user.uid)
      );

      unsubscribePoints = onSnapshot(
        pointsQuery,
        (snapshot) => {
          const nextTransactions = snapshot.docs
            .map((transactionDocument) => {
              const data = transactionDocument.data();

              return {
  id: transactionDocument.id,
  courseName: String(data.courseName ?? ""),
  type: String(data.type ?? ""),
  amount: Number(data.amount ?? 0),
  balanceAfter: Number(data.balanceAfter ?? 0),

  classStartTime:
    data.classStartTime instanceof Timestamp
      ? data.classStartTime
      : null,

  createdAt:
    data.createdAt instanceof Timestamp
      ? data.createdAt
      : null,
};
            })
            .sort(
              (first, second) =>
                timestampToMilliseconds(second.createdAt) -
                timestampToMilliseconds(first.createdAt)
            );

          setPointTransactions(nextTransactions);
        },
        (error) => {
          console.error(error);
          setMessage("讀取點數紀錄失敗。");
        }
      );
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
      unsubscribeMember?.();
      unsubscribeBookings?.();
      unsubscribeClasses?.();
      unsubscribePoints?.();
    };
  }, [router]);

  async function handleCheckVerification() {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    setVerificationBusy(true);
    setMessage("");
    try {
      await reload(user);
      if (!user.emailVerified) {
        setMessage("尚未完成 Email 驗證，請先點擊信箱中的驗證連結。");
        return;
      }
      await user.getIdToken(true);
      // 重新執行會員資料載入及權限檢查。
      window.location.reload();
    } catch (error) {
      console.error(error);
      setMessage("確認驗證狀態失敗，請稍後再試。");
    } finally {
      setVerificationBusy(false);
    }
  }

  async function handleResendVerification() {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    setVerificationBusy(true);
    setMessage("");
    try {
      await sendEmailVerification(user);
      setMessage("驗證信已重新寄出，請檢查收件匣及垃圾郵件匣。");
    } catch (error) {
      console.error(error);
      setMessage("寄送失敗，可能寄送過於頻繁，請稍後再試。");
    } finally {
      setVerificationBusy(false);
    }
  }

  async function handleLogout() {
  try {
    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true") {
      try {
        await cleanupCurrentUserPushToken();
     } catch (pushError) {
  console.error("[Naya Push] Logout cleanup failed:", pushError);

  const errorMessage =
    pushError instanceof Error
      ? pushError.message
      : String(pushError);

  setMessage(
    `推播清理失敗：${errorMessage}`
  );
  return;
}
  return;
}
    }

    await signOut(auth);
    router.replace("/login");
  } catch (error) {
    console.error(error);
    setMessage("登出失敗，請稍後再試。");
  }
}

  if (isLoading) {
    return (
      <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-20">
        <p className="text-center text-slate-600">
          會員資料載入中……
        </p>
      </section>
    );
  }

  if (verificationRequired) {
    return (
      <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-20">
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">請先完成 Email 驗證</h1>
          <p className="mt-4 break-all text-slate-600">{verificationEmail}</p>
          <p className="mt-3 leading-7 text-slate-600">
            請開啟驗證信並點擊連結。完成前無法進入會員中心。
          </p>
          <button type="button" disabled={verificationBusy} onClick={handleCheckVerification}
            className="mt-6 w-full rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white disabled:opacity-50">
            我已完成 Email 驗證
          </button>
          <button type="button" disabled={verificationBusy} onClick={handleResendVerification}
            className="mt-3 w-full rounded-xl border border-sky-300 px-6 py-3 font-semibold text-sky-700 disabled:opacity-50">
            重新寄送驗證信
          </button>
          <button type="button" onClick={handleLogout}
            className="mt-4 text-sm text-slate-500 underline">登出</button>
          {message && <p className="mt-5 text-sm text-red-600">{message}</p>}
        </div>
      </section>
    );
  }

  if (!member) {
    return (
      <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-20">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            無法顯示會員資料
          </h1>

          <p className="mt-4 text-slate-600">
            {message || "目前找不到會員資料。"}
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-7 rounded-xl border border-sky-600 px-6 py-3 font-semibold text-sky-700"
          >
            登出
          </button>
        </div>
      </section>
    );
  }

  const now = Date.now();

const activeBookings = bookings.filter(
  (booking) =>
    booking.status === "booked" &&
    booking.classStartTime &&
    booking.classStartTime.toMillis() > now
);

const historyBookings = bookings
  .filter(
    (booking) =>
      booking.status !== "booked" ||
      (
        booking.classStartTime &&
        booking.classStartTime.toMillis() <= now
      )
  )
  .sort(
    (first, second) =>
      timestampToMilliseconds(second.classStartTime) -
      timestampToMilliseconds(first.classStartTime)
  );

  return (
    <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-12 md:py-20">
      <div className="mx-auto max-w-5xl">
        {/* 歡迎區 */}
        <div className="rounded-3xl bg-gradient-to-br from-sky-600 to-blue-500 p-8 text-white shadow-lg md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-100">
            Member Center
          </p>

          <h1 className="mt-3 text-3xl font-bold md:text-4xl">
            嗨，{member.name}
          </h1>

          <p className="mt-3 text-sky-100">
            歡迎回到 Naya Aerial
          </p>
        </div>

        {/* 點數與會員資料 */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <article className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">
              目前點數
            </p>

            <p className="mt-3 text-5xl font-bold text-sky-600">
              {member.points}
            </p>
<div className="mt-6">
  <Link
    href="/buy-packages"
    className="inline-block rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700"
  >
    購買課卡
  </Link>

  <Link
  href="/rewards"
  className="inline-block rounded-xl border border-sky-300 bg-white px-6 py-3 font-semibold text-sky-700 transition hover:bg-sky-50"
>
  我的紅利與優惠券
</Link>

</div>
            <p className="mt-2 text-sm text-slate-500">
              可用於預約課程
            </p>
          </article>

          <article className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:col-span-2">
            <h2 className="text-xl font-bold text-slate-900">
              會員資料
            </h2>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">姓名</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {member.name}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="mt-1 break-all font-semibold text-slate-800">
                  {member.email}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">電話</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {member.phone}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">空中運動經驗</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {member.experience}
                </dd>
              </div>
            </dl>
          </article>
        </div>
        {/* 舊會員點數認領 */}
{member.legacyStatus === "claimed" ? (
  <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800">
    ✓ 舊會員點數已成功移轉
  </div>
) : member.legacyStatus === "eligible" ? (
  <div className="mt-8">
    <LegacyMemberClaim />
  </div>
) : null}
{/* 我的空中旅程 */}
<MemberAerialJourney studentName={member.name} />

              {/* 特殊請假額度 */}
        {userId && (
          <div className="mt-8">
            <SpecialLeaveBalance userId={userId} />
          </div>
        )}

<details className="group mt-8 overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-sm">
  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 marker:hidden md:p-7">
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
        Notifications
      </p>

      <h2 className="mt-2 text-xl font-bold text-slate-900">
        最新通知
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        點擊查看課程提醒及系統通知
      </p>
    </div>

    <span className="shrink-0 rounded-xl bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 group-open:hidden">
      展開
    </span>

    <span className="hidden shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 group-open:inline-block">
      收合
    </span>
  </summary>

  <div className="border-t border-sky-100 px-4 pb-5 md:px-6">
    <PushNotificationSettings />
    <NotificationCenter />
  </div>
</details>


        {/* 我的預約 */}
        <article className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
                My Bookings
              </p>

              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                我的預約
              </h2>
            </div>

            <Link
              href="/booking"
              className="rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700"
            >
              預約課程
            </Link>
          </div>

          {activeBookings.length === 0 ? (
            <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
              <p className="text-slate-600">
                目前沒有已預約的課程。
              </p>
            </div>
          ) : (
            <div className="mt-7 space-y-4">
              {activeBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-2xl border border-sky-100 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {booking.courseName}
                      </h3>

                      <p className="mt-2 text-slate-600">
                        {formatDateTime(booking.classStartTime)}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        📍 {classLocations[booking.classId] || booking.location || "地點待確認"}
                        {getClassLocationAddress(classLocations[booking.classId] || booking.location) && (
                          <span className="mt-1 block text-sm text-slate-500">
                            📌 {getClassLocationAddress(classLocations[booking.classId] || booking.location)}
                            <br />
                            <a
                              href={getClassLocationMapsUrl(classLocations[booking.classId] || booking.location)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sky-700 underline"
                            >
                              🗺️ 開啟 Google Maps
                            </a>
                          </span>
                        )}
                      </p>
                    </div>

                    <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                      已預約
                    </span>
                  </div>

                  <p className="mt-4 text-sm text-slate-500">
                    使用點數：{booking.pointsUsed} 點
                  </p>
                  {booking.classStartTime && booking.classId && (
  <CancelBookingButton
    bookingId={booking.id}
    classId={booking.classId}
    classStartTime={booking.classStartTime}
  />
)}
                </div>
              ))}
            </div>
          )}
        </article>
{/* 歷史上課紀錄 */}
<article className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">
  <details>
    <summary className="cursor-pointer list-none">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Booking History
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            歷史上課紀錄
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            共 {historyBookings.length} 堂
          </p>
        </div>

        <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
          點此展開
        </span>
      </div>
    </summary>

    {historyBookings.length === 0 ? (
      <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
        <p className="text-slate-600">
          目前沒有歷史上課紀錄。
        </p>
      </div>
    ) : (
      <div className="mt-7 max-h-[500px] space-y-4 overflow-y-auto pr-2">
        {historyBookings.map((booking) => (
          <div
            key={booking.id}
            className="rounded-2xl border border-slate-200 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {booking.courseName}
                </h3>

                <p className="mt-2 text-slate-600">
                  {formatDateTime(
                    booking.classStartTime
                  )}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  📍 {classLocations[booking.classId] || booking.location || "地點待確認"}
                        {getClassLocationAddress(classLocations[booking.classId] || booking.location) && (
                          <span className="mt-1 block text-sm text-slate-500">
                            📌 {getClassLocationAddress(classLocations[booking.classId] || booking.location)}
                            <br />
                            <a
                              href={getClassLocationMapsUrl(classLocations[booking.classId] || booking.location)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sky-700 underline"
                            >
                              🗺️ 開啟 Google Maps
                            </a>
                          </span>
                        )}
                </p>
              </div>

              <span
  className={`rounded-full px-4 py-2 text-sm font-semibold ${
    booking.status === "cancelled"
      ? "bg-red-50 text-red-600"
      : booking.status === "special_leave"
      ? "bg-sky-50 text-sky-700"
      : "bg-slate-100 text-slate-600"
  }`}
>
  {booking.status === "cancelled"
    ? "已取消"
    : booking.status === "special_leave"
    ? "特殊請假"
    : "已結束"}
</span>
            </div>

            <p className="mt-4 text-sm text-slate-500">
              使用點數：{booking.pointsUsed} 點
            </p>
          </div>
        ))}
      </div>
    )}
  </details>
</article>
        {/* 點數紀錄 */}
        <article className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">

<details className="group">
  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 marker:hidden">
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
        Point History
      </p>

      <h2 className="mt-2 text-2xl font-bold text-slate-900">
        點數異動紀錄
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        共 {pointTransactions.length} 筆異動紀錄
      </p>
    </div>

    <span className="shrink-0 rounded-xl bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 group-open:hidden">
      展開
    </span>

    <span className="hidden shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 group-open:inline-block">
      收合
    </span>
  </summary>


          {pointTransactions.length === 0 ? (
            <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
              <p className="text-slate-600">
                目前沒有點數異動紀錄。
              </p>
            </div>
          ) : (
            <div className="mt-7 divide-y divide-slate-100">
              {(showAllPointTransactions
  ? pointTransactions
  : pointTransactions.slice(0, 5)
).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-5"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
  {transaction.type === "cancellation_refund"
    ? `取消課程退點｜${
        transaction.classStartTime
          ? `${formatClassDateTime(
              transaction.classStartTime
            )} `
          : ""
      }${transaction.courseName || "課程"}`

    : transaction.type === "special_leave_refund"
    ? `特殊請假退點｜${
        transaction.classStartTime
          ? `${formatClassDateTime(
              transaction.classStartTime
            )} `
          : ""
      }${transaction.courseName || "課程"}`

    : transaction.type === "booking"
    ? `預約課程｜${
        transaction.classStartTime
          ? `${formatClassDateTime(
              transaction.classStartTime
            )} `
          : ""
      }${transaction.courseName || "課程"}`

    : transaction.courseName || "點數調整"}
</p>

                    <p className="mt-1 text-sm text-slate-500">
                      {formatDateTime(transaction.createdAt)}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      異動後餘額：{transaction.balanceAfter} 點
                    </p>
                  </div>

                  <p
                    className={`text-xl font-bold ${
                      transaction.amount >= 0
                        ? "text-emerald-600"
                        : "text-orange-600"
                    }`}
                  >
                    {transaction.amount >= 0 ? "+" : ""}
                    {transaction.amount} 點
                  </p>
                </div>
              ))}
            </div>

          )}

          {pointTransactions.length > 5 && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() =>
                  setShowAllPointTransactions((previous) => !previous)
                }
                className="rounded-xl border border-sky-200 bg-sky-50 px-6 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
              >
                {showAllPointTransactions
                  ? "收起較舊紀錄"
                  : `查看更多（剩餘 ${
                      pointTransactions.length - 5
                    } 筆）`}
              </button>
            </div>
          )}
        </details>
      </article>


        {message && (
          <p className="mt-6 text-center text-sm text-red-600">
            {message}
          </p>
        )}
{member.role === "admin" && (
  <div className="mt-8 rounded-3xl border border-orange-100 bg-orange-50 p-7">
    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">
      Admin
    </p>

    <h2 className="mt-2 text-2xl font-bold text-slate-900">
      老師管理後台
    </h2>

    <p className="mt-3 text-slate-600">
      管理學生點數、課程與預約名單。
    </p>

    <Link
      href="/admin"
      className="mt-5 inline-block rounded-xl bg-orange-600 px-6 py-3 font-semibold text-white"
    >
      進入管理後台
    </Link>
  </div>
)}
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-300 bg-white px-7 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            登出
          </button>
        </div>
      </div>
    </section>
  );
}