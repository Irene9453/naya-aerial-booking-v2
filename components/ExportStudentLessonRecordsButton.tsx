"use client";

import { useState } from "react";
import {
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";

import { db } from "@/lib/firebase";

type UserInfo = {
  name: string;
  nickname: string;
};

type ExportRow = {
  學生姓名: string;
  暱稱: string;
  上課日期: string;
  課程名稱: string;
  動作編號: string;
  備註: string;
  紀錄來源: string;
};

function formatDate(
  timestamp: Timestamp | null
) {
  if (!timestamp) {
    return "";
  }

  return timestamp
    .toDate()
    .toLocaleDateString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
}

export default function ExportStudentLessonRecordsButton() {
  const [isExporting, setIsExporting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  async function handleExport() {
    setMessage("");
    setIsExporting(true);

    try {
      // =========================
      // 先讀取會員
      // =========================
      const usersSnapshot =
        await getDocs(
          collection(db, "users")
        );

      const userMap =
        new Map<string, UserInfo>();

      usersSnapshot.docs.forEach(
        (userDocument) => {
          const data =
            userDocument.data();

          userMap.set(
            userDocument.id,
            {
              name: String(
                data.name ?? ""
              ),

              nickname: String(
                data.nickname ?? ""
              ),
            }
          );
        }
      );

      // =========================
      // 讀取所有動作紀錄
      // =========================
      const recordsSnapshot =
        await getDocs(
          collection(
            db,
            "studentLessonRecords"
          )
        );

      if (recordsSnapshot.empty) {
        setMessage(
          "目前沒有可匯出的動作紀錄。"
        );

        return;
      }

      const rows: Array<
        ExportRow & {
          sortTime: number;
        }
      > = [];

      recordsSnapshot.docs.forEach(
        (recordDocument) => {
          const data =
            recordDocument.data();

          const studentId =
            String(
              data.studentId ?? ""
            );

          const student =
            userMap.get(studentId);

          const classStartTime =
            data.classStartTime instanceof
            Timestamp
              ? data.classStartTime
              : null;

          const source =
            String(
              data.source ?? ""
            );

          rows.push({
            學生姓名:
              student?.name ||
              "找不到會員",

            暱稱:
              student?.nickname ||
              "",

            上課日期:
              formatDate(
                classStartTime
              ),

            課程名稱:
              String(
                data.courseName ?? ""
              ),

            動作編號:
              String(
                data.lessonContent ??
                  ""
              ),

            備註:
              String(
                data.note ?? ""
              ),

            紀錄來源:
              source === "manual"
                ? "歷史補登"
                : "正常上課",

            sortTime:
              classStartTime?.toMillis() ??
              0,
          });
        }
      );

      // 日期新 → 舊
      rows.sort(
        (first, second) =>
          second.sortTime -
          first.sortTime
      );

      // Excel 不需要 sortTime
      const excelRows: ExportRow[] =
        rows.map(
          ({
            sortTime,
            ...row
          }) => row
        );

      // =========================
      // 建立 Excel
      // =========================
      const worksheet =
        XLSX.utils.json_to_sheet(
          excelRows
        );

      worksheet["!cols"] = [
        { wch: 16 }, // 姓名
        { wch: 14 }, // 暱稱
        { wch: 14 }, // 日期
        { wch: 24 }, // 課程
        { wch: 35 }, // 動作
        { wch: 40 }, // 備註
        { wch: 12 }, // 來源
      ];

      const workbook =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "學生動作紀錄"
      );

      const today =
        new Date()
          .toLocaleDateString(
            "en-CA",
            {
              timeZone:
                "Asia/Taipei",
            }
          )
          .replaceAll("-", "");

      XLSX.writeFile(
        workbook,
        `Naya_Aerial_學生動作紀錄_${today}.xlsx`
      );

      setMessage(
        `已匯出 ${excelRows.length} 筆動作紀錄。`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "匯出動作紀錄失敗。"
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isExporting
          ? "匯出中……"
          : "匯出動作紀錄 Excel"}
      </button>

      {message && (
        <p className="mt-2 text-sm text-slate-500">
          {message}
        </p>
      )}
    </div>
  );
}