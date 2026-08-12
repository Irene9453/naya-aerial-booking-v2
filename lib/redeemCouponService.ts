import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type RedeemCouponParams = {
  userId: string;
  couponId: string;
};

export async function redeemCoupon({
  userId,
  couponId,
}: RedeemCouponParams) {
  const userRef = doc(db, "users", userId);
  const couponRef = doc(db, "coupons", couponId);

  const redemptionId = `${userId}_${couponId}_${Date.now()}`;

  const userCouponRef = doc(
    db,
    "userCoupons",
    redemptionId
  );

  const rewardTransactionRef = doc(
    db,
    "rewardTransactions",
    `${redemptionId}_redeem`
  );

  return runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const couponSnapshot = await transaction.get(couponRef);

    if (!userSnapshot.exists()) {
      throw new Error("找不到會員資料");
    }

    if (!couponSnapshot.exists()) {
      throw new Error("找不到優惠券資料");
    }

    const userData = userSnapshot.data();
    const couponData = couponSnapshot.data();

    if (couponData.isActive !== true) {
      throw new Error("這張優惠券目前無法兌換");
    }

    if (couponData.type !== "reward") {
      throw new Error("這張優惠券不是紅利兌換券");
    }

    const currentRewardPoints = Number(
      userData.rewardPoints ?? 0
    );

    const rewardCost = Number(
      couponData.rewardCost ?? 0
    );

    if (!Number.isInteger(rewardCost) || rewardCost <= 0) {
      throw new Error("優惠券兌換點數設定不正確");
    }

    if (currentRewardPoints < rewardCost) {
      throw new Error(
        `紅利不足，尚差 ${rewardCost - currentRewardPoints} 點`
      );
    }

    const newRewardBalance =
      currentRewardPoints - rewardCost;

    transaction.update(userRef, {
      rewardPoints: newRewardBalance,
    });

    transaction.set(userCouponRef, {
      userId,
      couponId,
      name: String(couponData.name ?? ""),
      type: "reward",
      discountRate: Number(
        couponData.discountRate ?? 1
      ),
      status: "available",
      rewardCost,
      issuedAt: serverTimestamp(),
      usedAt: null,
      purchaseRequestId: null,
    });

    transaction.set(rewardTransactionRef, {
      userId,
      couponId,
      userCouponId: redemptionId,
      type: "coupon_redemption",
      amount: -rewardCost,
      balanceAfter: newRewardBalance,
      couponName: String(couponData.name ?? ""),
      createdAt: serverTimestamp(),
    });

    return {
      couponName: String(couponData.name ?? ""),
      rewardCost,
      newRewardBalance,
    };
  });
}