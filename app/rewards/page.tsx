"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { redeemCoupon } from "@/lib/redeemCouponService";

type RewardCouponData = {
  id: string;
  name: string;
  discountRate: number;
  rewardCost: number;
  description: string;
  displayOrder: number;
  isActive: boolean;
  type: string;
};

type UserCouponData = {
  id: string;
  couponId: string;
  name: string;
  discountRate: number;
  status: string;
};

function formatDiscount(discountRate: number) {
  return `${Math.round(discountRate * 100)} 折`;
}

export default function RewardsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [rewardPoints, setRewardPoints] = useState(0);
  const [coupons, setCoupons] = useState<
    RewardCouponData[]
  >([]);
  const [userCoupons, setUserCoupons] = useState<
    UserCouponData[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [redeemingCouponId, setRedeemingCouponId] =
    useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribeUser: (() => void) | undefined;
    let unsubscribeCoupons: (() => void) | undefined;
    let unsubscribeUserCoupons:
      | (() => void)
      | undefined;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          router.replace("/login");
          return;
        }

        setUserId(user.uid);

        unsubscribeUser = onSnapshot(
          doc(db, "users", user.uid),
          (snapshot) => {
            if (!snapshot.exists()) {
              setMessage("找不到會員資料。");
              setIsLoading(false);
              return;
            }

            setRewardPoints(
              Number(snapshot.data().rewardPoints ?? 0)
            );
          },
          (error) => {
            console.error(error);
            setMessage("讀取紅利資料失敗。");
            setIsLoading(false);
          }
        );

        const couponsQuery = query(
  collection(db, "coupons"),
  where("type", "==", "reward")
);

        unsubscribeCoupons = onSnapshot(
  couponsQuery,
  (snapshot) => {
    const nextCoupons = snapshot.docs
      .map((couponDocument) => {
        const data = couponDocument.data();

        return {
          id: couponDocument.id,
          name: String(data.name ?? ""),
          discountRate: Number(data.discountRate ?? 1),
          rewardCost: Number(data.rewardCost ?? 0),
          description: String(data.description ?? ""),
          displayOrder: Number(data.displayOrder ?? 0),
          isActive: Boolean(data.isActive ?? false),
          type: String(data.type ?? ""),
        };
      })
      .filter((coupon) => coupon.isActive)
      .sort(
        (first, second) =>
          first.displayOrder - second.displayOrder
      );

    setCoupons(nextCoupons);
    setIsLoading(false);
  },
  (error) => {
    console.error(error);
    setMessage("讀取優惠券資料失敗。");
    setIsLoading(false);
  }
);

        const userCouponsQuery = query(
          collection(db, "userCoupons"),
          where("userId", "==", user.uid)
        );

        unsubscribeUserCoupons = onSnapshot(
          userCouponsQuery,
          (snapshot) => {
            const nextUserCoupons =
              snapshot.docs.map((couponDocument) => {
                const data = couponDocument.data();

                return {
                  id: couponDocument.id,
                  couponId: String(
                    data.couponId ?? ""
                  ),
                  name: String(data.name ?? ""),
                  discountRate: Number(
                    data.discountRate ?? 1
                  ),
                  status: String(
                    data.status ?? ""
                  ),
                };
              });

            setUserCoupons(nextUserCoupons);
          },
          (error) => {
            console.error(error);
            setMessage("讀取我的優惠券失敗。");
          }
        );
      }
    );

    return () => {
      unsubscribeAuth();
      unsubscribeUser?.();
      unsubscribeCoupons?.();
      unsubscribeUserCoupons?.();
    };
  }, [router]);

  const nextCoupon = useMemo(() => {
    return coupons.find(
      (coupon) => coupon.rewardCost > rewardPoints
    );
  }, [coupons, rewardPoints]);

  async function handleRedeem(
    coupon: RewardCouponData
  ) {
    if (!userId) {
      router.replace("/login");
      return;
    }

    const confirmed = window.confirm(
      `要使用 ${coupon.rewardCost} 點紅利兌換「${coupon.name}」嗎？`
    );

    if (!confirmed) {
      return;
    }

    setMessage("");
    setRedeemingCouponId(coupon.id);

    try {
      const result = await redeemCoupon({
        userId,
        couponId: coupon.id,
      });

      setMessage(
        `兌換成功！已取得「${result.couponName}」，目前剩餘 ${result.newRewardBalance} 點紅利。`
      );
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "兌換優惠券失敗，請稍後再試。"
      );
    } finally {
      setRedeemingCouponId("");
    }
  }

  if (isLoading) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-20">
        <p className="text-center text-slate-600">
          紅利資料載入中……
        </p>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-12 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Rewards
          </p>

          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            我的紅利與優惠券
          </h1>

          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">
            每完成一堂課可獲得 9 點紅利，累積後可兌換課卡折扣券。
          </p>
        </div>

        <div className="mt-10 rounded-3xl bg-slate-900 p-7 text-white shadow-lg md:p-9">
          <p className="text-sm font-semibold text-slate-300">
            目前紅利
          </p>

          <p className="mt-3 text-5xl font-bold">
            {rewardPoints}
            <span className="ml-2 text-xl font-semibold text-slate-300">
              點
            </span>
          </p>

          {nextCoupon ? (
            <p className="mt-5 text-sm leading-6 text-slate-300">
              再累積{" "}
              <span className="font-bold text-white">
                {nextCoupon.rewardCost - rewardPoints}
              </span>{" "}
              點，即可兌換「{nextCoupon.name}」。
            </p>
          ) : (
            <p className="mt-5 text-sm text-slate-300">
              目前已達最高等級優惠券的兌換門檻。
            </p>
          )}
        </div>

        {message && (
          <p className="mt-6 rounded-2xl bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-700">
            {message}
          </p>
        )}

        <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Redeem
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            兌換優惠券
          </h2>

          <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {coupons.map((coupon) => {
              const canRedeem =
                rewardPoints >= coupon.rewardCost;

              const isRedeeming =
                redeemingCouponId === coupon.id;

              return (
                <div
                  key={coupon.id}
                  className="flex flex-col rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-xl">
                    🎁
                  </div>

                  <h3 className="mt-5 text-xl font-bold text-slate-900">
                    {coupon.name}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {coupon.description}
                  </p>

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                      優惠
                    </p>

                    <p className="mt-1 text-3xl font-bold text-sky-700">
                      {formatDiscount(
                        coupon.discountRate
                      )}
                    </p>

                    <p className="mt-4 text-sm text-slate-500">
                      需要紅利
                    </p>

                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {coupon.rewardCost} 點
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={!canRedeem || isRedeeming}
                    onClick={() =>
                      handleRedeem(coupon)
                    }
                    className="mt-6 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {isRedeeming
                      ? "兌換中……"
                      : canRedeem
                        ? "立即兌換"
                        : `還差 ${
                            coupon.rewardCost -
                            rewardPoints
                          } 點`}
                  </button>
                </div>
              );
            })}
          </div>
        </article>

        <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            My Coupons
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            我的優惠券
          </h2>

          {userCoupons.length === 0 ? (
            <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center text-slate-600">
              目前尚未持有優惠券。
            </div>
          ) : (
            <div className="mt-7 grid gap-5 md:grid-cols-2">
              {userCoupons.map((coupon) => (
                <div
                  key={coupon.id}
                  className="rounded-2xl border border-sky-100 bg-sky-50 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {coupon.name}
                      </h3>

                      <p className="mt-2 text-2xl font-bold text-sky-700">
                        {formatDiscount(
                          coupon.discountRate
                        )}
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700">
                      {coupon.status === "available"
                        ? "可使用"
                        : coupon.status === "used"
                          ? "已使用"
                          : coupon.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <div className="mt-8 text-center">
          <Link
            href="/member"
            className="inline-block rounded-xl border border-slate-300 bg-white px-7 py-3 font-semibold text-slate-700"
          >
            返回會員中心
          </Link>
        </div>
      </div>
    </section>
  );
}