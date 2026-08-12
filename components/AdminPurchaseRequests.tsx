"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  completePurchaseRequest,
  rejectPurchaseRequest,
} from "@/lib/purchaseRequestService";

type PurchaseRequestData = {
  id: string;
  userId: string;

  studentName: string;
  studentEmail: string;

  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;

  packageName: string;
  packagePoints: number;

  originalPrice: number;
  discountAmount: number;
  finalPrice: number;

  couponCode: string;
  couponName: string;
  couponSource: string;

  paymentMethod: string;
  transferLastFive: string;
  paymentStatus: string;

  status: string;
  createdAt: Timestamp | null;
};

function formatCurrency(amount: number) {
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

function formatDateTime(timestamp: Timestamp | null) {
  if (!timestamp) {
    return "時間處理中";
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

function getCouponLabel(
  couponSource: string,
  couponName: string
) {
  if (couponName) {
    return couponName;
  }

  switch (couponSource) {
    case "birthday":
      return "生日 7 折優惠";

    case "new_student":
      return "新生優惠";

    case "user_coupon":
      return "紅利優惠券";

    default:
      return "未使用優惠";
  }
}

export default function AdminPurchaseRequests() {
  const currentTaipeiMonth = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      month: "numeric",
    }).format(new Date())
  );

  const [requests, setRequests] = useState<
    PurchaseRequestData[]
  >([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [
    updatingRequestId,
    setUpdatingRequestId,
  ] = useState("");

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    const requestsQuery = query(
      collection(db, "purchaseRequests"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      requestsQuery,
      async (snapshot) => {
        try {
          const nextRequests =
            await Promise.all(
              snapshot.docs.map(
                async (requestDocument) => {
                  const data =
                    requestDocument.data();

                  const userId = String(
                    data.userId ?? ""
                  );

                  let studentName =
                    "找不到學生姓名";

                  let studentEmail = "";

                  let birthdayYear = 0;
                  let birthdayMonth = 0;
                  let birthdayDay = 0;

                  if (userId) {
                    const userSnapshot =
                      await getDoc(
                        doc(
                          db,
                          "users",
                          userId
                        )
                      );

                    if (
                      userSnapshot.exists()
                    ) {
                      const userData =
                        userSnapshot.data();

                      studentName = String(
                        userData.name ??
                          "未填寫姓名"
                      );

                      studentEmail = String(
                        userData.email ?? ""
                      );

                      birthdayYear = Number(
                        userData.birthdayYear ??
                          0
                      );

                      birthdayMonth =
                        Number(
                          userData.birthdayMonth ??
                            0
                        );

                      birthdayDay = Number(
                        userData.birthdayDay ??
                          0
                      );
                    }
                  }

                  return {
                    id: requestDocument.id,
                    userId,

                    studentName,
                    studentEmail,

                    birthdayYear,
                    birthdayMonth,
                    birthdayDay,

                    packageName: String(
                      data.packageName ?? ""
                    ),

                    packagePoints: Number(
                      data.packagePoints ?? 0
                    ),

                    originalPrice: Number(
                      data.originalPrice ?? 0
                    ),

                    discountAmount: Number(
                      data.discountAmount ?? 0
                    ),

                    finalPrice: Number(
                      data.finalPrice ?? 0
                    ),

                    couponCode: String(
                      data.couponCode ?? ""
                    ),

                    couponName: String(
                      data.couponName ?? ""
                    ),

                    couponSource: String(
                      data.couponSource ?? ""
                    ),

                    paymentMethod: String(
                      data.paymentMethod ?? ""
                    ),

                    transferLastFive:
                      String(
                        data.transferLastFive ??
                          ""
                      ),

                    paymentStatus: String(
                      data.paymentStatus ?? ""
                    ),

                    status: String(
                      data.status ??
                        "pending"
                    ),

                    createdAt:
                      data.createdAt instanceof
                      Timestamp
                        ? data.createdAt
                        : null,
                  };
                }
              )
            );

          nextRequests.sort(
            (first, second) => {
              const firstTime =
                first.createdAt?.toMillis() ??
                0;

              const secondTime =
                second.createdAt?.toMillis() ??
                0;

              return (
                secondTime - firstTime
              );
            }
          );

          setRequests(nextRequests);
          setMessage("");
        } catch (error) {
          console.error(error);

          setMessage(
            "讀取學生資料失敗。"
          );
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error(error);

        setMessage(
          "讀取購買申請失敗。"
        );

        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  async function handleComplete(
    request: PurchaseRequestData
  ) {
    const admin = auth.currentUser;

    if (!admin) {
      window.location.href = "/login";
      return;
    }

    /*
     * 額外提供老師前端提醒。
     * 真正的生日資格仍由
     * purchaseRequestService 再驗證一次。
     */
    if (
      request.couponSource ===
        "birthday" &&
      request.birthdayMonth !==
        currentTaipeiMonth
    ) {
      window.alert(
        "此會員目前不是生日月份，無法確認生日優惠訂單。"
      );

      return;
    }

    const confirmed = window.confirm(
      `確定已收到 ${
        request.studentName
      } 的 ${formatCurrency(
        request.finalPrice
      )}，並發放 ${
        request.packagePoints
      } 點嗎？`
    );

    if (!confirmed) {
      return;
    }

    setUpdatingRequestId(request.id);
    setMessage("");

    try {
      const result =
        await completePurchaseRequest({
          requestId: request.id,
          adminId: admin.uid,
        });

      setMessage(
        `購買完成！${request.studentName} 已增加 ${result.packagePoints} 點，目前共有 ${result.newPointBalance} 點。`
      );
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "確認購買申請失敗。"
      );
    } finally {
      setUpdatingRequestId("");
    }
  }

  async function handleReject(
    request: PurchaseRequestData
  ) {
    const admin = auth.currentUser;

    if (!admin) {
      window.location.href = "/login";
      return;
    }

    const reason = window.prompt(
      `請輸入拒絕 ${request.studentName} 購買申請的原因，可留空：`
    );

    if (reason === null) {
      return;
    }

    setUpdatingRequestId(request.id);
    setMessage("");

    try {
      await rejectPurchaseRequest({
        requestId: request.id,
        adminId: admin.uid,
        reason,
      });

      setMessage(
        `${request.studentName} 的購買申請已拒絕。`
      );
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "拒絕購買申請失敗。"
      );
    } finally {
      setUpdatingRequestId("");
    }
  }

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
          Purchase Requests
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              待處理購買申請
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              確認款項後，系統會自動加入課卡點數。
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 px-5 py-3 text-center">
            <p className="text-xs font-semibold text-amber-700">
              待處理
            </p>

            <p className="mt-1 text-2xl font-bold text-amber-800">
              {requests.length}
            </p>
          </div>
        </div>
      </div>

      {message && (
        <p className="mt-5 rounded-xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-700">
          {message}
        </p>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-slate-600">
          購買申請載入中……
        </p>
      ) : requests.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前沒有待處理的購買申請。
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-5">
          {requests.map((request) => {
            const isUpdating =
              updatingRequestId ===
              request.id;

            const isBirthdayMonth =
              request.birthdayMonth > 0 &&
              request.birthdayMonth ===
                currentTaipeiMonth;

            const isBirthdayOrder =
              request.couponSource ===
              "birthday";

            return (
              <div
                key={request.id}
                className="rounded-2xl border border-slate-200 p-5 md:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">
                      {request.studentName}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {request.studentEmail}
                    </p>

                    {/* 會員生日 */}
                    {request.birthdayMonth >
                      0 && (
                      <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-sm text-slate-700">
                          🎂 生日：
                          {request.birthdayYear >
                          0
                            ? `${request.birthdayYear}/`
                            : ""}
                          {String(
                            request.birthdayMonth
                          ).padStart(
                            2,
                            "0"
                          )}
                          /
                          {String(
                            request.birthdayDay
                          ).padStart(
                            2,
                            "0"
                          )}
                        </p>

                        {isBirthdayMonth ? (
                          <p className="mt-1 text-sm font-semibold text-emerald-700">
                            ✓ 本月生日・生日優惠資格符合
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-slate-500">
                            目前非生日月份
                          </p>
                        )}
                      </div>
                    )}

                    <p className="mt-3 text-sm text-slate-500">
                      申請時間：
                      {formatDateTime(
                        request.createdAt
                      )}
                    </p>
                  </div>

                  <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                    待確認
                  </span>
                </div>

                {/* 優惠資訊 */}
                {request.couponSource && (
                  <div
                    className={`mt-5 rounded-2xl border p-4 ${
                      isBirthdayOrder &&
                      isBirthdayMonth
                        ? "border-emerald-200 bg-emerald-50"
                        : isBirthdayOrder &&
                            !isBirthdayMonth
                          ? "border-red-200 bg-red-50"
                          : "border-sky-100 bg-sky-50"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                      Discount
                    </p>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <p className="font-bold text-slate-900">
                        {getCouponLabel(
                          request.couponSource,
                          request.couponName
                        )}
                      </p>

                      {isBirthdayOrder &&
                        isBirthdayMonth && (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                            ✓ 資格符合
                          </span>
                        )}

                      {isBirthdayOrder &&
                        !isBirthdayMonth && (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-600">
                            ⚠ 資格不符
                          </span>
                        )}
                    </div>
                  </div>
                )}

                <div className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      課卡
                    </p>

                    <p className="mt-1 font-bold text-slate-900">
                      {request.packageName}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      點數
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
                      {getPaymentMethodLabel(
                        request.paymentMethod
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      應收金額
                    </p>

                    <p className="mt-1 text-xl font-bold text-sky-700">
                      {formatCurrency(
                        request.finalPrice
                      )}
                    </p>
                  </div>
                </div>

                {/* 銀行轉帳末五碼 */}
                {request.paymentMethod ===
                  "transfer" && (
                  <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
                    <p className="text-xs font-semibold text-sky-600">
                      轉出帳號末五碼
                    </p>

                    <p className="mt-2 text-2xl font-bold tracking-[0.25em] text-slate-900">
                      {request.transferLastFive ||
                        "未填寫"}
                    </p>
                  </div>
                )}

                {request.discountAmount >
                  0 && (
                  <div className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        原價
                      </span>

                      <span>
                        {formatCurrency(
                          request.originalPrice
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        優惠折抵
                      </span>

                      <span className="font-semibold text-emerald-700">
                        -
                        {formatCurrency(
                          request.discountAmount
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4 border-t border-slate-100 pt-2">
                      <span className="font-semibold text-slate-700">
                        實收
                      </span>

                      <span className="font-bold text-sky-700">
                        {formatCurrency(
                          request.finalPrice
                        )}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() =>
                      handleReject(request)
                    }
                    className="rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    拒絕申請
                  </button>

                  <button
                    type="button"
                    disabled={
                      isUpdating ||
                      (isBirthdayOrder &&
                        !isBirthdayMonth)
                    }
                    onClick={() =>
                      handleComplete(request)
                    }
                    className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-70"
                  >
                    {isUpdating
                      ? "處理中……"
                      : isBirthdayOrder &&
                          !isBirthdayMonth
                        ? "生日資格不符"
                        : "確認收款並加點"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}