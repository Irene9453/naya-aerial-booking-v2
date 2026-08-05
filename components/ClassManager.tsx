"use client";

import Link from "next/link";
import { Timestamp } from "firebase/firestore";
import AdminCreateClass from "@/components/AdminCreateClass";
import AdminClassRoster from "@/components/AdminClassRoster";

export type ClassData = {
  id: string;
  courseName: string;
  startTime: Timestamp | null;
  pointsRequired: number;
  capacity: number;
  bookedCount: number;
  status: string;
};

type ClassManagerProps = {
  classes: ClassData[];
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

export default function ClassManager({
  classes,
}: ClassManagerProps) {
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

      {classes.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前尚未建立課程。
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-4">
          {classes.map((classItem) => (
            <div
              key={classItem.id}
              className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-slate-200 p-5"
            >
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {classItem.courseName}
                </h3>

                <p className="mt-2 text-sm text-slate-600">
                  {formatDateTime(classItem.startTime)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-sky-50 px-4 py-2 font-semibold text-sky-700">
                  {classItem.pointsRequired} 點
                </span>

                <span className="rounded-full bg-slate-100 px-4 py-2 font-semibold text-slate-700">
                  {classItem.bookedCount} / {classItem.capacity} 人
                </span>

                <span
                  className={`rounded-full px-4 py-2 font-semibold ${
                    classItem.status === "open"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {classItem.status === "open"
                    ? "開放中"
                    : classItem.status}
                </span>

                <AdminClassRoster
                  classId={classItem.id}
                  courseName={classItem.courseName}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}