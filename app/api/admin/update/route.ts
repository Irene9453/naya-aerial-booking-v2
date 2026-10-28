
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const ATTENDANCE_REWARD_POINTS = 9;

type AttendanceStatus = "present" | "absent" | null;

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      throw new ApiError("請先登入管理員帳號", 401);
    }

    let adminId: string;

    try {
      const decoded = await adminAuth.verifyIdToken(
        authorization.slice(7)
      );
      adminId = decoded.uid;
    } catch {
      throw new ApiError("登入已失效，請重新登入", 401);
    }

    const adminSnapshot = await adminDb
      .collection("users")
      .doc(adminId)
      .get();

    if (
      !adminSnapshot.exists ||
      adminSnapshot.data()?.role !== "admin"
    ) {
      throw new ApiError("你沒有管理員權限", 403);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ApiError("請求格式不正確");
    }

    if (!body || typeof body !== "object") {
      throw new ApiError("請求資料不正確");
    }

    const params = body as Record<string, unknown>;
    const bookingId = params.bookingId;
    const status = params.status;

    if (
      typeof bookingId !== "string" ||
      !bookingId.trim() ||
      bookingId.includes("/") ||
      bookingId.length > 150
    ) {
      throw new ApiError("預約編號不正確");
    }

    if (
      status !== "present" &&
      status !== "absent" &&
      status !== null
    ) {
      throw new ApiError("點名狀態不正確");
    }

    const nextStatus = status as AttendanceStatus;

    const bookingRef = adminDb
      .collection("bookings")
      .doc(bookingId);

    const result = await adminDb.runTransaction(async (tx) => {
      const bookingSnapshot = await tx.get(bookingRef);

      if (!bookingSnapshot.exists) {
        throw new ApiError("找不到預約紀錄", 404);
      }

      const bookingData = bookingSnapshot.data()!;

      if (bookingData.status !== "booked") {
        throw new ApiError(
          "只有目前有效的預約可以進行點名"
        );
      }

      const userId = bookingData.userId;

      if (
        typeof userId !== "string" ||
        !userId ||
        userId.includes("/")
      ) {
        throw new ApiError("預約紀錄缺少正確的會員資料");
      }

      const userRef = adminDb
        .collection("users")
        .doc(userId);

      const userSnapshot = await tx.get(userRef);

      if (!userSnapshot.exists) {
        throw new ApiError("找不到會員資料", 404);
      }

      const userData = userSnapshot.data()!;

      const currentRewardPoints = Number(
        userData.rewardPoints ?? 0
      );

      if (
        !Number.isSafeInteger(currentRewardPoints) ||
        currentRewardPoints < 0
      ) {
        throw new ApiError("會員紅利餘額資料不正確");
      }

      const rewardGranted =
        bookingData.rewardGranted === true;

      const currentRewardCycle = Number(
        bookingData.rewardCycle ?? 0
      );

      if (
        !Number.isSafeInteger(currentRewardCycle) ||
        currentRewardCycle < 0
      ) {
        throw new ApiError("紅利發放次數資料不正確");
      }

      const classId = String(
        bookingData.classId ?? ""
      );

      const courseName = String(
        bookingData.courseName ?? ""
      );

      // 已到且尚未發放紅利
      if (nextStatus === "present" && !rewardGranted) {
        const nextRewardCycle =
          currentRewardCycle + 1;

        const newRewardBalance =
          currentRewardPoints + ATTENDANCE_REWARD_POINTS;

        if (
          !Number.isSafeInteger(nextRewardCycle) ||
          !Number.isSafeInteger(newRewardBalance)
        ) {
          throw new ApiError("紅利數值超出可處理範圍");
        }

        const rewardTransactionRef = adminDb
          .collection("rewardTransactions")
          .doc(
            `${bookingId}_attendance_grant_${nextRewardCycle}`
          );

        // 確認交易紀錄不存在，避免覆蓋歷史
        const existingRewardTransaction =
          await tx.get(rewardTransactionRef);

        if (existingRewardTransaction.exists) {
          throw new ApiError(
            "紅利發放紀錄已存在，請先檢查交易紀錄",
            409
          );
        }

        tx.update(userRef, {
          rewardPoints: newRewardBalance,
        });

        tx.update(bookingRef, {
          attendanceStatus: "present",
          attendedAt: FieldValue.serverTimestamp(),
          rewardGranted: true,
          rewardPointsGranted:
            ATTENDANCE_REWARD_POINTS,
          rewardGrantedAt: FieldValue.serverTimestamp(),
          rewardCycle: nextRewardCycle,
        });

        tx.create(rewardTransactionRef, {
          userId,
          bookingId,
          classId,
          courseName,
          type: "attendance",
          amount: ATTENDANCE_REWARD_POINTS,
          balanceAfter: newRewardBalance,
          rewardCycle: nextRewardCycle,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          status: nextStatus,
          rewardChange: ATTENDANCE_REWARD_POINTS,
          newRewardBalance,
        };
      }

      // 原本已到且已發紅利，改為缺席或清除
      if (nextStatus !== "present" && rewardGranted) {
        const grantedPoints = Number(
          bookingData.rewardPointsGranted ??
            ATTENDANCE_REWARD_POINTS
        );

        if (
          !Number.isSafeInteger(grantedPoints) ||
          grantedPoints <= 0
        ) {
          throw new ApiError("原紅利發放資料不正確");
        }

        if (currentRewardPoints < grantedPoints) {
          throw new ApiError(
            `會員目前只有 ${currentRewardPoints} 點紅利，無法扣回 ${grantedPoints} 點。請先處理紅利餘額，再更正點名。`
          );
        }

        const newRewardBalance =
          currentRewardPoints - grantedPoints;

        const reversalTransactionRef = adminDb
          .collection("rewardTransactions")
          .doc(
            `${bookingId}_attendance_reversal_${currentRewardCycle}`
          );

        const existingReversal =
          await tx.get(reversalTransactionRef);

        if (existingReversal.exists) {
          throw new ApiError(
            "紅利扣回紀錄已存在，請先檢查交易紀錄",
            409
          );
        }

        tx.update(userRef, {
          rewardPoints: newRewardBalance,
        });

        tx.update(bookingRef, {
          attendanceStatus: nextStatus,
          attendedAt: null,
          rewardGranted: false,
          rewardPointsGranted: 0,
          rewardReversedAt: FieldValue.serverTimestamp(),
        });

        tx.create(reversalTransactionRef, {
          userId,
          bookingId,
          classId,
          courseName,
          type: "attendance_reversal",
          amount: -grantedPoints,
          balanceAfter: newRewardBalance,
          rewardCycle: currentRewardCycle,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          status: nextStatus,
          rewardChange: -grantedPoints,
          newRewardBalance,
        };
      }

      // 不涉及紅利的點名更新
      tx.update(bookingRef, {
        attendanceStatus: nextStatus,
        attendedAt:
          nextStatus === "present"
            ? FieldValue.serverTimestamp()
            : null,
      });

      return {
        status: nextStatus,
        rewardChange: 0,
        newRewardBalance: currentRewardPoints,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("點名紅利 API 錯誤：", error);

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: "點名處理失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
