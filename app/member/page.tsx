"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import CancelBookingButton from "@/components/CancelBookingButton";
import NotificationCenter from "@/components/NotificationCenter";
import SpecialLeaveBalance from "@/components/SpecialLeaveBalance";

type MemberData = {
  name: string;
  email: string;
  phone: string;
  experience: string;
  points: number;
  role: "student" | "admin";
};

type BookingData = {
  id: string;
  classId: string;
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

export default function MemberPage() {
  const router = useRouter();

  const [member, setMember] = useState<MemberData | null>(null);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [userId, setUserId] = useState("");
  const [pointTransactions, setPointTransactions] = useState<
    PointTransactionData[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribeMember: (() => void) | undefined;
    let unsubscribeBookings: (() => void) | undefined;
    let unsubscribePoints: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
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
          });

          setIsLoading(false);
        },
        (error) => {
          console.error(error);
          setMessage("讀取會員資料失敗。");
          setIsLoading(false);
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
      unsubscribeAuth();
      unsubscribeMember?.();
      unsubscribeBookings?.();
      unsubscribePoints?.();
    };
  }, [router]);

  async function handleLogout() {
    try {
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

  const activeBookings = bookings.filter(
    (booking) => booking.status === "booked"
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
              {/* 特殊請假額度 */}
        {userId && (
          <div className="mt-8">
            <SpecialLeaveBalance userId={userId} />
          </div>
        )}
<NotificationCenter />

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

        {/* 點數紀錄 */}
        <article className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Point History
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            點數異動紀錄
          </h2>

          {pointTransactions.length === 0 ? (
            <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
              <p className="text-slate-600">
                目前沒有點數異動紀錄。
              </p>
            </div>
          ) : (
            <div className="mt-7 divide-y divide-slate-100">
              {pointTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-5"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {transaction.courseName || "點數調整"}
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