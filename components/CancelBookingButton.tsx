"use client";

import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { cancelBooking } from "@/lib/cancelBookingService";
import { useSpecialLeave } from "@/lib/specialLeaveService";

type CancelBookingButtonProps = {
  bookingId: string;
  classId: string;
  classStartTime: Timestamp;
};

function getCancellationDeadline(classStartTime: Timestamp) {
  const classDate = classStartTime.toDate();

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(classDate);

  const year = dateParts.find((part) => part.type === "year")?.value;
  const month = dateParts.find((part) => part.type === "month")?.value;
  const day = dateParts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return null;
  }

  const classDayStart = new Date(
    `${year}-${month}-${day}T00:00:00+08:00`
  );

  return new Date(classDayStart.getTime() - 1);
}

function formatDeadline(deadline: Date | null) {
  if (!deadline) {
    return "無法計算";
  }

  return deadline.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function CancelBookingButton({
  bookingId,
  classId,
  classStartTime,
}: CancelBookingButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const [showCancelConfirmation, setShowCancelConfirmation] =
    useState(false);

  const [showLeaveConfirmation, setShowLeaveConfirmation] =
    useState(false);

  const [message, setMessage] = useState("");

  const cancellationDeadline =
    getCancellationDeadline(classStartTime);

  const canCancel =
    cancellationDeadline !== null &&
    new Date() <= cancellationDeadline;

  async function handleConfirmCancel() {
    const user = auth.currentUser;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setMessage("");
    setIsProcessing(true);

    try {
      const result = await cancelBooking({
        userId: user.uid,
        bookingId,
        classId,
      });

      setShowCancelConfirmation(false);

      setMessage(
        `取消成功，已退回 ${result.refundedPoints} 點。目前剩餘 ${result.newPointBalance} 點。`
      );
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "取消失敗，請稍後再試。"
      );

      setShowCancelConfirmation(false);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleConfirmSpecialLeave() {
    const user = auth.currentUser;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setMessage("");
    setIsProcessing(true);

    try {
      const result = await useSpecialLeave({
        userId: user.uid,
        bookingId,
        classId,
      });

      setShowLeaveConfirmation(false);

      const halfLabel =
        result.periodHalf === 1
          ? "上半年"
          : "下半年";

      setMessage(
        `特殊請假成功，已退回 ${result.refundedPoints} 點。你已使用 ${result.periodYear} 年${halfLabel}的特殊請假額度。`
      );
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "特殊請假失敗，請稍後再試。"
      );

      setShowLeaveConfirmation(false);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <>
      <div className="mt-5">
        {canCancel ? (
          <>
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setShowCancelConfirmation(true);
              }}
              className="rounded-xl border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              取消預約
            </button>

            <p className="mt-2 text-xs text-slate-500">
              可取消至：{formatDeadline(cancellationDeadline)}
            </p>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-800">
                已超過一般取消期限
              </p>

              <p className="mt-1 text-sm leading-6 text-amber-700">
                若為突發身體不適，可使用本期特殊請假額度。
              </p>

              <p className="mt-2 text-xs text-amber-600">
                一般取消期限：
                {formatDeadline(cancellationDeadline)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setMessage("");
                setShowLeaveConfirmation(true);
              }}
              className="mt-3 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              使用特殊請假
            </button>
          </>
        )}

        {message && (
          <p
            className={`mt-3 rounded-xl px-4 py-3 text-sm ${
              message.includes("成功")
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {message}
          </p>
        )}
      </div>

      {showCancelConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-500">
              Cancel Booking
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              確定取消預約？
            </h2>

            <p className="mt-4 leading-7 text-slate-600">
              取消後系統會自動退回本堂課使用的點數，
              並釋出課程名額。
            </p>

            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              最晚取消時間：
              {formatDeadline(cancellationDeadline)}
            </p>

            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setShowCancelConfirmation(false)
                }
                disabled={isProcessing}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
              >
                返回
              </button>

              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isProcessing}
                className="flex-1 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessing
                  ? "取消處理中……"
                  : "確認取消"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeaveConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Special Leave
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              使用特殊請假？
            </h2>

            <div className="mt-5 rounded-2xl bg-sky-50 p-5 text-sm leading-7 text-slate-700">
              <p>
                每位學生每半年可使用一次特殊請假。
              </p>

              <p className="mt-2">
                若本堂課目前預約人數為 3 人以下，
                系統將無法接受特殊請假。
              </p>

              <p className="mt-2">
                成功使用後，本堂課點數會自動退回，
                並扣除本期一次特殊請假額度。
              </p>
            </div>

            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setShowLeaveConfirmation(false)
                }
                disabled={isProcessing}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
              >
                返回
              </button>

              <button
                type="button"
                onClick={handleConfirmSpecialLeave}
                disabled={isProcessing}
                className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessing
                  ? "處理中……"
                  : "確認使用"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}