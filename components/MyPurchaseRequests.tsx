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

type MyPurchaseRequestsProps = {
  userId: string;
};

type PurchaseRequestData = {
  id: string;
  packageName: string;
  packagePoints: number;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  couponCode: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  createdAt: Timestamp | null;
  reviewedAt: Timestamp | null;
  completedAt: Timestamp | null;
};

function formatCurrency(amount: number) {
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

function formatDateTime(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "處理中";
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

function getPaymentMethodLabel(paymentMethod: string) {
  switch (paymentMethod) {
    case "transfer":
      return "銀行轉帳";

    case "linepay_money":
      return "LINE Pay Money";

    case "cash":
      return "現場付款";

    case "credit_card":
      return "信用卡";

    case "line_pay":
      return "LINE Pay";

    case "atm":
      return "ATM 轉帳";

    default:
      return paymentMethod || "未設定";
  }
}

function getPaymentStatusLabel(paymentStatus: string) {
  switch (paymentStatus) {
    case "unpaid":
      return "待付款";

    case "paid":
      return "已付款";

    case "confirmed":
      return "已確認收款";

    case "refunded":
      return "已退款";

    default:
      return paymentStatus || "待確認";
  }
}

function getRequestStatus(status: string) {
  switch (status) {
    case "pending":
      return {
        label: "等待老師確認",
        className: "bg-amber-50 text-amber-700",
        description: "申請已送出，請完成付款並等待老師確認。",
      };

    case "approved":
      return {
        label: "申請已核准",
        className: "bg-sky-50 text-sky-700",
        description: "老師已核准申請，正在確認付款與點數。",
      };

    case "completed":
      return {
        label: "購買完成",
        className: "bg-emerald-50 text-emerald-700",
        description: "款項已確認，課卡點數已加入會員帳戶。",
      };

    case "rejected":
      return {
        label: "申請未通過",
        className: "bg-red-50 text-red-600",
        description: "此筆購買申請未通過，請聯絡老師確認。",
      };

    case "cancelled":
      return {
        label: "申請已取消",
        className: "bg-slate-100 text-slate-600",
        description: "此筆購買申請已取消。",
      };

    default:
      return {
        label: status || "處理中",
        className: "bg-slate-100 text-slate-600",
        description: "申請正在處理中。",
      };
  }
}

export default function MyPurchaseRequests({
  userId,
}: MyPurchaseRequestsProps) {
  const [requests, setRequests] = useState<PurchaseRequestData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!userId) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    const requestsQuery = query(
      collection(db, "purchaseRequests"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const nextRequests = snapshot.docs
          .map((requestDocument) => {
            const data = requestDocument.data();

            return {
              id: requestDocument.id,
              packageName: String(data.packageName ?? ""),
              packagePoints: Number(data.packagePoints ?? 0),
              originalPrice: Number(data.originalPrice ?? 0),
              discountAmount: Number(data.discountAmount ?? 0),
              finalPrice: Number(data.finalPrice ?? 0),
              couponCode: String(data.couponCode ?? ""),
              paymentMethod: String(data.paymentMethod ?? ""),
              paymentStatus: String(data.paymentStatus ?? ""),
              status: String(data.status ?? "pending"),
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null,
              reviewedAt:
                data.reviewedAt instanceof Timestamp
                  ? data.reviewedAt
                  : null,
              completedAt:
                data.completedAt instanceof Timestamp
                  ? data.completedAt
                  : null,
            };
          })
          .sort((first, second) => {
            const firstTime = first.createdAt?.toMillis() ?? 0;
            const secondTime = second.createdAt?.toMillis() ?? 0;

            return secondTime - firstTime;
          });

        setRequests(nextRequests);
        setMessage("");
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setMessage("讀取購買紀錄失敗。");
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  return (
    <article className="mt-10 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
          Purchase History
        </p>

        <h2 className="mt-2 text-2xl font-bold text-slate-900">
          購買進度與紀錄
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          可在此查看購買申請、付款狀態及課卡點數發放進度。
        </p>
      </div>

      {message && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </p>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-slate-600">
          購買紀錄載入中……
        </p>
      ) : requests.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前尚無課卡購買紀錄。
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-5">
          {requests.map((request) => {
            const statusInfo = getRequestStatus(request.status);

            return (
              <div
                key={request.id}
                className="rounded-2xl border border-slate-200 p-5 md:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">
                      {request.packageName || "未命名方案"}
                    </h3>

                    <p className="mt-2 text-sm text-slate-500">
                      申請時間：{formatDateTime(request.createdAt)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusInfo.className}`}
                  >
                    {statusInfo.label}
                  </span>
                </div>

                <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                  {statusInfo.description}
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      課卡點數
                    </p>

                    <p className="mt-1 font-bold text-slate-900">
                      {request.packagePoints} 點
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      付款方式
                    </p>

                    <p className="mt-1 font-bold text-slate-900">
                      {getPaymentMethodLabel(request.paymentMethod)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      付款狀態
                    </p>

                    <p className="mt-1 font-bold text-slate-900">
                      {getPaymentStatusLabel(request.paymentStatus)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      應付金額
                    </p>

                    <p className="mt-1 font-bold text-sky-700">
                      {formatCurrency(request.finalPrice)}
                    </p>
                  </div>
                </div>

                {request.discountAmount > 0 && (
                  <div className="mt-5 border-t border-slate-100 pt-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        原價
                      </span>

                      <span className="text-slate-700">
                        {formatCurrency(request.originalPrice)}
                      </span>
                    </div>

                    <div className="mt-2 flex justify-between gap-4">
                      <span className="text-slate-500">
                        優惠折抵
                      </span>

                      <span className="font-semibold text-emerald-700">
                        -{formatCurrency(request.discountAmount)}
                      </span>
                    </div>
                  </div>
                )}

                {request.status === "completed" && (
                  <p className="mt-5 text-sm font-semibold text-emerald-700">
                    完成時間：
                    {formatDateTime(
                      request.completedAt ?? request.reviewedAt
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}