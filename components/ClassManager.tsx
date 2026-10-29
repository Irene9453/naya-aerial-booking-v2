
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";

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
  // null 表示尚未手動選擇，預設展開最新月份
  const [expandedMonths, setExpandedMonths] = useState<
    string[] | null
  >(null);

  // 先將所有課程由新到舊排列，再依月份分組
  const monthGroups = useMemo<MonthGroup[]>(() => {
    const sortedClasses = [...classes].sort((a, b) => {
      const firstTime =
        a.startTime?.toMillis() ?? -Infinity;

      const secondTime =
        b.startTime?.toMillis() ?? -Infinity;

      return secondTime - firstTime;
    });

    const groups = new Map<string, ClassData[]>();

    for (const classItem of sortedClasses) {
      const monthKey = getMonthKey(
        classItem.startTime
      );

      if (!groups.has(monthKey)) {
        groups.set(monthKey, []);
      }

      groups.get(monthKey)!.push(classItem);
    }

    return Array.from(groups.entries()).map(
      ([key, groupClasses]) => ({
        key,
        label: getMonthLabel(key),
        classes: groupClasses,
      })
    );
  }, [classes]);

  const latestMonthKey =
    monthGroups.find(
      (group) => group.key !== "unscheduled"
    )?.key;

  // 初次載入展開最新月份，並排除已不存在的月份
  const activeExpandedMonths =
    expandedMonths === null
      ? (latestMonthKey ? [latestMonthKey] : [])
      : expandedMonths.filter((key) =>
          monthGroups.some((group) => group.key === key)
        );

  function toggleMonth(monthKey: string) {
    setExpandedMonths((previous) => {
      const current =
        previous ??
        (latestMonthKey ? [latestMonthKey] : []);

      if (current.includes(monthKey)) {
        return current.filter(
          (key) => key !== monthKey
        );
      }

      return [...current, monthKey];
    });
  }

  function expandAll() {
    setExpandedMonths(
      monthGroups.map((group) => group.key)
    );
  }

  function collapseAll() {
    setExpandedMonths([]);
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

      {classes.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前尚未建立課程。
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-4">
          {/* 月份操作按鈕 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              共 {monthGroups.length} 個月份
              · 最新課程優先
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="rounded-xl border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              >
                全部展開
              </button>

              <button
                type="button"
                onClick={collapseAll}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                全部收合
              </button>
            </div>
          </div>

          {/* 月份分組 */}
          {monthGroups.map((group) => {
            const isExpanded =
              activeExpandedMonths.includes(group.key);

            return (
              <div
                key={group.key}
                className="overflow-hidden rounded-2xl border border-slate-200"
              >
                {/* 月份標題 */}
                <button
                  type="button"
                  onClick={() => toggleMonth(group.key)}
                  aria-expanded={isExpanded}
                  className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition ${
                    isExpanded
                      ? "bg-sky-50"
                      : "bg-slate-50 hover:bg-sky-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-lg font-bold text-slate-900">
                      {group.label}
                    </span>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700">
                      {group.classes.length} 堂課
                    </span>
                  </div>

                  <span className="flex items-center gap-2 text-sm font-semibold text-sky-700">
                    {isExpanded ? "收合" : "展開"}

                    <svg
                      className={`h-5 w-5 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m6 9 6 6 6-6"
                      />
                    </svg>
                  </span>
                </button>

                {/* 該月份課程 */}
                {isExpanded && (
                  <div className="space-y-4 p-4 md:p-5">
                    {group.classes.map((classItem) => (
                      <div
                        key={classItem.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-5">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">
                              {classItem.courseName}
                            </h3>

                            <p className="mt-2 text-sm text-slate-600">
                              {formatDateTime(
                                classItem.startTime
                              )}
                            </p>

                            <AdminEditClassLocation
                              classId={classItem.id}
                              location={classItem.location ?? ""}
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="rounded-full bg-sky-50 px-4 py-2 font-semibold text-sky-700">
                              {classItem.pointsRequired} 點
                            </span>

                            <span className="rounded-full bg-slate-100 px-4 py-2 font-semibold text-slate-700">
                              {classItem.bookedCount} /{" "}
                              {classItem.capacity} 人
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

                            <ClassPreparationAssistant
                              classId={classItem.id}
                              courseName={
                                classItem.courseName
                              }
                            />

                            <AdminClassRoster
                              classId={classItem.id}
                              courseName={
                                classItem.courseName
                              }
                            />                            <AdminCancelWholeClass
                              classId={classItem.id}
                              courseName={classItem.courseName}
                              startTimeMillis={
                                classItem.startTime?.toMillis() ?? null
                              }
                              status={classItem.status}
                            />

                          </div>
                        </div>

                        <ClassLessonContent
                          classId={classItem.id}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
