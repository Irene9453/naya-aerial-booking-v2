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
import AdminTodayClasses from "@/components/AdminTodayClasses";
import AdminPackageManager from "@/components/AdminPackageManager";
import StudentManager from "@/components/StudentManager";
import ClassManager from "@/components/ClassManager";
import AdminRevenueSummary from "@/components/AdminRevenueSummary";
import AdminInitializeCoupons from "@/components/AdminInitializeCoupons";
import AdminPurchaseRequests from "@/components/AdminPurchaseRequests";
import AdminSpecialLeaveManager from "@/components/AdminSpecialLeaveManager";

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

  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;

  role: string;
};

type ClassData = {
  id: string;
  courseName: string;
  startTime: Timestamp | null;
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

export default function AdminPage() {
  const router = useRouter();

  const [students, setStudents] = useState<StudentData[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribeStudents: (() => void) | undefined;
    let unsubscribeClasses: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const adminRef = doc(db, "users", user.uid);

      const unsubscribeAdmin = onSnapshot(
        adminRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            router.replace("/member");
            return;
          }

          const role = String(snapshot.data().role ?? "student");

          if (role !== "admin") {
            router.replace("/member");
            return;
          }

          const studentsQuery = query(collection(db, "users"));

          unsubscribeStudents = onSnapshot(
            studentsQuery,
            (studentsSnapshot) => {
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
              setIsLoading(false);
            },
            (error) => {
              console.error(error);
              setMessage("讀取會員資料失敗。");
              setIsLoading(false);
            }
          );

          const classesQuery = query(collection(db, "classes"));

          unsubscribeClasses = onSnapshot(
            classesQuery,
            (classesSnapshot) => {
              const nextClasses = classesSnapshot.docs
                .map((classDocument) => {
                  const data = classDocument.data();

                  return {
                    id: classDocument.id,
                    courseName: String(data.courseName ?? ""),
                    startTime:
                      data.startTime instanceof Timestamp
                        ? data.startTime
                        : null,
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
                  return firstTime - secondTime;
                });

              setClasses(nextClasses);
            },
            (error) => {
              console.error(error);
              setMessage("讀取課程資料失敗。");
            }
          );
        },
        (error) => {
          console.error(error);
          setMessage("無法確認管理員身分。");
          setIsLoading(false);
        }
      );

      return unsubscribeAdmin;
    });

    return () => {
      unsubscribeAuth();
      unsubscribeStudents?.();
      unsubscribeClasses?.();
    };
  }, [router]);

  if (isLoading) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-20">
        <p className="text-center text-slate-600">
          管理後台載入中……
        </p>
      </section>
    );
  }

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

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
</div>

{/* 今日課程 */}
<AdminTodayClasses classes={classes} />

{/* 收入統計 */}
<AdminRevenueSummary />

{/* 購買申請 */}
<AdminPurchaseRequests />
<AdminTodayClasses classes={classes} />

<AdminRevenueSummary />

<AdminSpecialLeaveManager />

<StudentManager students={students} />

<ClassManager classes={classes} />

<AdminPackageManager />

<AdminInitializeCoupons />

{/* 會員管理 */}
<StudentManager students={students} />

{/* 課程管理 */}
<ClassManager classes={classes} />

{/* 課卡管理 */}
<AdminPackageManager />

{/* 優惠管理 */}
<AdminInitializeCoupons />

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