"use client";

import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Props = {
  studentId: string;
};

export default function AddStudentLessonRecord({
  studentId,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const [date, setDate] = useState("");
  const [courseName, setCourseName] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [note, setNote] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  function handleOpen() {
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

    if (!courseName.trim()) {
      setMessage("請輸入課程名稱。");
      return;
    }

    if (!lessonContent.trim()) {
      setMessage("請輸入動作編號。");
      return;
    }

    setIsSaving(true);

    try {
      const classDate = new Date(
        `${date}T12:00:00+08:00`
      );

      await addDoc(
        collection(db, "studentLessonRecords"),
        {
          studentId,

          classId: "manual",

          courseName: courseName.trim(),

          classStartTime:
            Timestamp.fromDate(classDate),

          lessonContent:
            lessonContent.trim(),

          note: note.trim(),

          source: "manual",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      setDate("");
      setCourseName("");
      setLessonContent("");
      setNote("");

      setMessage("歷史紀錄已新增。");

      setTimeout(() => {
        setIsOpen(false);
        setMessage("");
      }, 700);
    } catch (error) {
      console.error(error);
      setMessage("新增歷史紀錄失敗。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        ＋ 新增歷史紀錄
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-900/60 px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
                  Lesson History
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  新增歷史上課紀錄
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  補登以前的上課內容。
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
                    setDate(event.target.value)
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
                  value={courseName}
                  onChange={(event) =>
                    setCourseName(event.target.value)
                  }
                  placeholder="例如：空中瑜珈 Lv.1–2"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  動作編號
                </span>

                <input
                  type="text"
                  value={lessonContent}
                  onChange={(event) =>
                    setLessonContent(event.target.value)
                  }
                  placeholder="例如：EP.12、EP.15、EP.21"
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
                    setNote(event.target.value)
                  }
                  rows={3}
                  placeholder="例如：需要複習、第一次完成等"
                  className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500"
                />
              </label>
            </div>

            {message && (
              <p
                className={`mt-5 rounded-xl px-4 py-3 text-sm ${
                  message.includes("已新增")
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {message}
              </p>
            )}

            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSaving}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50"
              >
                取消
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {isSaving
                  ? "儲存中……"
                  : "儲存歷史紀錄"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}