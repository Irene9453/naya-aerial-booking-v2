
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "請先登入會員" },
        { status: 401 }
      );
    }

    let userId: string;

    try {
      const decodedToken = await adminAuth.verifyIdToken(
        authorization.slice(7)
      );
      userId = decodedToken.uid;
    } catch {
      return NextResponse.json(
        { error: "登入已失效，請重新登入" },
        { status: 401 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "請求格式不正確" },
        { status: 400 }
      );
    }

    const params =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};

    const couponId = params.couponId;

    if (
      typeof couponId !== "string" ||
      !couponId.trim() ||
      couponId.includes("/")
    ) {
      return NextResponse.json(
        { error: "優惠券資料不正確" },
        { status: 400 }
      );
    }

    const userRef = adminDb.collection("users").doc(userId);
    const couponRef = adminDb.collection("coupons").doc(couponId);

    const redemptionId = `${userId}_${couponId}_${crypto.randomUUID()}`;

    const userCouponRef = adminDb
      .collection("userCoupons")
      .doc(redemptionId);

    const rewardTransactionRef = adminDb
      .collection("rewardTransactions")
      .doc(`${redemptionId}_redeem`);

    const result = await adminDb.runTransaction(async (tx) => {
      const userSnapshot = await tx.get(userRef);
      const couponSnapshot = await tx.get(couponRef);

      if (!userSnapshot.exists) {
        throw new Error("找不到會員資料");
      }

      if (!couponSnapshot.exists) {
        throw new Error("找不到優惠券資料");
      }

      const userData = userSnapshot.data()!;
      const couponData = couponSnapshot.data()!;

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

      if (
        !Number.isSafeInteger(currentRewardPoints) ||
        currentRewardPoints < 0
      ) {
        throw new Error("會員紅利資料不正確");
      }

      if (
        !Number.isSafeInteger(rewardCost) ||
        rewardCost <= 0
      ) {
        throw new Error("優惠券兌換點數設定不正確");
      }

      if (currentRewardPoints < rewardCost) {
        throw new Error(
          `紅利不足，尚差 ${rewardCost - currentRewardPoints} 點`
        );
      }

      const discountRate = Number(
        couponData.discountRate ?? 1
      );

      if (
        !Number.isFinite(discountRate) ||
        discountRate <= 0 ||
        discountRate > 1
      ) {
        throw new Error("優惠券折扣設定不正確");
      }

      const newRewardBalance =
        currentRewardPoints - rewardCost;

      const couponName = String(couponData.name ?? "");

      tx.update(userRef, {
        rewardPoints: newRewardBalance,
      });

      tx.create(userCouponRef, {
        userId,
        couponId,
        name: couponName,
        type: "reward",
        discountRate,
        status: "available",
        rewardCost,
        issuedAt: FieldValue.serverTimestamp(),
        usedAt: null,
        purchaseRequestId: null,
      });

      tx.create(rewardTransactionRef, {
        userId,
        couponId,
        userCouponId: redemptionId,
        type: "coupon_redemption",
        amount: -rewardCost,
        balanceAfter: newRewardBalance,
        couponName,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        couponName,
        rewardCost,
        newRewardBalance,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("紅利兌換 API 錯誤：", error);

    const message =
      error instanceof Error
        ? error.message
        : "兌換優惠券失敗";

    const knownErrors = [
      "找不到會員資料",
      "找不到優惠券資料",
      "這張優惠券目前無法兌換",
      "這張優惠券不是紅利兌換券",
      "會員紅利資料不正確",
      "優惠券兌換點數設定不正確",
      "優惠券折扣設定不正確",
    ];

    const isInsufficientPoints =
      message.startsWith("紅利不足，尚差");

    const isKnownError =
      knownErrors.includes(message) ||
      isInsufficientPoints;

    return NextResponse.json(
      {
        error: isKnownError
          ? message
          : "兌換優惠券失敗，請稍後再試",
      },
      { status: isKnownError ? 400 : 500 }
    );
  }
}
