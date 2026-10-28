"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { bookClass } from "@/lib/bookingService";
import {
  cancelWaitlist,
  joinWaitlist,
} from "@/lib/waitlistService";

type BookClassButtonProps = {
  classId: string;
  courseName: string;
  pointsRequired: number;
  isFull: boolean;
  startTime: Timestamp;
  allowMonthlyBooking: boolean;
};

type BookingMode = "single" | "monthly";

type RelatedClass = {
  id: string;
  courseName: string;
  startTime: Timestamp;
  pointsRequired: number;
  capacity: number;
  bookedCount: number;
  allowMonthlyBooking: boolean;
};

function getTaipeiDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    day: Number(getPart("day")),
    weekday: getPart("weekday"),
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
  };
}

function formatClassTime(timestamp: Timestamp) {
  return timestamp.toDate().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function BookClassButton({
  classId,
  courseName,
  pointsRequired,
  isFull,
  startTime,
  allowMonthlyBooking,
}: BookClassButtonProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isBooking, setIsBooking] = useState(false);

  const [bookingSuccess, setBookingSuccess] =
    useState(false);
const [alreadyBooked, setAlreadyBooked] =
  useState(false);
  const [showConfirmation, setShowConfirmation] =
    useState(false);

  const [currentPoints, setCurrentPoints] =
    useState(0);

  const [message, setMessage] = useState("");
const [
  isWaitlisted,
  setIsWaitlisted,
] = useState(false);

const [
  isWaitlistProcessing,
  setIsWaitlistProcessing,
] = useState(false);
  const [bookingMode, setBookingMode] =
    useState<BookingMode>("single");

  const [relatedClasses, setRelatedClasses] =
    useState<RelatedClass[]>([]);

  const [selectedClassIds, setSelectedClassIds] =
    useState<string[]>([]);
useEffect(() => {
  const user = auth.currentUser;

  if (!user) {
    setAlreadyBooked(false);
    return;
  }

  const bookingId =
    `${user.uid}_${classId}`;

  const bookingRef = doc(
    db,
    "bookings",
    bookingId
  );

  const unsubscribe = onSnapshot(
    bookingRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        setAlreadyBooked(false);
        return;
      }

      const data = snapshot.data();

      setAlreadyBooked(
        data.status === "booked"
      );
    },
    (error) => {
      console.error(
        "監聽預約狀態失敗：",
        error
      );
    }
  );

    return unsubscribe;
}, [classId]);

// 監聽目前會員是否已加入這堂課的候補
useEffect(() => {
  const user = auth.currentUser;

  if (!user) {
    setIsWaitlisted(false);
    return;
  }

  const waitlistRef = doc(
    db,
    "waitlists",
    `${user.uid}_${classId}`
  );

  const unsubscribe = onSnapshot(
    waitlistRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        setIsWaitlisted(false);
        return;
      }

      const data = snapshot.data();

      setIsWaitlisted(
        data.status === "waiting"
      );
    },
    (error) => {
      console.error(
        "監聽候補狀態失敗：",
        error
      );
    }
  );

  return unsubscribe;
}, [classId]);
async function handleJoinWaitlist() {
  const user = auth.currentUser;

  if (!user) {
    window.location.href =
      `/login?redirect=${encodeURIComponent(
        "/booking"
      )}`;

    return;
  }

  setMessage("");
  setIsWaitlistProcessing(true);

  try {
    await joinWaitlist({
      userId: user.uid,
      classId,
    });

    setIsWaitlisted(true);

    setMessage(
      "已加入候補！若課程釋出名額，系統會通知你。"
    );
  } catch (error: unknown) {
    console.error(error);

    setMessage(
      error instanceof Error
        ? error.message
        : "加入候補失敗，請稍後再試。"
    );
  } finally {
    setIsWaitlistProcessing(false);
  }
}

async function handleCancelWaitlist() {
  const user = auth.currentUser;

  if (!user) {
    window.location.href =
      "/login";

    return;
  }

  setMessage("");
  setIsWaitlistProcessing(true);

  try {
    await cancelWaitlist({
      userId: user.uid,
      classId,
    });

    setIsWaitlisted(false);

    setMessage(
      "已取消候補。"
    );
  } catch (error: unknown) {
    console.error(error);

    setMessage(
      error instanceof Error
        ? error.message
        : "取消候補失敗，請稍後再試。"
    );
  } finally {
    setIsWaitlistProcessing(false);
  }
}
  async function handleOpenConfirmation() {
    setMessage("");

    const user = auth.currentUser;

    if (!user) {
      window.location.href =
        `/login?redirect=${encodeURIComponent("/booking")}`;
      return;
    }

    setIsChecking(true);

    try {
      // 會員點數
      const userSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      if (!userSnapshot.exists()) {
        setMessage("找不到會員資料，請聯繫老師。");
        return;
      }

      const points = Number(
        userSnapshot.data().points ?? 0
      );

      setCurrentPoints(points);
// 先確認目前這堂是否已經預約
const currentBookingId =
  `${user.uid}_${classId}`;

const currentBookingSnapshot =
  await getDoc(
    doc(
      db,
      "bookings",
      currentBookingId
    )
  );

if (
  currentBookingSnapshot.exists() &&
  currentBookingSnapshot.data().status === "booked"
) {
  setAlreadyBooked(true);
  setMessage("");
  return;
}
      // 目前點擊的課程
      const currentClassSnapshot = await getDoc(
        doc(db, "classes", classId)
      );

      if (!currentClassSnapshot.exists()) {
        setMessage("找不到課程資料。");
        return;
      }

      const currentData =
        currentClassSnapshot.data();

      if (
        !(currentData.startTime instanceof Timestamp)
      ) {
        setMessage("課程時間資料不正確。");
        return;
      }

      const currentParts = getTaipeiDateParts(
        currentData.startTime.toDate()
      );

      /*
       * 先抓同課程。
       * 再於前端判斷：
       * 同月份
       * 同星期
       * 同時間
       */
      const relatedQuery = query(
        collection(db, "classes"),
        where("courseName", "==", courseName),
        where("status", "==", "open")
      );

      const snapshot =
        await getDocs(relatedQuery);

      const now = new Date();

      const matches = snapshot.docs
        .map((classDocument) => {
          const data = classDocument.data();

          if (!(data.startTime instanceof Timestamp)) {
            return null;
          }

          return {
  id: classDocument.id,

  courseName: String(
    data.courseName ?? ""
  ),

  startTime: data.startTime,

  pointsRequired: Number(
    data.pointsRequired ?? 0
  ),

  capacity: Number(
    data.capacity ?? 0
  ),

  bookedCount: Number(
    data.bookedCount ?? 0
  ),

  allowMonthlyBooking: Boolean(
    data.allowMonthlyBooking ?? true
  ),
};
        })
        .filter(
          (
            classItem
          ): classItem is RelatedClass => {
            if (!classItem) {
              return false;
            }

            const parts = getTaipeiDateParts(
              classItem.startTime.toDate()
            );

            const sameMonth =
              parts.year === currentParts.year &&
              parts.month === currentParts.month;

            const sameWeekday =
              parts.weekday ===
              currentParts.weekday;

            const sameTime =
              parts.hour === currentParts.hour &&
              parts.minute === currentParts.minute;

            const notPast =
              classItem.startTime
                .toDate()
                .getTime() >= now.getTime();

           const hasSeat =
  classItem.bookedCount <
  classItem.capacity;

const monthlyAllowed =
  classItem.allowMonthlyBooking;

return (
  sameMonth &&
  sameWeekday &&
  sameTime &&
  notPast &&
  hasSeat &&
  monthlyAllowed
);
          }
        )
        .sort(
          (a, b) =>
            a.startTime.toMillis() -
            b.startTime.toMillis()
        );

      // 檢查哪些課程已經預約
const bookingChecks = await Promise.all(
  matches.map(async (classItem) => {
    const bookingId =
      `${user.uid}_${classItem.id}`;

    const bookingSnapshot = await getDoc(
      doc(db, "bookings", bookingId)
    );

    const alreadyBooked =
      bookingSnapshot.exists() &&
      bookingSnapshot.data().status ===
        "booked";

    return {
      classItem,
      alreadyBooked,
    };
  })
);

// 已預約的課程不再提供批次預約
const availableClasses = bookingChecks
  .filter(
    (item) => !item.alreadyBooked
  )
  .map((item) => item.classItem);

// 目前點擊的這堂仍然保留，
// 讓 bookClass() 處理最終的重複預約防呆
const currentClass =
  matches.find(
    (classItem) =>
      classItem.id === classId
  );

const currentClassStart =
  currentClass?.startTime.toMillis() ?? 0;

const finalClasses = availableClasses
  .filter(
    (classItem) =>
      classItem.startTime.toMillis() >=
      currentClassStart
  )
  .sort(
    (a, b) =>
      a.startTime.toMillis() -
      b.startTime.toMillis()
  );

setRelatedClasses(finalClasses);

// 預設只選目前這一堂
setSelectedClassIds([classId]);
setBookingMode("single");

// 開啟預約確認視窗前，先檢查 Email 驗證
const currentUser = auth.currentUser;

if (!currentUser) {
  setMessage("請先登入會員，才能預約課程。");
  return;
}

try {
  await currentUser.reload();
} catch {
  setMessage("無法確認 Email 驗證狀態，請稍後再試。");
  return;
}

if (!currentUser.emailVerified) {
  setMessage("請先完成 Email 驗證，才能預約課程。");
  return;
}

setShowConfirmation(true);
    } catch (error) {
      console.error(error);

      setMessage(
        "無法讀取預約資料，請稍後再試。"
      );
    } finally {
      setIsChecking(false);
    }
  }

  function changeBookingMode(
    mode: BookingMode
  ) {
    setBookingMode(mode);

    if (mode === "single") {
      setSelectedClassIds([classId]);
      return;
    }

    setSelectedClassIds(
      relatedClasses.map(
        (classItem) => classItem.id
      )
    );
  }

  function toggleClass(classIdToToggle: string) {
    // 原本點進來的那堂固定保留
    if (classIdToToggle === classId) {
      return;
    }

    setSelectedClassIds(
      (currentIds) => {
        if (
          currentIds.includes(
            classIdToToggle
          )
        ) {
          return currentIds.filter(
            (id) =>
              id !== classIdToToggle
          );
        }

        return [
          ...currentIds,
          classIdToToggle,
        ];
      }
    );
  }

  const selectedClasses =
    relatedClasses.filter(
      (classItem) =>
        selectedClassIds.includes(
          classItem.id
        )
    );

  /*
   * 理論上同一固定課程點數相同，
   * 但這裡仍逐堂計算，
   * 以免老師之後修改其中一堂點數。
   */
  const totalPointsRequired =
    bookingMode === "single"
      ? pointsRequired
      : selectedClasses.reduce(
          (total, classItem) =>
            total +
            classItem.pointsRequired,
          0
        );

  const remainingPoints =
    currentPoints -
    totalPointsRequired;

  const hasEnoughPoints =
    currentPoints >=
    totalPointsRequired;

  async function handleConfirmBooking() {
  const user = auth.currentUser;

  if (!user) {
    window.location.href =
      `/login?redirect=${encodeURIComponent("/booking")}`;
    return;
  }

  // 預約前重新取得 Firebase Email 驗證狀態
  try {
    await user.reload();
  } catch {
    setMessage("無法確認 Email 驗證狀態，請稍後再試。");
    setShowConfirmation(false);
    return;
  }

  if (!user.emailVerified) {
    setMessage("請先完成 Email 驗證，才能預約課程。");
    setShowConfirmation(false);
    return;
  }

  const idsToBook =
      bookingMode === "single"
        ? [classId]
        : selectedClassIds;

    if (idsToBook.length === 0) {
      setMessage("請至少選擇一堂課。");
      return;
    }

    setMessage("");
    setIsBooking(true);

    let successCount = 0;
    const failedMessages: string[] = [];
    let latestPoints = currentPoints;

    try {
      /*
       * 一堂一堂使用你原本的 bookClass。
       *
       * 因此原本 bookClass 裡面的：
       * - 點數檢查
       * - 重複預約
       * - 滿班檢查
       * - bookedCount
       * - transaction
       *
       * 都可以繼續沿用。
       */
      for (const targetClassId of idsToBook) {
        try {
          const result = await bookClass({
            userId: user.uid,
            classId: targetClassId,
          });

          latestPoints =
            result.remainingPoints;

          successCount += 1;
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "預約失敗";

          failedMessages.push(
            errorMessage
          );
        }
      }

      setCurrentPoints(latestPoints);

if (successCount > 0) {
  setShowConfirmation(false);
}

      if (
        successCount > 0 &&
        failedMessages.length === 0
      ) {
        setBookingSuccess(true);

        setMessage(
          successCount === 1
            ? `預約成功！目前剩餘 ${latestPoints} 點。`
            : `成功預約 ${successCount} 堂課！目前剩餘 ${latestPoints} 點。`
        );
      } else if (
        successCount > 0
      ) {
        setBookingSuccess(true);

        setMessage(
          `成功預約 ${successCount} 堂，另有 ${failedMessages.length} 堂未成功。目前剩餘 ${latestPoints} 點。`
        );
      } else {
        setMessage(
          failedMessages[0] ??
            "預約失敗，請稍後再試。"
        );
      }
    } finally {
      setIsBooking(false);
    }
  }
const isPast =
  startTime.toDate().getTime() <= Date.now();

if (isPast) {
  return (
    <button
      type="button"
      disabled
      className="mt-7 w-full cursor-not-allowed rounded-xl bg-slate-200 px-6 py-3 font-semibold text-slate-500"
    >
      課程已結束
    </button>
  );
}
  if (isFull) {
  if (alreadyBooked) {
    return (
      <button
        type="button"
        disabled
        className="mt-7 w-full cursor-not-allowed rounded-xl bg-emerald-100 px-6 py-3 font-semibold text-emerald-700"
      >
        ✓ 已預約此課程
      </button>
    );
  }

  if (isWaitlisted) {
    return (
      <div className="mt-7">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
          <p className="font-semibold text-amber-800">
            ✓ 已加入候補
          </p>

          <p className="mt-1 text-sm leading-6 text-amber-700">
            若有會員取消並釋出名額，
            系統會通知所有候補會員。
          </p>

          <p className="mt-1 text-xs text-amber-600">
            名額以實際完成預約者為準。
          </p>
        </div>

        <button
          type="button"
          onClick={
            handleCancelWaitlist
          }
          disabled={
            isWaitlistProcessing
          }
          className="mt-3 w-full rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isWaitlistProcessing
            ? "處理中……"
            : "取消候補"}
        </button>

        {message && (
          <p className="mt-3 text-center text-sm text-slate-600">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-7">
      <div className="rounded-2xl bg-slate-50 px-5 py-4 text-center">
        <p className="font-semibold text-slate-700">
          此課程目前已滿班
        </p>

        <p className="mt-1 text-sm text-slate-500">
          可以先加入候補，
          有名額釋出時系統會通知你。
        </p>
      </div>

      <button
        type="button"
        onClick={
          handleJoinWaitlist
        }
        disabled={
          isWaitlistProcessing
        }
        className="mt-3 w-full rounded-xl bg-amber-500 px-6 py-3 font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isWaitlistProcessing
          ? "加入候補中……"
          : "加入候補"}
      </button>

      {message && (
        <p className="mt-3 text-center text-sm text-slate-600">
          {message}
        </p>
      )}
    </div>
  );
}

if (alreadyBooked) {
  return (
    <button
      type="button"
      disabled
      className="mt-7 w-full cursor-not-allowed rounded-xl bg-emerald-100 px-6 py-3 font-semibold text-emerald-700"
    >
      ✓ 已預約此課程
    </button>
  );
}
  return (
    <>
      <button
        type="button"
        onClick={handleOpenConfirmation}
        disabled={
          isChecking ||
          bookingSuccess
        }
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
            bookingSuccess
              ? "text-emerald-600"
              : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}

      {showConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-5 py-8">
          <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Confirm Booking
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              確認預約
            </h2>

            <p className="mt-2 text-slate-600">
              {courseName}
            </p>

            {/* 預約方式 */}
            {relatedClasses.length > 1 && (
              <div className="mt-6">
                <p className="mb-3 font-semibold text-slate-800">
                  預約方式
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      changeBookingMode(
                        "single"
                      )
                    }
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                      bookingMode ===
                      "single"
                        ? "border-sky-600 bg-sky-50 text-sky-700"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    只預約這堂
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      changeBookingMode(
                        "monthly"
                      )
                    }
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                      bookingMode ===
                      "monthly"
                        ? "border-sky-600 bg-sky-50 text-sky-700"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    本月同時段
                  </button>
                </div>
              </div>
            )}

            {/* 整月課程選擇 */}
            {bookingMode === "monthly" &&
              relatedClasses.length > 0 && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800">
                    選擇要預約的課程
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    可取消不想預約的日期。
                  </p>

                  <div className="mt-3 space-y-2">
                    {relatedClasses.map(
                      (classItem) => (
                        <label
                          key={
                            classItem.id
                          }
                          className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-white px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedClassIds.includes(
                                classItem.id
                              )}
                              onChange={() =>
                                toggleClass(
                                  classItem.id
                                )
                              }
                            />

                            <span className="text-sm font-medium text-slate-700">
                              {formatClassTime(
                                classItem.startTime
                              )}
                            </span>
                          </div>

                          <span className="text-xs font-semibold text-sky-700">
                            {
                              classItem.pointsRequired
                            }{" "}
                            點
                          </span>
                        </label>
                      )
                    )}
                  </div>
                </div>
              )}

            {/* 點數摘要 */}
            <div className="mt-6 space-y-3 rounded-2xl bg-sky-50 p-5">
              <div className="flex justify-between">
                <span className="text-slate-600">
                  預約堂數
                </span>

                <span className="font-semibold text-slate-900">
                  {bookingMode ===
                  "single"
                    ? 1
                    : selectedClassIds.length}{" "}
                  堂
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-600">
                  目前點數
                </span>

                <span className="font-semibold text-slate-900">
                  {currentPoints} 點
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-600">
                  本次扣除
                </span>

                <span className="font-semibold text-orange-600">
                  −{totalPointsRequired} 點
                </span>
              </div>

              <div className="border-t border-sky-100 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    預約後剩餘
                  </span>

                  <span className="font-bold text-sky-700">
                    {hasEnoughPoints
                      ? remainingPoints
                      : currentPoints}{" "}
                    點
                  </span>
                </div>
              </div>
            </div>

            {!hasEnoughPoints && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                點數不足，目前選擇的課程共需要{" "}
                {totalPointsRequired} 點。
              </p>
            )}

            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setShowConfirmation(
                    false
                  )
                }
                disabled={isBooking}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
              >
                返回
              </button>

              <button
                type="button"
                disabled={
                  !hasEnoughPoints ||
                  isBooking ||
                  selectedClassIds.length ===
                    0
                }
                onClick={
                  handleConfirmBooking
                }
                className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isBooking
                  ? "預約處理中……"
                  : bookingMode ===
                      "monthly"
                    ? `確認預約 ${selectedClassIds.length} 堂`
                    : "確認預約"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}