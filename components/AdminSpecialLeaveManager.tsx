"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type SpecialLeaveRecord = {
  id: string;
  studentName: string;
  userId: string;
  courseName: string;
  classStartTime: Timestamp | null;
  usedAt: Timestamp | null;
  periodYear: number;
  periodHalf: number;
  periodKey: string;
  pointsRefunded: number;
  bookedCountBefore: number;
  status: string;
};

function formatDateTime(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "時間未設定";
  }

  return timestamp.toDate().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getPeriodLabel(
  periodYear: number,
  periodHalf: number
) {
  if (!periodYear) {
    return "期間未設定";
  }

  return `${periodYear} 年${
    periodHalf === 1 ? "上半年" : "下半年"
  }`;
}

export default function AdminSpecialLeaveManager() {
  const [records, setRecords] = useState<
    SpecialLeaveRecord[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const leaveQuery = query(
      collection(db, "specialLeaveRecords")
    );

    const unsubscribe = onSnapshot(
      leaveQuery,
      (snapshot) => {
        const nextRecords = snapshot.docs
          .map((leaveDocument) => {
            const data = leaveDocument.data();

            return {
              id: leaveDocument.id,
              studentName: String(
                data.studentName ?? "未填寫姓名"
              ),
              userId: String(data.userId ?? ""),
              courseName: String(
                data.courseName ?? ""
              ),
              classStartTime:
                data.classStartTime instanceof Timestamp
                  ? data.classStartTime
                  : null,
              usedAt:
                data.usedAt instanceof Timestamp
                  ? data.usedAt
                  : null,
              periodYear: Number(
                data.periodYear ?? 0
              ),
              periodHalf: Number(
                data.periodHalf ?? 0
              ),
              periodKey: String(
                data.periodKey ?? ""
              ),
              pointsRefunded: Number(
                data.pointsRefunded ?? 0
              ),
              bookedCountBefore: Number(
                data.bookedCountBefore ?? 0
              ),
              status: String(
                data.status ?? ""
              ),
            };
          })
          .sort((first, second) => {
            const firstTime =
              first.usedAt?.toMillis() ?? 0;
            const secondTime =
              second.usedAt?.toMillis() ?? 0;

            return secondTime - firstTime;
          });

        setRecords(nextRecords);
        setMessage("");
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setMessage("讀取特殊請假紀錄失敗。");
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const approvedRecords = records.filter(
    (record) => record.status === "approved"
  );

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Special Leave
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            特殊請假紀錄
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            查看會員每半年特殊請假的使用狀況與退點紀錄。
          </p>
        </div>

        <div className="rounded-2xl bg-sky-50 px-5 py-4 text-center">
          <p className="text-xs font-semibold text-sky-600">
            累計使用
          </p>

          <p className="mt-1 text-2xl font-bold text-sky-800">
            {approvedRecords.length}
          </p>
        </div>
      </div>

      {message && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </p>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-slate-600">
          特殊請假紀錄載入中……
        </p>
      ) : approvedRecords.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前尚無特殊請假紀錄。
          </p>
        </div>
      ) : (
        <div className="mt-7 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 font-semibold">
                  學生
                </th>

                <th className="px-4 py-3 font-semibold">
                  課程
                </th>

                <th className="px-4 py-3 font-semibold">
                  上課時間
                </th>

                <th className="px-4 py-3 font-semibold">
                  使用額度
                </th>

                <th className="px-4 py-3 font-semibold">
                  使用時間
                </th>

                <th className="px-4 py-3 text-right font-semibold">
                  退點
                </th>
              </tr>
            </thead>

            <tbody>
              {approvedRecords.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-slate-100"
                >
                  <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">
                    {record.studentName}
                  </td>

                  <td className="px-4 py-4 text-slate-700">
                    {record.courseName || "未設定"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {formatDateTime(
                      record.classStartTime
                    )}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4">
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                      {getPeriodLabel(
                        record.periodYear,
                        record.periodHalf
                      )}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {formatDateTime(record.usedAt)}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-right font-bold text-emerald-600">
                    +{record.pointsRefunded} 點
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}