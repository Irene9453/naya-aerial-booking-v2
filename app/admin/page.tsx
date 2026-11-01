"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import AdminCouponValidityManager from "@/components/AdminCouponValidityManager";
import AdminSection from "@/components/AdminSection";
import AdminTodayClasses from "@/components/AdminTodayClasses";
import AdminPackageManager from "@/components/AdminPackageManager";
import StudentManager from "@/components/StudentManager";
import ClassManager from "@/components/ClassManager";
import AdminRevenueSummary from "@/components/AdminRevenueSummary";
import AdminCouponManager from "@/components/AdminCouponManager";
import AdminLegacyCouponAudit from "@/components/AdminLegacyCouponAudit";
import AdminCouponGiftManager from "@/components/AdminCouponGiftManager";
import AdminPurchaseRequests from "@/components/AdminPurchaseRequests";
import AdminSpecialLeaveManager from "@/components/AdminSpecialLeaveManager";
import MovementLibrary from "@/components/MovementLibrary";
import {
  AdminLegacyMemberManager,
} from "@/components/AdminLegacyMemberManager";
import AdminMilestoneRewards from "@/components/AdminMilestoneRewards";

type StudentData = {
  id: string;
  name: string;
  nickname: string;
  email: string;
  phone: string;
  phoneNormalized: string;
  experience: string;

  points: number;
rewardPoints: number;
journeyLegacyClasses?: number;

  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;

  role: string;
};

type ClassData = {
  id: string;
  courseName: string;
  location: string;
  startTime: Timestamp | null;
  endTime: Timestamp | null;
  pointsRequired: number;
  capacity: number;
  bookedCount: number;
  status: string;
  allowMonthlyBooking: boolean;
};

function formatDateTime(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "時間未設定";
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

import { memberConnectionMessage } from "@/lib/clientConnection";

export default function AdminPage() {
  const router = useRouter();

  const [students, setStudents] = useState<StudentData[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribeStudents: (() => void) | undefined;
    let unsubscribeClasses: (() => void) | undefined;
    let unsubscribeAdmin: (() => void) | undefined;
    let disposed = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout>;
    const startLoadingDeadline = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
      if (!disposed) { setMessage(memberConnectionMessage({ code: "unavailable" })); finishLoading(); }
      }, 15000);
    };
    startLoadingDeadline();
    const finishLoading = () => { clearTimeout(timer); setIsLoading(false); };
    const stopData = () => {
      unsubscribeStudents?.(); unsubscribeClasses?.();
      unsubscribeStudents = unsubscribeClasses = undefined;
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      const current = ++generation;
      const isCurrent = () => !disposed && current === generation;
      unsubscribeAdmin?.(); stopData();
      unsubscribeAdmin = undefined;
      startLoadingDeadline();
      setIsAdmin(false); setIsLoading(true); setStudents([]); setClasses([]); setMessage("");
      if (!user) {
        finishLoading();
        router.replace("/login?redirect=/admin");
        return;
      }

      const adminRef = doc(db, "users", user.uid);

      unsubscribeAdmin = onSnapshot(
        adminRef,
        (snapshot) => {
          if (!isCurrent()) return;
          if (!snapshot.exists()) {
            stopData(); setIsAdmin(false); finishLoading();
            router.replace("/member");
            return;
          }

          const role = String(snapshot.data().role ?? "student");

          if (role !== "admin") {
            stopData(); setIsAdmin(false); finishLoading();
            router.replace("/member");
            return;
          }

          setIsAdmin(true);
          if (unsubscribeStudents || unsubscribeClasses) return;
          const studentsQuery = query(collection(db, "users"));

          unsubscribeStudents = onSnapshot(
            studentsQuery,
            (studentsSnapshot) => {
              if (!isCurrent()) return;
              const nextStudents = studentsSnapshot.docs
                .map((studentDocument) => {
                  const data = studentDocument.data();

                  return {
  id: studentDocument.id,

  name: String(data.name ?? ""),
  nickname: String(data.nickname ?? ""),
  email: String(data.email ?? ""),

  phone: String(data.phone ?? ""),

  phoneNormalized: String(
    data.phoneNormalized ??
      data.phone ??
      ""
  ),

  experience: String(
    data.experience ?? ""
  ),

  points: Number(
    data.points ?? 0
  ),

  rewardPoints: Number(
    data.rewardPoints ?? 0
  ),
journeyLegacyClasses: Number(
  data.journeyLegacyClasses ?? 0
),
  birthdayYear: Number(
    data.birthdayYear ?? 0
  ),

  birthdayMonth: Number(
    data.birthdayMonth ?? 0
  ),

  birthdayDay: Number(
    data.birthdayDay ?? 0
  ),

  role: String(
    data.role ?? "student"
  ),
};
                })
                .sort((a, b) =>
                  a.name.localeCompare(b.name, "zh-Hant")
                );

              setStudents(nextStudents);
              finishLoading();
            },
            (error) => {
              if (!isCurrent()) return;
              console.error(error);
              setMessage("讀取會員資料失敗。");
              finishLoading();
            }
          );

          const classesQuery = query(collection(db, "classes"));

          unsubscribeClasses = onSnapshot(
            classesQuery,
            (classesSnapshot) => {
              if (!isCurrent()) return;
              const nextClasses = classesSnapshot.docs
                .map((classDocument) => {
                  const data = classDocument.data();

                  return {
                    id: classDocument.id,
                    courseName: String(data.courseName ?? ""),
                    location: String(data.location ?? ""),
                    startTime:
                      data.startTime instanceof Timestamp
                        ? data.startTime
                        : null,
                    endTime: data.endTime instanceof Timestamp ? data.endTime : null,
                    pointsRequired: Number(data.pointsRequired ?? 0),
                    capacity: Number(data.capacity ?? 0),
                    bookedCount: Number(data.bookedCount ?? 0),
status: String(data.status ?? ""),
allowMonthlyBooking: Boolean(
  data.allowMonthlyBooking ?? false
),
                  };
                })
                .sort((a, b) => {
  const firstTime = a.startTime?.toMillis() ?? 0;
  const secondTime = b.startTime?.toMillis() ?? 0;

  return secondTime - firstTime;
});

              setClasses(nextClasses);
            },
            (error) => {
              if (!isCurrent()) return;
              console.error(error);
              setMessage("讀取課程資料失敗。");
            }
          );
        },
        (error) => {
          if (!isCurrent()) return;
          stopData(); setIsAdmin(false);
          console.error(error);
          setMessage(memberConnectionMessage(error));
          finishLoading();
        }
      );


    });

    return () => {
      disposed = true; generation++; clearTimeout(timer);
      unsubscribeAuth(); unsubscribeAdmin?.(); stopData();
    };
  }, [router, loadAttempt]);

  if (isLoading) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-20">
        <p className="text-center text-slate-600">
          管理後台載入中……
        </p>
        <div className="mt-6 flex justify-center gap-4"><button type="button" onClick={() => setLoadAttempt(value => value + 1)} className="rounded-xl border border-sky-600 px-4 py-3 font-semibold text-sky-800">重新載入</button><Link href="/login?redirect=/admin" className="rounded-xl px-4 py-3 font-semibold text-sky-800 underline">前往登入頁</Link></div>
      </section>
    );
  }

  if (!isAdmin) return <section className="min-h-screen bg-slate-50 px-6 py-20">
    <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center">
      <h1 className="text-2xl font-bold text-slate-900">暫時無法開啟管理後台</h1>
      <p role="status" className="mt-4 text-slate-700">{message || "請使用管理員帳號登入。"}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => setLoadAttempt(value => value + 1)} className="rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white">重新載入</button><Link href="/login?redirect=/admin" className="rounded-xl border border-sky-600 px-5 py-3 font-semibold text-sky-800">前往登入頁</Link></div>
    </div>
  </section>;

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-12 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl bg-slate-900 p-8 text-white shadow-lg md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-300">
            Admin Dashboard
          </p>

          <h1 className="mt-3 text-3xl font-bold md:text-4xl">
            Naya Aerial 管理後台
          </h1>

          <p className="mt-3 text-slate-300">
            管理會員、點數、課程與預約名單。
          </p>
        </div>

        <AdminSection title="後台總覽" description="會員人數與課程數量"><div className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-3">
  <article className="rounded-3xl bg-white p-7 shadow-sm">
    <p className="text-sm font-semibold text-slate-500">
      會員人數
    </p>

    <p className="mt-3 text-4xl font-bold text-sky-600">
      {students.filter((student) => student.role === "student").length}
    </p>
  </article>

  <article className="rounded-3xl bg-white p-7 shadow-sm">
    <p className="text-sm font-semibold text-slate-500">
      課程數量
    </p>

    <p className="mt-3 text-4xl font-bold text-sky-600">
      {classes.length}
    </p>
  </article>

  <article className="rounded-3xl bg-white p-7 shadow-sm">
    <p className="text-sm font-semibold text-slate-500">
      開放中課程
    </p>

    <p className="mt-3 text-4xl font-bold text-sky-600">
      {classes.filter(
        (classItem) => classItem.status === "open"
      ).length}
    </p>
  </article>
</div></AdminSection>

{/* 今日課程 */}
<AdminSection title="今日課程"><AdminTodayClasses classes={classes} /></AdminSection>

{/* 購買申請 */}
<AdminSection title="購買申請"><AdminPurchaseRequests /></AdminSection>

{/* 課程管理 */}
<AdminSection title="課程管理"><ClassManager classes={classes} /></AdminSection>

{/* 舊會員移轉管理 */}
<AdminSection title="舊會員移轉管理"><AdminLegacyMemberManager /></AdminSection>
{/* 會員管理 */}
<AdminSection title="會員與點數"><StudentManager students={students} /></AdminSection>

{/* 里程碑獎勵管理 */}
<AdminSection title="里程碑獎勵管理"><AdminMilestoneRewards /></AdminSection>

<AdminSection title="特殊請假管理"><AdminSpecialLeaveManager /></AdminSection>
<AdminSection title="動作資料庫"><MovementLibrary /></AdminSection>

{/* 課卡管理 */}
<AdminSection title="課卡商品管理"><AdminPackageManager /></AdminSection>

{/* 優惠管理 */}
<AdminSection title="優惠券管理"><AdminCouponManager /></AdminSection>
      <AdminSection title="優惠券期限管理"><AdminCouponValidityManager /></AdminSection>
      <AdminSection title="管理員贈券"><AdminCouponGiftManager /></AdminSection>
      <AdminSection title="舊會員優惠券核對"><AdminLegacyCouponAudit /></AdminSection>

{/* 收入統計 */}
<AdminSection title="收入統計"><AdminRevenueSummary /></AdminSection>

{message && (
  <p className="mt-6 text-center text-sm text-red-600">
    {message}
  </p>
)}

        <div className="mt-8 text-center">
          <Link
            href="/member"
            className="inline-block rounded-xl border border-slate-300 bg-white px-7 py-3 font-semibold text-slate-700"
          >
            返回會員中心
          </Link>
        </div>
      </div>
    </section>
  );
}