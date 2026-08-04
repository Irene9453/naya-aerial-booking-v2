"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { adjustStudentPoints } from "@/lib/adminPointService";

type AdminPointButtonProps = {
  studentId: string;
  studentName: string;
};

export default function AdminPointButton({
  studentId,
  studentName,
}: AdminPointButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const admin = auth.currentUser;

    if (!admin) {
      window.location.href = "/login";
      return;
    }

    const parsedAmount = Number(amount);

    if (!Number.isInteger(parsedAmount) || parsedAmount === 0) {
      setMessage("請輸入非零整數，例如 30 或 -3。");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const result = await adjustStudentPoints({
        adminId: admin.uid,
        studentId,
        amount: parsedAmount,
        note: note.trim() || "管理員調整",
      });

      setMessage(`調整成功，目前餘額 ${result.newBalance} 點。`);
      setAmount("");
      setNote("");
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "點數調整失敗。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setShowDialog(true);
        }}
        className="rounded-lg border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
      >
        調整點數
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Point Adjustment
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              調整 {studentName} 的點數
            </h2>

            <div className="mt-6">
              <label className="mb-2 block font-semibold text-slate-800">
                異動點數
              </label>

              <input
                type="number"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="加點輸入 30，扣點輸入 -3"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
              />
            </div>

            <div className="mt-5">
              <label className="mb-2 block font-semibold text-slate-800">
                備註
              </label>

              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：購買 30 點課卡"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
              />
            </div>

            {message && (
              <p className="mt-4 text-sm text-slate-600">
                {message}
              </p>
            )}

            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700"
              >
                關閉
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
              >
                {isSubmitting ? "處理中……" : "確認調整"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}