"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import MyPurchaseRequests from "@/components/MyPurchaseRequests";

type PackageData = {
  id: string;
  name: string;
  points: number;
  price: number;
  displayOrder: number;
  description: string;
  isActive: boolean;
};

type AvailableCoupon = {
  id: string;
  source:
  | "new_student"
  | "user_coupon"
  | "birthday";
  name: string;
  discountRate: number;
  userCouponId?: string;
};

export default function BuyPackagesPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");

  const [paymentMethod, setPaymentMethod] =
    useState("transfer");

  const [transferLastFive, setTransferLastFive] =
    useState("");

  const [availableCoupons, setAvailableCoupons] =
    useState<AvailableCoupon[]>([]);

  const [selectedCouponId, setSelectedCouponId] =
    useState("");

  const [isNewStudent, setIsNewStudent] =
    useState(false);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] =
    useState(false);
const [birthdayMonth, setBirthdayMonth] = useState<number | null>(null);
const [birthdayDay, setBirthdayDay] = useState<number | null>(null);
const [birthdayUsageLoaded, setBirthdayUsageLoaded] = useState(false);
const [birthdayUsedThisYear, setBirthdayUsedThisYear] = useState(true);

  useEffect(() => {
    let unsubscribePackages: (() => void) | undefined;
    let unsubscribeUser: (() => void) | undefined;
    let unsubscribeUserCoupons: (() => void) | undefined;
    let unsubscribeBirthdayUsage: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          router.replace("/login");
          return;
        }

        setUserId(user.uid);

        // NAYA_BIRTHDAY_USAGE_SUBSCRIPTION
        setBirthdayUsageLoaded(false);
        setBirthdayUsedThisYear(true);

        const birthdayYear = Number(
          new Intl.DateTimeFormat("en", {
            timeZone: "Asia/Taipei",
            year: "numeric",
          }).format(new Date())
        );

        unsubscribeBirthdayUsage?.();
        unsubscribeBirthdayUsage = onSnapshot(
          doc(db, "birthdayCouponUsage", `${user.uid}_${birthdayYear}`),
          (snapshot) => {
            setBirthdayUsedThisYear(snapshot.exists());
            setBirthdayUsageLoaded(true);
          },
          (error) => {
            console.error("讀取生日優惠使用紀錄失敗：", error);
            setBirthdayUsedThisYear(true);
            setBirthdayUsageLoaded(true);
            setMessage("暫時無法確認生日優惠資格，請稍後再試。");
          }
        );

        // 讀取會員資料：判斷是否仍有新生優惠
        unsubscribeUser = onSnapshot(
          doc(db, "users", user.uid),
          (snapshot) => {
            if (!snapshot.exists()) {
              return;
            }

            const data = snapshot.data();

            setIsNewStudent(
              Boolean(data.isNewStudent ?? false)
            );
            setBirthdayMonth(
  data.birthdayMonth !== undefined
    ? Number(data.birthdayMonth)
    : null
);

setBirthdayDay(
  data.birthdayDay !== undefined
    ? Number(data.birthdayDay)
    : null
);


          },
          (error) => {
            console.error(error);
            setMessage("讀取會員優惠資格失敗。");
          }
        );

        // 讀取販售中的課卡
        const packagesQuery = query(
          collection(db, "packages"),
          orderBy("displayOrder")
        );

        unsubscribePackages = onSnapshot(
          packagesQuery,
          (snapshot) => {
            const nextPackages = snapshot.docs
              .map((packageDocument) => {
                const data = packageDocument.data();

                return {
                  id: packageDocument.id,
                  name: String(data.name ?? ""),
                  points: Number(data.points ?? 0),
                  price: Number(data.price ?? 0),
                  displayOrder: Number(
                    data.displayOrder ?? 0
                  ),
                  description: String(
                    data.description ?? ""
                  ),
                  isActive: Boolean(
                    data.isActive ?? false
                  ),
                };
              })
              .filter((item) => item.isActive);

            setPackages(nextPackages);
            setIsLoading(false);
          },
          (error) => {
            console.error(error);
            setMessage("讀取課卡商品失敗。");
            setIsLoading(false);
          }
        );

        // 讀取學生已經兌換、目前可使用的紅利優惠券
        const userCouponsQuery = query(
          collection(db, "userCoupons"),
          where("userId", "==", user.uid),
          where("status", "==", "available")
        );

        unsubscribeUserCoupons = onSnapshot(
          userCouponsQuery,
          (snapshot) => {
            const nextCoupons =
              snapshot.docs.map((couponDocument) => {
                const data = couponDocument.data();

                return {
                  id: couponDocument.id,
                  source: "user_coupon" as const,
                  name: String(data.name ?? ""),
                  discountRate: Number(
                    data.discountRate ?? 1
                  ),
                  userCouponId: couponDocument.id,
                };
              });

            setAvailableCoupons(nextCoupons);
          },
          (error) => {
            console.error(error);
            setMessage("讀取可用優惠券失敗。");
          }
        );
      }
    );

    return () => {
      unsubscribeAuth();
      unsubscribePackages?.();
      unsubscribeUser?.();
      unsubscribeUserCoupons?.();
      unsubscribeBirthdayUsage?.();
    };
  }, [router]);

  const selectedPackage = packages.find(
    (item) => item.id === selectedPackageId
  );

  // 依目前選擇的課卡，自動產生新生優惠
  const now = new Date();

const currentTaipeiYear = Number(
  new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei",
    year: "numeric",
  }).format(now)
);

const currentTaipeiMonth = Number(
  new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei",
    month: "numeric",
  }).format(now)
);

const hasBirthdayBenefit =

  birthdayUsageLoaded &&

  !birthdayUsedThisYear &&

  birthdayMonth !== null &&

  birthdayMonth === currentTaipeiMonth;
  const selectableCoupons = useMemo(() => {
  const nextCoupons: AvailableCoupon[] = [
    ...availableCoupons,
  ];

  // 生日當月 7 折
  if (hasBirthdayBenefit && selectedPackage) {
    nextCoupons.unshift({
      id: `birthday_${currentTaipeiYear}`,
      source: "birthday" as const,
      name: "生日 7 折優惠",
      discountRate: 0.7,
    });
  }

  // 新生優惠
  if (isNewStudent && selectedPackage) {
    if (selectedPackage.points >= 25) {
      nextCoupons.unshift({
        id: "new_student_85",
        source: "new_student",
        name: "新生 85 折優惠",
        discountRate: 0.85,
      });
    } else {
      nextCoupons.unshift({
        id: "new_student_90",
        source: "new_student",
        name: "新生 9 折優惠",
        discountRate: 0.9,
      });
    }
  }

  return nextCoupons;
}, [
  availableCoupons,
  hasBirthdayBenefit,
  currentTaipeiYear,
  isNewStudent,
  selectedPackage,
]);
  // 生日當月且尚未使用時，自動選取生日優惠。
  useEffect(() => {
    const birthdayCouponId = `birthday_${currentTaipeiYear}`;

    if (
      hasBirthdayBenefit &&
      selectedPackage &&
      selectedCouponId === "" &&
      selectableCoupons.some((coupon) => coupon.id === birthdayCouponId)
    ) {
      setSelectedCouponId(birthdayCouponId);
    }
  }, [
    hasBirthdayBenefit,
    selectedPackage,
    selectedCouponId,
    selectableCoupons,
    currentTaipeiYear,
  ]);

  const selectedCoupon =
    selectableCoupons.find(
      (coupon) => coupon.id === selectedCouponId
    ) ?? null;

  const originalPrice =
    selectedPackage?.price ?? 0;

  const discountRate =
    selectedCoupon?.discountRate ?? 1;

  const discountAmount = Math.round(
    originalPrice * (1 - discountRate)
  );

  const finalPrice =
    originalPrice - discountAmount;

  // 切換課卡時，如果目前選的優惠不適用，就清掉
  useEffect(() => {
    if (
      selectedCouponId &&
      !selectableCoupons.some(
        (coupon) => coupon.id === selectedCouponId
      )
    ) {
      setSelectedCouponId("");
    }
  }, [selectableCoupons, selectedCouponId]);

  async function handleSubmitPurchase() {
    if (!userId) {
      router.replace("/login");
      return;
    }

    if (!selectedPackage) {
      setMessage("請先選擇要購買的課卡。");
      return;
    }

    if (
      paymentMethod === "transfer" &&
      !/^\d{5}$/.test(transferLastFive)
    ) {
      setMessage(
        "選擇銀行轉帳時，請輸入轉出帳號末五碼。"
      );
      return;
    }

    setMessage("");
    setIsSubmitting(true);

    try {
      const requestId =
        `${userId}_${Date.now()}_${crypto.randomUUID()}`;

      await setDoc(
        doc(db, "purchaseRequests", requestId),
        {
          userId,

          packageId: selectedPackage.id,
          packageName: selectedPackage.name,
          packagePoints: selectedPackage.points,

          originalPrice,

          // 優惠資料
          couponId:
            selectedCoupon?.source === "user_coupon"
              ? selectedCoupon.userCouponId ??
                selectedCoupon.id
              : null,

          couponCode:
            selectedCoupon?.id ?? null,

          couponName:
            selectedCoupon?.name ?? null,

          couponSource:
            selectedCoupon?.source ?? null,

          discountType:
            selectedCoupon
              ? "percentage"
              : null,

          discountValue:
            selectedCoupon
              ? selectedCoupon.discountRate
              : 0,

          discountAmount,

          finalPrice,

          paymentMethod,

          transferLastFive:
            paymentMethod === "transfer"
              ? transferLastFive
              : null,

          paymentStatus: "unpaid",
          status: "pending",

          reviewedBy: null,
          reviewedAt: null,
          completedAt: null,

          createdAt: serverTimestamp(),
        }
      );

      setMessage(
        "購買申請已送出！完成付款後，請等待老師確認並加入點數。"
      );

      setSelectedPackageId("");
      setSelectedCouponId("");
      setPaymentMethod("transfer");
      setTransferLastFive("");
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "送出購買申請失敗，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-20">
        <p className="text-center text-slate-600">
          課卡資料載入中……
        </p>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-12 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Course Packages
          </p>

          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            購買課卡
          </h1>

          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">
            選擇適合你的課卡。送出申請並完成付款後，
            老師確認款項即會將點數加入會員帳戶。
          </p>
        </div>

        {packages.length === 0 ? (
          <div className="mt-10 rounded-3xl bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-slate-600">
              目前沒有販售中的課卡。
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {packages.map((item) => {
              const isSelected =
                selectedPackageId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setSelectedPackageId(item.id);
                    setSelectedCouponId("");
                  }}
                  className={`flex flex-col rounded-3xl border p-7 text-left shadow-sm transition ${
                    isSelected
                      ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100"
                      : "border-slate-200 bg-white hover:-translate-y-1 hover:border-sky-200 hover:shadow-md"
                  }`}
                >
                  <div className="flex w-full items-start justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-2xl">
                      🎫
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isSelected
                          ? "bg-sky-600 text-white"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {isSelected
                        ? "已選擇"
                        : "販售中"}
                    </span>
                  </div>

                  <h2 className="mt-6 text-2xl font-bold text-slate-900">
                    {item.name}
                  </h2>

                  {item.description && (
                    <p className="mt-3 min-h-12 text-sm leading-6 text-slate-500">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-7">
                    <p className="text-sm text-slate-500">
                      課卡點數
                    </p>

                    <p className="mt-1 text-4xl font-bold text-sky-700">
                      {item.points}
                      <span className="ml-2 text-lg font-semibold">
                        點
                      </span>
                    </p>
                  </div>

                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <p className="text-sm text-slate-500">
                      售價
                    </p>

                    <p className="mt-1 text-2xl font-bold text-slate-900">
                      NT$ {item.price.toLocaleString()}
                    </p>

                    <p className="mt-3 text-sm text-slate-500">
                      使用期限：無限期
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedPackage && (
          <div className="mx-auto mt-10 max-w-2xl rounded-3xl bg-white p-7 shadow-sm md:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Order Summary
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              購買確認
            </h2>

            <div className="mt-7 space-y-4 rounded-2xl bg-slate-50 p-5">
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">
                  課卡
                </span>

                <span className="text-right font-semibold text-slate-900">
                  {selectedPackage.name}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-600">
                  點數
                </span>

                <span className="font-semibold text-slate-900">
                  {selectedPackage.points} 點
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-600">
                  原價
                </span>

                <span className="font-semibold text-slate-900">
                  NT$ {originalPrice.toLocaleString()}
                </span>
              </div>

              {/* 優惠選擇 */}
              <div className="border-t border-slate-200 pt-4">
                <p className="mb-3 font-semibold text-slate-800">
                  可使用優惠
                </p>

                <div className="space-y-3">
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      selectedCouponId === ""
                        ? "border-sky-400 bg-sky-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="coupon"
                      value=""
                      checked={
                        selectedCouponId === ""
                      }
                      onChange={() =>
                        setSelectedCouponId("")
                      }
                    />

                    <span className="text-sm font-semibold text-slate-700">
                      不使用優惠
                    </span>
                  </label>

                  {selectableCoupons.map(
                    (coupon) => (
                      <label
                        key={coupon.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition ${
                          selectedCouponId ===
                          coupon.id
                            ? "border-sky-400 bg-sky-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="coupon"
                            value={coupon.id}
                            checked={
                              selectedCouponId ===
                              coupon.id
                            }
                            onChange={() =>
                              setSelectedCouponId(
                                coupon.id
                              )
                            }
                          />

                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {coupon.name}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {Number((coupon.discountRate * 10).toFixed(1))}{" "}
                              折
                            </p>
                          </div>
                        </div>

                        {coupon.source ===
                          "new_student" && (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                            新生限定
                          </span>
                        )}
                        {coupon.source === "birthday" && (
  <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700">
    生日限定
  </span>
)}
                      </label>
                    )
                  )}
                </div>

                {selectableCoupons.length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">
                    目前沒有可使用的優惠。
                  </p>
                )}
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-600">
                    優惠折抵
                  </span>

                  <span className="font-semibold text-emerald-700">
                    -NT${" "}
                    {discountAmount.toLocaleString()}
                  </span>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-between gap-4">
                  <span className="font-semibold text-slate-800">
                    應付金額
                  </span>

                  <span className="text-2xl font-bold text-sky-700">
                    NT$ {finalPrice.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* 付款方式 */}
            <div className="mt-7">
              <label className="mb-3 block font-semibold text-slate-800">
                付款方式
              </label>

              <div className="space-y-3">
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
                    paymentMethod === "transfer"
                      ? "border-sky-400 bg-sky-50"
                      : "border-slate-200 bg-white hover:border-sky-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="transfer"
                    checked={
                      paymentMethod === "transfer"
                    }
                    onChange={(event) =>
                      setPaymentMethod(
                        event.target.value
                      )
                    }
                  />

                  <div>
                    <p className="font-semibold text-slate-900">
                      銀行轉帳
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      完成轉帳後，請填寫轉出帳號末五碼。
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
                    paymentMethod ===
                    "linepay_money"
                      ? "border-sky-400 bg-sky-50"
                      : "border-slate-200 bg-white hover:border-sky-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="linepay_money"
                    checked={
                      paymentMethod ===
                      "linepay_money"
                    }
                    onChange={(event) =>
                      setPaymentMethod(
                        event.target.value
                      )
                    }
                  />

                  <div>
                    <p className="font-semibold text-slate-900">
                      LINE Pay Money
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      送出申請後，請依老師提供的方式完成付款。
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
                    paymentMethod === "cash"
                      ? "border-sky-400 bg-sky-50"
                      : "border-slate-200 bg-white hover:border-sky-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={
                      paymentMethod === "cash"
                    }
                    onChange={(event) =>
                      setPaymentMethod(
                        event.target.value
                      )
                    }
                  />

                  <div>
                    <p className="font-semibold text-slate-900">
                      現場付款
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      上課時向老師付款，確認收款後加入點數。
                    </p>
                  </div>
                </label>
              </div>

              {/* 銀行轉帳資訊 */}
              {paymentMethod === "transfer" && (
                <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">
                        銀行轉帳資訊
                      </p>

                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        請依下方帳戶完成轉帳，並填寫實際轉出帳號末五碼。
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700">
                      待核對
                    </span>
                  </div>

                  <div className="mt-5 rounded-2xl bg-white p-5">
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">
                          銀行
                        </span>

                        <span className="font-semibold text-slate-900">
                          803 聯邦銀行
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-500">
                          帳號
                        </span>

                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-slate-900">
                            888501184231
                          </span>

                          <button
                            type="button"
                            onClick={async () => {
                              const bankAccount =
                                "888501184231";

                              try {
                                await navigator.clipboard.writeText(
                                  bankAccount
                                );

                                setMessage(
                                  "銀行帳號已複製。"
                                );
                              } catch (
                                error
                              ) {
                                console.error(
                                  error
                                );

                                setMessage(
                                  "無法自動複製，請手動複製帳號。"
                                );
                              }
                            }}
                            className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50"
                          >
                            複製
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <label
                      htmlFor="transferLastFive"
                      className="block font-semibold text-slate-800"
                    >
                      轉出帳號末五碼
                    </label>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      僅供老師核對款項使用，不需要提供完整銀行帳號。
                    </p>

                    <input
                      id="transferLastFive"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={5}
                      value={transferLastFive}
                      onChange={(event) => {
                        const nextValue =
                          event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 5);

                        setTransferLastFive(
                          nextValue
                        );
                      }}
                      placeholder="例如：12345"
                      className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg tracking-[0.3em] outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    />

                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">
                        請輸入 5 位數字
                      </span>

                      <span
                        className={
                          transferLastFive.length ===
                          5
                            ? "font-semibold text-emerald-600"
                            : "text-slate-400"
                        }
                      >
                        {
                          transferLastFive.length
                        }
                        /5
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {message && (
              <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmitPurchase}
              disabled={isSubmitting}
              className="mt-7 w-full rounded-xl bg-sky-600 px-6 py-3.5 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "送出申請中……"
                : "送出購買申請"}
            </button>
          </div>
        )}

        {/* 購買進度與歷史紀錄 */}
        {userId && (
          <MyPurchaseRequests userId={userId} />
        )}
      </div>
    </section>
  );
}
