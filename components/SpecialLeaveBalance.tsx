"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type SpecialLeaveBalanceProps = {
  userId: string;
};

type LeaveRecord = {
  id: string;
  courseName: string;
  usedAt: Timestamp | null;
};

function getCurrentPeriod() {
  const now = new Date();

  const year = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      year: "numeric",
    }).format(now)
  );

  const month = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      month: "numeric",
    }).format(now)
  );

  const half = month <= 6 ? 1 : 2;

  return {
    year,
    half,
    periodKey: `${year}-H${half}`,
    label: `${year} 年${half === 1 ? "上半年" : "下半年"}`,
  };
}

function formatDate(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "";
  }

  return timestamp.toDate().toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export default function SpecialLeaveBalance({
  userId,
}: SpecialLeaveBalanceProps) {
  const [leaveRecord, setLeaveRecord] =
    useState<LeaveRecord | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const currentPeriod = getCurrentPeriod();

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const leaveQuery = query(
      collection(db, "specialLeaveRecords"),
      where("userId", "==", userId),
      where("periodKey", "==", currentPeriod.periodKey),
      where("status", "==", "approved")
    );

    const unsubscribe = onSnapshot(
      leaveQuery,
      (snapshot) => {
        if (snapshot.empty) {
          setLeaveRecord(null);
        } else {
          const leaveDocument = snapshot.docs[0];
          const data = leaveDocument.data();

          setLeaveRecord({
            id: leaveDocument.id,
            courseName: String(data.courseName ?? ""),
            usedAt:
              data.usedAt instanceof Timestamp
                ? data.usedAt
                : null,
          });
        }

        setMessage("");
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setMessage("讀取特殊請假額度失敗。");
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [userId, currentPeriod.periodKey]);

  const hasUsedLeave = leaveRecord !== null;

  return (
    <article className="rounded-3xl bg-white p-7 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Special Leave
          </p>

          <h2 className="mt-2 text-xl font-bold text-slate-900">
            特殊請假額度
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {currentPeriod.label}
          </p>
        </div>

        {!isLoading && (
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              hasUsedLeave
                ? "bg-slate-100 text-slate-600"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {hasUsedLeave ? "本期已使用" : "尚未使用"}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-500">
          額度讀取中……
        </p>
      ) : message ? (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </p>
      ) : (
        <>
          <div className="mt-6 rounded-2xl bg-slate-50 p-5">
            <p className="text-sm text-slate-500">
              本期剩餘
            </p>

            <div className="mt-2 flex items-end gap-2">
              <span
                className={`text-4xl font-bold ${
                  hasUsedLeave
                    ? "text-slate-400"
                    : "text-sky-600"
                }`}
              >
                {hasUsedLeave ? 0 : 1}
              </span>

              <span className="pb-1 text-slate-500">
                / 1 次
              </span>
            </div>
          </div>

          {hasUsedLeave && leaveRecord && (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">
                本期使用紀錄
              </p>

              {leaveRecord.usedAt && (
                <p className="mt-2 text-sm text-slate-500">
                  使用日期：
                  {formatDate(leaveRecord.usedAt)}
                </p>
              )}

              {leaveRecord.courseName && (
                <p className="mt-1 text-sm text-slate-500">
                  課程：{leaveRecord.courseName}
                </p>
              )}
            </div>
          )}

          {!hasUsedLeave && (
            <p className="mt-4 text-sm leading-6 text-slate-500">
              每半年提供 1 次特殊請假額度。超過一般取消期限後，如遇突發身體不適，可於符合條件的課程使用。
            </p>
          )}
        </>
      )}
    </article>
  );
}