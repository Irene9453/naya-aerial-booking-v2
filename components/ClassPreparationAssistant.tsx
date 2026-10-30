"use client";

import { useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Props = {
  classId: string;
  courseName: string;
};

type StudentInfo = {
  id: string;
  name: string;
};

type MovementResult = {
  code: string;
  count: number;
  students: string[];
  notCompletedStudents: string[];
};

function splitMovements(content: string) {
  return content
    .split(/[\s,，、;；]+/)
    .map((item) =>
      item.trim().toUpperCase()
    )
    .filter(Boolean);
}

export default function ClassPreparationAssistant({
  classId,
  courseName,
}: Props) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(false);

  const [studentCount, setStudentCount] =
    useState(0);

  const [results, setResults] =
    useState<MovementResult[]>([]);

  const [message, setMessage] =
    useState("");

  async function handleOpen() {
    setIsOpen(true);
    setIsLoading(true);
    setMessage("");
    setResults([]);

    try {
      // =========================
      // 1. 找本堂預約
      // =========================
      const bookingQuery = query(
        collection(db, "bookings"),
        where("classId", "==", classId)
      );

      const bookingSnapshot =
        await getDocs(bookingQuery);

      const studentIds = Array.from(
        new Set(
          bookingSnapshot.docs
            .map((bookingDocument) => {
              const data =
                bookingDocument.data();

              const status = String(
                data.status ?? ""
              );

              if (
                status === "cancelled" ||
                status === "special_leave"
              ) {
                return "";
              }

              return String(
                data.userId ?? ""
              );
            })
            .filter(Boolean)
        )
      );

      setStudentCount(
        studentIds.length
      );

      if (studentIds.length === 0) {
        setMessage(
          "目前這堂課還沒有學生預約。"
        );

        setIsLoading(false);
        return;
      }

      // =========================
      // 2. 取得學生姓名
      // =========================
      const students: StudentInfo[] =
        [];

      for (const studentId of studentIds) {
        const studentQuery = query(
          collection(db, "users"),
          where(
            "__name__",
            "==",
            studentId
          )
        );

        const studentSnapshot =
          await getDocs(studentQuery);

        const studentDocument =
          studentSnapshot.docs[0];

        students.push({
          id: studentId,

          name: studentDocument
            ? String(
                studentDocument.data()
                  .name ?? "未命名"
              )
            : "未命名",
        });
      }

      // =========================
      // 3. 建立每位學生上過的動作 Set
      // =========================
      const studentMovementMap =
        new Map<
          string,
          Set<string>
        >();

      students.forEach((student) => {
        studentMovementMap.set(
          student.id,
          new Set()
        );
      });

      for (const student of students) {
        const recordsQuery = query(
          collection(
            db,
            "studentLessonRecords"
          ),
          where(
            "studentId",
            "==",
            student.id
          )
        );

        const recordsSnapshot =
          await getDocs(
            recordsQuery
          );

        const movementSet =
          studentMovementMap.get(
            student.id
          )!;

        recordsSnapshot.docs.forEach(
          (recordDocument) => {
            const data =
              recordDocument.data();

            const lessonContent =
              String(
                data.lessonContent ??
                  ""
              );

            splitMovements(
              lessonContent
            ).forEach((movement) => {
              movementSet.add(
                movement
              );
            });
          }
        );
      }

      // =========================
      // 4. 讀取動作資料庫
      // =========================
      const movementsSnapshot =
        await getDocs(
          collection(db, "movements")
        );

      const movementCodes =
        movementsSnapshot.docs
          .map((movementDocument) =>
            String(
              movementDocument.data()
                .code ?? ""
            )
              .trim()
              .toUpperCase()
          )
          .filter(Boolean);

      // 如果動作資料庫還是空的，
      // 就至少使用學生歷史紀錄中的動作
      const allMovementCodes =
        new Set<string>(
          movementCodes
        );

      studentMovementMap.forEach(
        (movementSet) => {
          movementSet.forEach(
            (movement) => {
              allMovementCodes.add(
                movement
              );
            }
          );
        }
      );

      // =========================
      // 5. 統計每個動作
      // =========================
      const nextResults =
  Array.from(
    allMovementCodes
  ).map((code) => {
    const completedStudents =
      students.filter(
        (student) =>
          studentMovementMap
            .get(student.id)
            ?.has(code)
      );

    const notCompletedStudents =
      students.filter(
        (student) =>
          !studentMovementMap
            .get(student.id)
            ?.has(code)
      );

    return {
      code,

      count:
        completedStudents.length,

      students:
        completedStudents.map(
          (student) =>
            student.name
        ),

      notCompletedStudents:
        notCompletedStudents.map(
          (student) =>
            student.name
        ),
    };
  });

      // 上過的人越少排越前面
      nextResults.sort(
        (first, second) => {
          if (
            first.count !==
            second.count
          ) {
            return (
              first.count -
              second.count
            );
          }

          return first.code.localeCompare(
            second.code,
            undefined,
            {
              numeric: true,
            }
          );
        }
      );

      setResults(nextResults);
    } catch (error) {
      console.error(error);

      setMessage(
        "備課資料讀取失敗。"
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
      >
        ✨ 備課助手
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center overflow-y-auto bg-slate-900/60 px-4 py-8">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
                  Class Preparation
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  ✨ 備課助手
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  {courseName}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setIsOpen(false)
                }
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                關閉
              </button>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-slate-500">
                正在分析學生上課紀錄……
              </div>
            ) : (
              <>
                <div className="mt-7 rounded-2xl bg-violet-50 p-5">
                  <p className="text-sm text-violet-700">
                    本堂目前預約
                  </p>

                  <p className="mt-1 text-2xl font-bold text-violet-900">
                    {studentCount} 人
                  </p>
                </div>

                {message && (
                  <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {message}
                  </p>
                )}

                {results.length > 0 && (
                  <div className="mt-6 space-y-3">
                    {results.map(
                      (result) => {
                        const ratio =
                          studentCount > 0
                            ? result.count /
                              studentCount
                            : 0;

                        return (
                          <details
                            key={
                              result.code
                            }
                            className="rounded-2xl border border-slate-200 bg-white"
                          >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-violet-700">
                                  {
                                    result.code
                                  }
                                </span>

                                {ratio === 0 && (
  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
    ✨ 優先推薦
  </span>
)}

{ratio > 0 &&
  ratio <= 0.3 && (
    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
      推薦
    </span>
  )}

{ratio > 0.3 &&
  ratio <= 0.7 && (
    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
      部分上過
    </span>
  )}

{ratio > 0.7 &&
  ratio < 1 && (
    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
      多數上過
    </span>
  )}

{ratio === 1 && (
  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">
    ⚠️ 全員上過
  </span>
)}
                              </div>

                              <span className="font-semibold text-slate-600">
                                {
                                  result.count
                                }{" "}
                                /{" "}
                                {
                                  studentCount
                                }{" "}
                                人上過
                              </span>
                            </summary>

                            <div className="border-t border-slate-100 px-4 py-4">
  {/* 尚未上過 */}
  {result.notCompletedStudents.length >
    0 && (
    <div>
      <p className="text-xs font-semibold text-emerald-600">
        ○ 尚未上過
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {result.notCompletedStudents.map(
          (studentName) => (
            <span
              key={`${result.code}-not-${studentName}`}
              className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700"
            >
              ○ {studentName}
            </span>
          )
        )}
      </div>
    </div>
  )}

  {/* 已上過 */}
  {result.students.length === 0 && (
  <p className="mt-4 text-sm font-semibold text-emerald-700">
    ✨ 本堂所有學生都還沒上過這個動作
  </p>
)}
</div>
</details>
);
}
)}
</div>
)}
</>
)}
</div>
</div>
)}
</>
);
}