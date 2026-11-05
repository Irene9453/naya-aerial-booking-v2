"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type Props = {
  classId: string;
  courseName: string;
  startTimeMillis: number | null;
  status: string;
};

export default function AdminCancelWholeClass({
  classId,
  courseName,
  startTimeMillis,
  status,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [message, setMessage] = useState("");

  const hasValidStartTime =
    typeof startTimeMillis === "number" &&
    Number.isFinite(startTimeMillis) &&
    startTimeMillis > 0;

  function handleCancel() {
    setMessage("");

    if (!hasValidStartTime || startTimeMillis <= Date.now()) {
      setMessage("課程已開始或時間未設定，不能整堂取消。");
      return;
    }

    if (status !== "open") {
      setMessage("只有開放中的課程可以整堂取消。");
      return;
    }

    setShowCancelConfirm(true);
  }

  async function executeCancel() {
    if (busy) return;
    setShowCancelConfirm(false);
    if (!hasValidStartTime || startTimeMillis === null || startTimeMillis <= Date.now() || status !== "open") {
      setMessage("課程已開始或不再開放，已停止取消。");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setMessage("登入已失效，請重新登入。");
      return;
    }

    setBusy(true);

    try {
      const token = await user.getIdToken();

      const response = await fetch("/api/admin/classes/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ classId }),
      });

      const data = await response.json();

      if (!response.ok || data.success !== true) {
        throw new Error(data.error || "整堂取消失敗。");
      }

      setMessage(
        `取消完成：${data.cancelledBookings} 筆有效預約，` +
        `共退還 ${data.refundedPoints} 點。`
      );

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "整堂取消失敗。"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleCancel}
        disabled={busy || !hasValidStartTime || status !== "open"}
        className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        title={
          !hasValidStartTime
            ? "僅能取消尚未開始的課程"
            : "整堂取消並退還所有有效預約點數"
        }
      >
        {busy ? "取消處理中……" : "整堂取消"}
      </button>

      {showCancelConfirm && (
        <div role="presentation" className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="whole-cancel-title" aria-describedby="whole-cancel-description" className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
            <h2 id="whole-cancel-title" className="text-xl font-bold text-red-700">確認整堂取消課程</h2>
            <p className="mt-3 font-semibold">{courseName}</p>
            <p className="mt-1 text-sm text-slate-600">
              {hasValidStartTime && startTimeMillis !== null
                ? new Date(startTimeMillis).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
                : "課程時間未設定"}
            </p>
            <p id="whole-cancel-description" className="mt-4 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-900">
              這是整堂取消，不是取消單一學生。確認後會取消所有有效預約，並依原規則退還點數。此操作無法直接復原。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={busy} onClick={() => setShowCancelConfirm(false)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">返回</button>
              <button type="button" disabled={busy} onClick={() => void executeCancel()} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "處理中……" : "確認整堂取消"}</button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className="max-w-sm text-sm text-slate-600">
          {message}
        </p>
      )}
    </div>
  );
}
