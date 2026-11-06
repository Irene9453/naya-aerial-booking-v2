
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";

import AdminSection from "@/components/AdminSection";
import { groupAdminClasses, classTime, classEndTime, type AdminClassCategory } from "@/lib/adminClassGroups";

import AdminCreateClass from "@/components/AdminCreateClass";
import AdminEditClassLocation from "@/components/AdminEditClassLocation";
import AdminClassRoster from "@/components/AdminClassRoster";
import AdminCancelWholeClass from "@/components/AdminCancelWholeClass";
import ClassLessonContent from "@/components/ClassLessonContent";
import ExportClassRecordsButton from "@/components/ExportClassRecordsButton";
import ClassPreparationAssistant from "@/components/ClassPreparationAssistant";

export type ClassData = {
  id: string;
  courseName: string;
  location?: string;
  startTime: Timestamp | null;
  endTime?: Timestamp | null;
  pointsRequired: number;
  capacity: number;
  bookedCount: number;
  status: string;
  allowMonthlyBooking?: boolean;
};

type ClassManagerProps = {
  classes: ClassData[];
};

type MonthGroup = {
  key: string;
  label: string;
  classes: ClassData[];
};

// 顯示台灣時間
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

// 取得台灣時區的年月，避免跨時區分錯月份
function getMonthKey(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "unscheduled";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(timestamp.toDate());

  const year = parts.find(
    (part) => part.type === "year"
  )?.value;

  const month = parts.find(
    (part) => part.type === "month"
  )?.value;

  return `${year}-${month}`;
}

function getMonthLabel(key: string) {
  if (key === "unscheduled") {
    return "尚未設定時間";
  }

  const [year, month] = key.split("-");

  return `${year} 年 ${Number(month)} 月`;
}

export default function ClassManager({
  classes,
}: ClassManagerProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const categories = useMemo(() => groupAdminClasses(classes, now), [classes, now]);
  const categoryLabels: Record<AdminClassCategory, { title: string; description: string; empty: string }> = {
    upcoming: { title: "未來課程", description: "由近到遠排列，包含進行中的課程；未設定時間的課程放在最後。", empty: "目前沒有未來課程。" },
    past: { title: "已結束課程", description: "最近結束的課程在前。舊資料若沒有結束時間，會依開始時間分類並標示。", empty: "目前沒有已結束課程。" },
    cancelled: { title: "已取消課程", description: "依上課日期距離現在由近到遠排列，不混入未來或已結束課程。", empty: "目前沒有已取消課程。" },
  };
  function monthsFor(items: ClassData[]): MonthGroup[] {
    const groups = new Map<string, ClassData[]>();
    for (const item of items) {
      const key = getMonthKey(item.startTime);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups].map(([key, items]) => ({ key, label: getMonthLabel(key), classes: items }));
  }

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Classes
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            課程管理
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            目前共有 {classes.length} 堂課程
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <AdminCreateClass />

          <Link
            href="/booking"
            className="rounded-xl border border-sky-600 px-5 py-3 font-semibold text-sky-700 transition hover:bg-sky-50"
          >
            查看學生課表
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <ExportClassRecordsButton />
      </div>

      <div className="mt-6">
        {(["upcoming", "past", "cancelled"] as const).map(category => <AdminSection key={category}
          title={categoryLabels[category].title} description={categoryLabels[category].description} count={categories[category].length}>
          <div className="space-y-6 p-4 md:p-5">
            {categories[category].length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-slate-700">{categoryLabels[category].empty}</p>}
            {monthsFor(categories[category]).map(month => <section key={month.key}>
              <h3 className="mb-3 font-bold text-sky-800">{month.label}（{month.classes.length} 堂）</h3>
              <div className="space-y-4">{month.classes.map(classItem => {
                const start = classTime(classItem.startTime);
                const end = classEndTime(classItem);
                const ongoing = category === "upcoming" && start !== null && start <= now && end !== null && end > now;
                const status = category === "cancelled" ? "已取消" : category === "past" ? "已結束" : ongoing ? "進行中" : classItem.status === "open" ? "開放中" : classItem.status;
                return <article key={classItem.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="min-w-0">
                    <h4 className="break-words text-lg font-bold text-slate-900">{classItem.courseName}</h4>
                    <p className="mt-2 text-sm text-slate-700">{formatDateTime(classItem.startTime)}</p>
                    {!classItem.endTime && start !== null && start <= now && category !== "cancelled" && (
                      <p className="mt-1 text-xs text-amber-800">未記錄結束時間，依開始時間分類</p>
                    )}
                    <AdminEditClassLocation classId={classItem.id} location={classItem.location ?? ""} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm" aria-label="課程狀態">
                    <span className="rounded-full bg-sky-50 px-3 py-1.5 font-semibold text-sky-800">{classItem.pointsRequired} 點</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{classItem.bookedCount} / {classItem.capacity} 人</span>
                    <span className={`rounded-full px-3 py-1.5 font-semibold ${category === "cancelled" ? "bg-red-50 text-red-800" : category === "past" ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"}`}>{status}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-start sm:gap-3">
                    <div className="min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
                      <AdminClassRoster classId={classItem.id} courseName={classItem.courseName} />
                    </div>
                    <div className="min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
                      <ClassPreparationAssistant classId={classItem.id} courseName={classItem.courseName} />
                    </div>
                    <div className="col-span-2 min-w-0 sm:col-span-1 [&>div>button]:w-full sm:[&>div>button]:w-auto">
                      <AdminCancelWholeClass classId={classItem.id} courseName={classItem.courseName} startTimeMillis={start} status={classItem.status} />
                    </div>
                  </div>
                  <ClassLessonContent classId={classItem.id} />
                </article>;
              })}</div>
            </section>)}
          </div>
        </AdminSection>)}
      </div>
    </article>
  );
}
