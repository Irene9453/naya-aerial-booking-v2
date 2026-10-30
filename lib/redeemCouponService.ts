
import { auth } from "@/lib/firebase";

type RedeemCouponParams = {
  userId: string;
  couponId: string;
};

export async function redeemCoupon({
  userId,
  couponId,
}: RedeemCouponParams) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("請先登入會員");
  }

  if (currentUser.uid !== userId) {
    throw new Error("會員身分不符");
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch("/api/rewards/redeem", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      couponId,
    }),
  });

  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "紅利兌換 API 回傳格式不正確，請確認 API 檔案位置。"
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ?? "兌換優惠券失敗，請稍後再試"
    );
  }

  return {
    couponName: data.couponName as string,
    rewardCost: data.rewardCost as number,
    newRewardBalance: data.newRewardBalance as number,
  };
}
