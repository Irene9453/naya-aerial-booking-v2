"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { StudentData } from "@/components/StudentManager";
import AddStudentLessonRecord from "@/components/AddStudentLessonRecord";
import EditStudentLessonRecord from "@/components/EditStudentLessonRecord";

type StudentDetailModalProps = {
  student: StudentData;
  onClose: () => void;
};

type BookingRecord = {
  id: string;
  courseName: string;
  classStartTime: Timestamp | null;
  pointsUsed: number;
  pointsRefunded: number;
  status: string;
  createdAt: Timestamp | null;
};
type LessonRecord = {
  id: string;
  studentId: string;
  classId: string;
  courseName: string;
  classStartTime: Timestamp | null;
  lessonContent: string;
  source: string;
  createdAt: Timestamp | null;
};

type PackageSaleRecord = {
  id: string;
  packageName: string;
  points: number;
  originalPrice: number;
  discountAmount: number;
  price: number;
  paymentMethod: string;
  status: string;
  createdAt: Timestamp | null;
};

type PointTransactionRecord = {
  id: string;
  courseName: string;
  type: string;
  amount: number;
  balanceAfter: number;
  createdAt: Timestamp | null;
};

type RewardTransactionRecord = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  couponName: string;
  createdAt: Timestamp | null;
};

type TabType =
  | "bookings"
  | "lessons"
  | "packages"
  | "points"
  | "rewards";

function timestampToMillis(timestamp: Timestamp | null) {
  return timestamp?.toMillis() ?? 0;
}

function formatDateTime(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "時間未設定";
  }

  return timestamp.toDate().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCurrency(amount: number) {
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

function getBookingStatusLabel(status: string) {
  switch (status) {
    case "booked":
      return "已預約";

    case "cancelled":
      return "已取消";

    case "special_leave":
      return "特殊請假";

    case "completed":
      return "已完成";

    default:
      return status || "未設定";
  }
}

function getPaymentMethodLabel(method: string) {
  switch (method) {
    case "transfer":
      return "銀行轉帳";

    case "linepay_money":
      return "LINE Pay Money";

    case "cash":
      return "現場付款";

    default:
      return method || "未設定";
  }
}

function getPointTypeLabel(type: string) {
  switch (type) {
    case "booking":
      return "預約課程";

    case "cancel":
    case "cancellation_refund":
      return "取消退點";

    case "special_leave_refund":
      return "特殊請假退點";

    case "package_purchase":
      return "購買課卡";

    case "admin_adjustment":
      return "老師調整";

    default:
      return type || "點數異動";
  }
}

function getRewardTypeLabel(type: string) {
  switch (type) {
    case "attendance":
      return "出席紅利";

    case "attendance_reversal":
      return "紅利扣回";

    case "coupon_redemption":
      return "兌換優惠券";

    default:
      return type || "紅利異動";
  }
}

export default function StudentDetailModal({
  student,
  onClose,
}: StudentDetailModalProps) {
  const [activeTab, setActiveTab] =
    useState<TabType>("bookings");

  const [bookings, setBookings] = useState<
    BookingRecord[]
  >([]);

  const [lessonRecords, setLessonRecords] =
  useState<LessonRecord[]>([]);

  const [packageSales, setPackageSales] = useState<
    PackageSaleRecord[]
  >([]);

  const [
    pointTransactions,
    setPointTransactions,
  ] = useState<PointTransactionRecord[]>([]);

  const [
    rewardTransactions,
    setRewardTransactions,
  ] = useState<RewardTransactionRecord[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    setIsLoading(true);
    setMessage("");

   let loadedBookings = false;
let loadedLessons = false;
let loadedPackages = false;
let loadedPoints = false;
let loadedRewards = false;

    function checkLoading() {
      if (
  loadedBookings &&
  loadedLessons &&
  loadedPackages &&
  loadedPoints &&
  loadedRewards
) {
        setIsLoading(false);
      }
    }

    // =========================
    // 預約 / 上課紀錄
    // =========================

    const bookingsQuery = query(
      collection(db, "bookings"),
      where("userId", "==", student.id)
    );

    const unsubscribeBookings = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const nextBookings = snapshot.docs
          .map((bookingDocument) => {
            const data = bookingDocument.data();

            return {
              id: bookingDocument.id,

              courseName: String(
                data.courseName ?? ""
              ),

              classStartTime:
                data.classStartTime instanceof Timestamp
                  ? data.classStartTime
                  : null,

              pointsUsed: Number(
                data.pointsUsed ?? 0
              ),

              pointsRefunded: Number(
                data.pointsRefunded ?? 0
              ),

              status: String(
                data.status ?? ""
              ),

              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null,
            };
          })
          .sort(
            (first, second) =>
              timestampToMillis(
                second.classStartTime
              ) -
              timestampToMillis(
                first.classStartTime
              )
          );

        setBookings(nextBookings);

        loadedBookings = true;
        checkLoading();
      },
      (error) => {
        console.error(error);
        setMessage("讀取上課紀錄失敗。");

        loadedBookings = true;
        checkLoading();
      }
    );
// =========================
// 動作 / 上課內容紀錄
// =========================

const lessonRecordsQuery = query(
  collection(db, "studentLessonRecords"),
  where("studentId", "==", student.id)
);

const unsubscribeLessonRecords =
  onSnapshot(
    lessonRecordsQuery,
    (snapshot) => {
      const nextRecords =
        snapshot.docs
          .map((recordDocument) => {
            const data =
              recordDocument.data();

            return {
              id: recordDocument.id,

              studentId: String(
                data.studentId ?? ""
              ),

              classId: String(
                data.classId ?? ""
              ),

              courseName: String(
                data.courseName ?? ""
              ),

              classStartTime:
                data.classStartTime instanceof Timestamp
                  ? data.classStartTime
                  : null,

              lessonContent: String(
                data.lessonContent ?? ""
              ),

              source: String(
                data.source ?? ""
              ),

              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null,
            };
          })
          .sort(
            (first, second) =>
              timestampToMillis(
                second.classStartTime
              ) -
              timestampToMillis(
                first.classStartTime
              )
          );

      setLessonRecords(nextRecords);

      loadedLessons = true;
      checkLoading();
    },
    (error) => {
      console.error(error);

      setMessage(
        "讀取動作紀錄失敗。"
      );

      loadedLessons = true;
      checkLoading();
    }
  );
    // =========================
    // 課卡購買紀錄
    // packageSales 使用 studentId
    // =========================

    const packageSalesQuery = query(
      collection(db, "packageSales"),
      where("studentId", "==", student.id)
    );

    const unsubscribePackageSales = onSnapshot(
      packageSalesQuery,
      (snapshot) => {
        const nextSales = snapshot.docs
          .map((saleDocument) => {
            const data = saleDocument.data();

            return {
              id: saleDocument.id,

              packageName: String(
                data.packageName ?? ""
              ),

              points: Number(
                data.points ?? 0
              ),

              originalPrice: Number(
                data.originalPrice ?? 0
              ),

              discountAmount: Number(
                data.discountAmount ?? 0
              ),

              price: Number(
                data.price ?? 0
              ),

              paymentMethod: String(
                data.paymentMethod ?? ""
              ),

              status: String(
                data.status ?? ""
              ),

              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null,
            };
          })
          .sort(
            (first, second) =>
              timestampToMillis(
                second.createdAt
              ) -
              timestampToMillis(
                first.createdAt
              )
          );

        setPackageSales(nextSales);

        loadedPackages = true;
        checkLoading();
      },
      (error) => {
        console.error(error);
        setMessage("讀取課卡購買紀錄失敗。");

        loadedPackages = true;
        checkLoading();
      }
    );

    // =========================
    // 課程點數紀錄
    // =========================

    const pointTransactionsQuery = query(
      collection(db, "pointTransactions"),
      where("userId", "==", student.id)
    );

    const unsubscribePoints = onSnapshot(
      pointTransactionsQuery,
      (snapshot) => {
        const nextTransactions = snapshot.docs
          .map((transactionDocument) => {
            const data =
              transactionDocument.data();

            return {
              id: transactionDocument.id,

              courseName: String(
                data.courseName ?? ""
              ),

              type: String(
                data.type ?? ""
              ),

              amount: Number(
                data.amount ?? 0
              ),

              balanceAfter: Number(
                data.balanceAfter ?? 0
              ),

              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null,
            };
          })
          .sort(
            (first, second) =>
              timestampToMillis(
                second.createdAt
              ) -
              timestampToMillis(
                first.createdAt
              )
          );

        setPointTransactions(
          nextTransactions
        );

        loadedPoints = true;
        checkLoading();
      },
      (error) => {
        console.error(error);
        setMessage("讀取點數紀錄失敗。");

        loadedPoints = true;
        checkLoading();
      }
    );

    // =========================
    // 紅利紀錄
    // =========================

    const rewardTransactionsQuery = query(
      collection(db, "rewardTransactions"),
      where("userId", "==", student.id)
    );

    const unsubscribeRewards = onSnapshot(
      rewardTransactionsQuery,
      (snapshot) => {
        const nextTransactions = snapshot.docs
          .map((transactionDocument) => {
            const data =
              transactionDocument.data();

            return {
              id: transactionDocument.id,

              type: String(
                data.type ?? ""
              ),

              amount: Number(
                data.amount ?? 0
              ),

              balanceAfter: Number(
                data.balanceAfter ?? 0
              ),

              couponName: String(
                data.couponName ?? ""
              ),

              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null,
            };
          })
          .sort(
            (first, second) =>
              timestampToMillis(
                second.createdAt
              ) -
              timestampToMillis(
                first.createdAt
              )
          );

        setRewardTransactions(
          nextTransactions
        );

        loadedRewards = true;
        checkLoading();
      },
      (error) => {
        console.error(error);
        setMessage("讀取紅利紀錄失敗。");

        loadedRewards = true;
        checkLoading();
      }
    );

    return () => {
  unsubscribeBookings();
  unsubscribeLessonRecords();
  unsubscribePackageSales();
  unsubscribePoints();
  unsubscribeRewards();
};
  }, [student.id]);

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-slate-900/60 px-4 py-8">
      <div className="mx-auto w-full max-w-5xl rounded-3xl bg-white p-6 shadow-2xl md:p-9">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Student History
            </p>

            <h2 className="mt-2 text-3xl font-bold text-slate-900">
              {student.name || "未填寫姓名"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {student.email}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {student.phone || "電話未填寫"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            關閉
          </button>
        </div>

        {/* 餘額摘要 */}
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-sky-50 p-5">
            <p className="text-sm font-semibold text-sky-700">
              目前課程點數
            </p>

            <p className="mt-2 text-4xl font-bold text-sky-700">
              {student.points}
              <span className="ml-2 text-base font-semibold">
                點
              </span>
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-700">
              目前紅利點數
            </p>

            <p className="mt-2 text-4xl font-bold text-amber-700">
              {student.rewardPoints ?? 0}
              <span className="ml-2 text-base font-semibold">
                點
              </span>
            </p>
          </div>
        </div>

        {/* Tabs */}
<div className="mt-7 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">
  <button
    type="button"
    onClick={() =>
      setActiveTab("bookings")
    }
    className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${
      activeTab === "bookings"
        ? "bg-sky-600 text-white"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    上課紀錄 ({bookings.length})
  </button>

  <button
    type="button"
    onClick={() =>
      setActiveTab("lessons")
    }
    className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${
      activeTab === "lessons"
        ? "bg-violet-600 text-white"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    動作紀錄 ({lessonRecords.length})
  </button>

  <button
    type="button"
    onClick={() =>
      setActiveTab("packages")
    }
    className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${
      activeTab === "packages"
        ? "bg-sky-600 text-white"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    課卡購買 ({packageSales.length})
  </button>

  <button
    type="button"
    onClick={() =>
      setActiveTab("points")
    }
    className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${
      activeTab === "points"
        ? "bg-sky-600 text-white"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    點數異動 ({pointTransactions.length})
  </button>

  <button
    type="button"
    onClick={() =>
      setActiveTab("rewards")
    }
    className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${
      activeTab === "rewards"
        ? "bg-sky-600 text-white"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    紅利紀錄 ({rewardTransactions.length})
  </button>
</div>
{/* 上課紀錄 */}
{activeTab === "bookings" && (
  <>
    {bookings.length === 0 ? (
      <div className="mt-6 rounded-2xl bg-slate-50 px-5 py-8 text-center text-slate-500">
        尚無上課紀錄。
      </div>
    ) : (
      <div className="mt-6 space-y-3">
        {bookings.map((booking) => (
          <div
            key={booking.id}
            className="rounded-2xl border border-slate-200 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-bold text-slate-900">
                  {booking.courseName || "課程"}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(
                    booking.classStartTime
                  )}
                </p>
              </div>

              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                {getBookingStatusLabel(
                  booking.status
                )}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
              <span>
                使用 {booking.pointsUsed} 點
              </span>

              {booking.pointsRefunded > 0 && (
                <span className="text-emerald-700">
                  退還 {booking.pointsRefunded} 點
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </>
)}

{/* 動作紀錄 */}
{activeTab === "lessons" && (
  <div className="mt-6">
    <div className="mb-5 flex items-center justify-between gap-4">
      <div>
        <h3 className="font-bold text-slate-900">
          動作紀錄
        </h3>

        <p className="mt-1 text-sm text-slate-500">
          共 {lessonRecords.length} 筆紀錄
        </p>
      </div>

      <AddStudentLessonRecord
        studentId={student.id}
      />
    </div>

    {lessonRecords.length === 0 ? (
      <div className="rounded-2xl bg-slate-50 px-5 py-8 text-center text-slate-500">
        尚無動作紀錄。
      </div>
    ) : (
      <div className="space-y-3">
        {lessonRecords.map((record) => (
  <div
    key={record.id}
    className="rounded-2xl border border-violet-100 bg-violet-50/40 p-5"
  >
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-bold text-slate-900">
          {record.courseName || "課程"}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {formatDateTime(
            record.classStartTime
          )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
          {record.source === "manual"
            ? "歷史補登"
            : "上課紀錄"}
        </span>

        <EditStudentLessonRecord
          recordId={record.id}
          courseName={record.courseName}
          lessonContent={record.lessonContent}
          classStartTime={record.classStartTime}
          source={record.source}
        />
      </div>
    </div>

    <div className="mt-4 rounded-xl bg-white p-4">
      <p className="text-xs font-semibold text-slate-400">
        本堂內容
      </p>

      <p className="mt-2 font-semibold leading-7 text-violet-800">
        {record.lessonContent || "未記錄"}
      </p>
    </div>
  </div>
))}
      </div>
    )}
  </div>
)}
            {/* 課卡購買 */}
            {activeTab === "packages" && (
              <>
                {packageSales.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-5 py-8 text-center text-slate-500">
                    尚無課卡購買紀錄。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {packageSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="rounded-2xl border border-slate-200 p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="font-bold text-slate-900">
                              {sale.packageName}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {formatDateTime(
                                sale.createdAt
                              )}
                            </p>
                          </div>

                          <p className="text-lg font-bold text-sky-700">
                            {formatCurrency(
                              sale.price
                            )}
                          </p>
                        </div>

                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                          <div>
                            <p className="text-slate-400">
                              增加點數
                            </p>
                            <p className="mt-1 font-semibold text-slate-700">
                              +{sale.points} 點
                            </p>
                          </div>

                          <div>
                            <p className="text-slate-400">
                              付款方式
                            </p>
                            <p className="mt-1 font-semibold text-slate-700">
                              {getPaymentMethodLabel(
                                sale.paymentMethod
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-slate-400">
                              優惠折抵
                            </p>
                            <p className="mt-1 font-semibold text-emerald-700">
                              {sale.discountAmount > 0
                                ? `-${formatCurrency(
                                    sale.discountAmount
                                  )}`
                                : "無"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 點數紀錄 */}
            {activeTab === "points" && (
              <>
                {pointTransactions.length ===
                0 ? (
                  <div className="rounded-2xl bg-slate-50 px-5 py-8 text-center text-slate-500">
                    尚無點數異動紀錄。
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {pointTransactions.map(
                      (transaction) => (
                        <div
                          key={transaction.id}
                          className="flex flex-wrap items-center justify-between gap-4 py-5"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">
                              {transaction.courseName ||
                                getPointTypeLabel(
                                  transaction.type
                                )}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {getPointTypeLabel(
                                transaction.type
                              )}
                              {" · "}
                              {formatDateTime(
                                transaction.createdAt
                              )}
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              異動後：
                              {transaction.balanceAfter} 點
                            </p>
                          </div>

                          <p
                            className={`text-xl font-bold ${
                              transaction.amount >= 0
                                ? "text-emerald-600"
                                : "text-orange-600"
                            }`}
                          >
                            {transaction.amount >= 0
                              ? "+"
                              : ""}
                            {transaction.amount}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </>
            )}

            {/* 紅利紀錄 */}
            {activeTab === "rewards" && (
              <>
                {rewardTransactions.length ===
                0 ? (
                  <div className="rounded-2xl bg-slate-50 px-5 py-8 text-center text-slate-500">
                    尚無紅利異動紀錄。
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {rewardTransactions.map(
                      (transaction) => (
                        <div
                          key={transaction.id}
                          className="flex flex-wrap items-center justify-between gap-4 py-5"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">
                              {transaction.couponName ||
                                getRewardTypeLabel(
                                  transaction.type
                                )}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {getRewardTypeLabel(
                                transaction.type
                              )}
                              {" · "}
                              {formatDateTime(
                                transaction.createdAt
                              )}
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              異動後：
                              {transaction.balanceAfter} 點
                            </p>
                          </div>

                          <p
                            className={`text-xl font-bold ${
                              transaction.amount >= 0
                                ? "text-emerald-600"
                                : "text-orange-600"
                            }`}
                          >
                            {transaction.amount >= 0
                              ? "+"
                              : ""}
                            {transaction.amount}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </div>
      </div>
  );
}