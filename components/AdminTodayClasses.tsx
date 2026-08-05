"use client";

import { Timestamp } from "firebase/firestore";
import AdminClassRoster from "@/components/AdminClassRoster";

type ClassData = {
  id: string;
  courseName: string;
  startTime: Timestamp | null;
  pointsRequired: number;
  capacity: number;
  bookedCount: number;
  status: string;
};

type AdminTodayClassesProps = {
  classes: ClassData[];
};

function getTaipeiDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTime(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "時間未設定";
  }

  return timestamp.toDate().toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatToday() {
  return new Date().toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export default function AdminTodayClasses({
  classes,
}: AdminTodayClassesProps) {
  const todayKey = getTaipeiDateKey(new Date());

  const todayClasses = classes
    .filter((classItem) => {
      if (!classItem.startTime) {
        return false;
      }

      return (
        getTaipeiDateKey(classItem.startTime.toDate()) === todayKey
      );
    })
    .sort(
      (first, second) =>
        (first.startTime?.toMillis() ?? 0) -
        (second.startTime?.toMillis() ?? 0)
    );

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
          Today
        </p>

        <h2 className="mt-2 text-2xl font-bold text-slate-900">
          今日課程
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          {formatToday()}
        </p>
      </div>

      {todayClasses.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            今天沒有安排課程。
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-4">
          {todayClasses.map((classItem) => (
            <div
              key={classItem.id}
              className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-sky-100 p-5"
            >
              <div className="flex items-center gap-5">
                <div className="min-w-20 rounded-2xl bg-sky-50 px-4 py-3 text-center">
                  <p className="text-lg font-bold text-sky-700">
                    {formatTime(classItem.startTime)}
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {classItem.courseName}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    已預約 {classItem.bookedCount} /{" "}
                    {classItem.capacity} 人
                  </p>
                </div>
              </div>

              <AdminClassRoster
                classId={classItem.id}
                courseName={classItem.courseName}
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}