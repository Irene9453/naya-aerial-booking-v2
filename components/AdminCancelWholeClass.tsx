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
  const [message, setMessage] = useState("");

  const hasValidStartTime =
    typeof startTimeMillis === "number" &&
    Number.isFinite(startTimeMillis) &&
    startTimeMillis > 0;

  async function handleCancel() {
    setMessage("");

    if (!hasValidStartTime || startTimeMillis <= Date.now()) {
      setMessage("課程已開始或時間未設定，不能整堂取消。");
      return;
    }

    if (status !== "open") {
      setMessage("只有開放中的課程可以整堂取消。");
      return;
    }

    const confirmed = window.confirm(
      `確定整堂取消「${courseName}」嗎？\n\n` +
      "系統會取消所有有效預約並退還已扣點數，此操作無法直接復原。"
    );

    if (!confirmed) return;

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
        {busy ? "取消處理中……" : "整堂取消（選擇 A）"}
      </button>

      {message && (
        <p role="status" className="max-w-sm text-sm text-slate-600">
          {message}
        </p>
      )}
    </div>
  );
}
