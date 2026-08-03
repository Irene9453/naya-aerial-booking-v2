"use client";

import { useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { bookClass } from "@/lib/bookingService";

type BookClassButtonProps = {
  classId: string;
  courseName: string;
  pointsRequired: number;
  isFull: boolean;
};

export default function BookClassButton({
  classId,
  courseName,
  pointsRequired,
  isFull,
}: BookClassButtonProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [currentPoints, setCurrentPoints] = useState(0);
  const [message, setMessage] = useState("");

  async function handleOpenConfirmation() {
    setMessage("");

    const user = auth.currentUser;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setIsChecking(true);

    try {
      const userSnapshot = await getDoc(doc(db, "users", user.uid));

      if (!userSnapshot.exists()) {
        setMessage("找不到會員資料，請聯繫老師。");
        return;
      }

      const points = Number(userSnapshot.data().points ?? 0);

      setCurrentPoints(points);
      setShowConfirmation(true);
    } catch (error) {
      console.error(error);
      setMessage("無法讀取會員點數，請稍後再試。");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleConfirmBooking() {
    const user = auth.currentUser;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setMessage("");
    setIsBooking(true);

    try {
      const result = await bookClass({
        userId: user.uid,
        classId,
      });

      setCurrentPoints(result.remainingPoints);
      setShowConfirmation(false);
      setBookingSuccess(true);
      setMessage(`預約成功！目前剩餘 ${result.remainingPoints} 點。`);
    } catch (error: unknown) {
      console.error(error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "預約失敗，請稍後再試。";

      setMessage(errorMessage);
      setShowConfirmation(false);
    } finally {
      setIsBooking(false);
    }
  }

  const remainingPoints = currentPoints - pointsRequired;
  const hasEnoughPoints = currentPoints >= pointsRequired;

  if (isFull) {
    return (
      <button
        type="button"
        disabled
        className="mt-7 w-full cursor-not-allowed rounded-xl bg-slate-300 px-6 py-3 font-semibold text-white"
      >
        已滿班
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpenConfirmation}
        disabled={isChecking || bookingSuccess}
        className="mt-7 w-full rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {bookingSuccess
          ? "已成功預約"
          : isChecking
            ? "確認會員資料中……"
            : "預約此課程"}
      </button>

      {message && (
        <p
          className={`mt-3 text-center text-sm ${
            bookingSuccess ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}

      {showConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Confirm Booking
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              確認預約
            </h2>

            <div className="mt-6 space-y-3 rounded-2xl bg-sky-50 p-5">
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">課程</span>
                <span className="text-right font-semibold text-slate-900">
                  {courseName}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-600">目前點數</span>
                <span className="font-semibold text-slate-900">
                  {currentPoints} 點
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-600">本次扣除</span>
                <span className="font-semibold text-orange-600">
                  −{pointsRequired} 點
                </span>
              </div>

              <div className="border-t border-sky-100 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">預約後剩餘</span>
                  <span className="font-bold text-sky-700">
                    {hasEnoughPoints ? remainingPoints : currentPoints} 點
                  </span>
                </div>
              </div>
            </div>

            {!hasEnoughPoints && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                點數不足，無法預約此課程。
              </p>
            )}

            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                disabled={isBooking}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
              >
                返回
              </button>

              <button
                type="button"
                disabled={!hasEnoughPoints || isBooking}
                onClick={handleConfirmBooking}
                className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isBooking ? "預約處理中……" : "確認預約"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}