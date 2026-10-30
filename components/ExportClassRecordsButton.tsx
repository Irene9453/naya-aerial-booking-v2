"use client";

import { useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";

import { db } from "@/lib/firebase";

type ExportRow = {
  日期: string;
  星期: string;
  時間: string;
  課程: string;
  上課內容: string;
  預約人數: number;
  總名額: number;
};

function getTaipeiParts(timestamp: Timestamp) {
  const date = timestamp.toDate();

  const dateText = date.toLocaleDateString(
    "zh-TW",
    {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  );

  const weekday = date.toLocaleDateString(
    "zh-TW",
    {
      timeZone: "Asia/Taipei",
      weekday: "short",
    }
  );

  const time = date.toLocaleTimeString(
    "zh-TW",
    {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );

  const yearMonth =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(date)
      .reduce(
        (result, part) => {
          if (part.type === "year") {
            result.year = part.value;
          }

          if (part.type === "month") {
            result.month = part.value;
          }

          return result;
        },
        {
          year: "",
          month: "",
        }
      );

  return {
    dateText,
    weekday,
    time,
    monthKey:
      `${yearMonth.year}-${yearMonth.month}`,
  };
}

export default function ExportClassRecordsButton() {
  const [month, setMonth] =
    useState("");

  const [isExporting, setIsExporting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  async function handleExport() {
    setMessage("");

    if (!month) {
      setMessage("請先選擇月份。");
      return;
    }

    setIsExporting(true);

    try {
      const classQuery = query(
        collection(db, "classes"),
        orderBy("startTime", "asc")
      );

      const snapshot =
        await getDocs(classQuery);

      const rows: ExportRow[] = [];

      snapshot.docs.forEach(
        (classDocument) => {
          const data =
            classDocument.data();

          if (
            !(data.startTime instanceof Timestamp)
          ) {
            return;
          }

          const parts =
            getTaipeiParts(
              data.startTime
            );

          if (
            parts.monthKey !== month
          ) {
            return;
          }

          rows.push({
            日期: parts.dateText,
            星期: parts.weekday,
            時間: parts.time,

            課程: String(
              data.courseName ?? ""
            ),

            上課內容: String(
              data.lessonContent ?? ""
            ),

            預約人數: Number(
              data.bookedCount ?? 0
            ),

            總名額: Number(
              data.capacity ?? 0
            ),
          });
        }
      );

      if (rows.length === 0) {
        setMessage(
          "這個月份目前沒有課程資料。"
        );

        return;
      }

      const worksheet =
        XLSX.utils.json_to_sheet(rows);

      // 欄寬
      worksheet["!cols"] = [
        { wch: 14 },
        { wch: 8 },
        { wch: 8 },
        { wch: 24 },
        { wch: 36 },
        { wch: 10 },
        { wch: 10 },
      ];

      const workbook =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "課程紀錄"
      );

      XLSX.writeFile(
        workbook,
        `Naya_Aerial_課程紀錄_${month}.xlsx`
      );

      setMessage(
        `已匯出 ${rows.length} 堂課程。`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "匯出失敗，請稍後再試。"
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <p className="font-semibold text-slate-800">
        匯出課程紀錄
      </p>

      <p className="mt-1 text-sm text-slate-500">
        選擇月份後匯出 Excel。
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="month"
          value={month}
          onChange={(event) =>
            setMonth(
              event.target.value
            )
          }
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500"
        />

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {isExporting
            ? "匯出中……"
            : "匯出 Excel"}
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm text-slate-600">
          {message}
        </p>
      )}
    </div>
  );
}