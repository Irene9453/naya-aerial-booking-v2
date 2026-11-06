"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type ClassLessonContentProps = {
  classId: string;
};

export default function ClassLessonContent({
  classId,
}: ClassLessonContentProps) {
  const [content, setContent] =
    useState("");

  const [savedContent, setSavedContent] =
    useState("");

  const [isSaving, setIsSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const classRef = doc(
      db,
      "classes",
      classId
    );

    const unsubscribe = onSnapshot(
      classRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const lessonContent = String(
          snapshot.data().lessonContent ?? ""
        );

        setContent(lessonContent);
        setSavedContent(lessonContent);
      }
    );

    return unsubscribe;
  }, [classId]);

  async function handleSave() {
    setMessage("");
    setIsSaving(true);

    try {
      const classRef = doc(
        db,
        "classes",
        classId
      );

      const trimmedContent =
        content.trim();

      await updateDoc(classRef, {
  lessonContent: trimmedContent,
  lessonContentUpdatedAt:
    serverTimestamp(),
});

// 同步更新已建立的學生動作紀錄
const lessonRecordsQuery = query(
  collection(
    db,
    "studentLessonRecords"
  ),
  where(
    "classId",
    "==",
    classId
  )
);

const lessonRecordsSnapshot =
  await getDocs(
    lessonRecordsQuery
  );

if (!lessonRecordsSnapshot.empty) {
  const batch =
    writeBatch(db);

  lessonRecordsSnapshot.docs.forEach(
    (recordDocument) => {
      batch.update(
        recordDocument.ref,
        {
          lessonContent:
            trimmedContent,

          updatedAt:
            serverTimestamp(),
        }
      );
    }
  );

  await batch.commit();
}

setSavedContent(
  trimmedContent
);

setMessage(
  lessonRecordsSnapshot.empty
    ? "上課內容已儲存"
    : `上課內容已儲存，並同步更新 ${lessonRecordsSnapshot.size} 位學生的動作紀錄`
);
    } catch (error) {
      console.error(error);

      setMessage(
        "儲存失敗，請稍後再試。"
      );
    } finally {
      setIsSaving(false);
    }
  }

  const hasChanges =
    content.trim() !==
    savedContent.trim();

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <button type="button" aria-expanded={isExpanded} onClick={() => setIsExpanded((open) => !open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-100">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800">本堂上課內容</span>
          {!isExpanded && savedContent && <span className="mt-1 block truncate text-xs text-slate-500">{savedContent}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-sky-700">
          {savedContent && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">已記錄</span>}
          {isExpanded ? "收合 ▲" : "展開 ▼"}
        </span>
      </button>
      {isExpanded && <div className="border-t border-slate-200 px-4 pb-4 pt-3">
        <p className="text-xs text-slate-500">輸入動作編號，例如 A013、A027、A041</p>

      <textarea
        value={content}
        onChange={(event) => {
          setContent(
            event.target.value
          );

          setMessage("");
        }}
        rows={2}
        placeholder="例如：A013、A027、A041"
        className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {message}
        </p>

        <button
          type="button"
          onClick={handleSave}
          disabled={
            isSaving ||
            !hasChanges
          }
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSaving
            ? "儲存中……"
            : "儲存內容"}
        </button>
      </div>
      </div>}
    </div>
  );
}