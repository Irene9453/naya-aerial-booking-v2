"use client";

import { useState } from "react";
import {
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Props = {
  recordId: string;
  courseName: string;
  lessonContent: string;
  classStartTime: Timestamp | null;
  source?: string;
};

function getDateValue(
  timestamp: Timestamp | null
) {
  if (!timestamp) {
    return "";
  }

  return timestamp
    .toDate()
    .toLocaleDateString("en-CA", {
      timeZone: "Asia/Taipei",
    });
}

export default function EditStudentLessonRecord({
  recordId,
  courseName,
  lessonContent,
  classStartTime,
  source = "",
}: Props) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [date, setDate] =
    useState("");

  const [
    nextCourseName,
    setNextCourseName,
  ] = useState("");

  const [
    nextLessonContent,
    setNextLessonContent,
  ] = useState("");

  const [note, setNote] =
    useState("");

  const [isSaving, setIsSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  function handleOpen() {
    setDate(
      getDateValue(classStartTime)
    );

    setNextCourseName(courseName);

    setNextLessonContent(
      lessonContent
    );

    setNote("");
    setMessage("");
    setIsOpen(true);
  }

  function handleClose() {
    if (isSaving) {
      return;
    }

    setIsOpen(false);
    setMessage("");
  }

  async function handleSave() {
    setMessage("");

    if (!date) {
      setMessage("請選擇上課日期。");
      return;
    }

    if (!nextCourseName.trim()) {
      setMessage("請輸入課程名稱。");
      return;
    }

    if (!nextLessonContent.trim()) {
      setMessage("請輸入動作編號。");
      return;
    }

    setIsSaving(true);

    try {
      const classDate = new Date(
        `${date}T12:00:00+08:00`
      );

      await updateDoc(
        doc(
          db,
          "studentLessonRecords",
          recordId
        ),
        {
          courseName:
            nextCourseName.trim(),

          lessonContent:
            nextLessonContent.trim(),

          note: note.trim(),

          classStartTime:
            Timestamp.fromDate(
              classDate
            ),

          updatedAt:
            serverTimestamp(),
        }
      );

      setIsOpen(false);
    } catch (error) {
      console.error(error);

      setMessage(
        "更新動作紀錄失敗。"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed =
      window.confirm(
        "確定要刪除這筆歷史紀錄嗎？刪除後無法復原。"
      );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await deleteDoc(
        doc(
          db,
          "studentLessonRecords",
          recordId
        )
      );

      setIsOpen(false);
    } catch (error) {
      console.error(error);

      setMessage(
        "刪除動作紀錄失敗。"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-50"
      >
        編輯
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto bg-slate-900/60 px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
                  Edit Lesson
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  編輯動作紀錄
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  修改這位學生的上課內容。
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={isSaving}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                關閉
              </button>
            </div>

            <div className="mt-7 space-y-5">

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  上課日期
                </span>

                <input
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  課程名稱
                </span>

                <input
                  type="text"
                  value={nextCourseName}
                  onChange={(event) =>
                    setNextCourseName(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  動作編號
                </span>

                <input
                  type="text"
                  value={nextLessonContent}
                  onChange={(event) =>
                    setNextLessonContent(
                      event.target.value
                    )
                  }
                  placeholder="例如：A013、A027、A041"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  備註
                  <span className="ml-1 font-normal text-slate-400">
                    選填
                  </span>
                </span>

                <textarea
                  value={note}
                  onChange={(event) =>
                    setNote(
                      event.target.value
                    )
                  }
                  rows={3}
                  placeholder="例如：需要複習、第一次完成等"
                  className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500"
                />
              </label>
            </div>

            {message && (
              <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {message}
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">

              {source === "manual" && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="rounded-xl border border-red-200 px-5 py-3 font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  刪除紀錄
                </button>
              )}

              <div className="flex-1" />

              <button
                type="button"
                onClick={handleClose}
                disabled={isSaving}
                className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50"
              >
                取消
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {isSaving
                  ? "儲存中……"
                  : "儲存修改"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}