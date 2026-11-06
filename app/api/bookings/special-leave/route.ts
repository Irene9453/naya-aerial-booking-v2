
import { NextRequest, NextResponse } from "next/server";
import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function getTaipeiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value;

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  if (!year || !month || !day) {
    throw new Error("無法計算取消期限");
  }

  return { year, month, day };
}

function getClassDayStart(classStartTime: Timestamp) {
  const { year, month, day } =
    getTaipeiDateParts(classStartTime.toDate());

  return new Date(
    `${year}-${month}-${day}T00:00:00+08:00`
  );
}

function getHalfYearKey(date: Date) {
  const { year, month } = getTaipeiDateParts(date);

  const periodYear = Number(year);
  const periodHalf = Number(month) <= 6 ? 1 : 2;

  return {
    periodYear,
    periodHalf,
    periodKey: `${periodYear}-H${periodHalf}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authorization =
      request.headers.get("authorization");

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

    const bookingId = params.bookingId;
    const classId = params.classId;

    if (
      typeof bookingId !== "string" ||
      typeof classId !== "string" ||
      !classId.trim() ||
      classId.includes("/") ||
      bookingId !== `${userId}_${classId}`
    ) {
      return NextResponse.json(
        { error: "預約資料不正確" },
        { status: 400 }
      );
    }

    const now = new Date();

    const { periodYear, periodHalf, periodKey } =
      getHalfYearKey(now);

    const userRef = adminDb
      .collection("users")
      .doc(userId);

    const bookingRef = adminDb
      .collection("bookings")
      .doc(bookingId);

    const classRef = adminDb
      .collection("classes")
      .doc(classId);

    const specialLeaveRef = adminDb
      .collection("specialLeaveRecords")
      .doc(`${userId}_${periodKey}`);

    const refundRef = adminDb
      .collection("pointTransactions")
      .doc(`${bookingId}_special_leave_refund`);

    const notificationRef = adminDb
      .collection("notifications")
      .doc(`${bookingId}_special_leave`);

    // NAYA_TRIAL_REFUND_V1: voucher refund shares the same transaction as cancellation.
    const result = await adminDb.runTransaction(
      async (tx) => {
        // Firestore transaction：先完成所有讀取
        const userSnap = await tx.get(userRef);
        const bookingSnap = await tx.get(bookingRef);
        const isTrialVoucher = bookingSnap.data()?.paymentType === "trial_voucher";
        const trialVoucherId = bookingSnap.data()?.trialVoucherId;
        if (isTrialVoucher && (typeof trialVoucherId !== "string" || trialVoucherId.includes("/") || !trialVoucherId)) {
          throw new Error("體驗券預約資料不正確");
        }
        const voucherRef = isTrialVoucher ? adminDb.collection("trialVouchers").doc(trialVoucherId) : null;
        const voucherSnap = voucherRef ? await tx.get(voucherRef) : null;
        const classSnap = await tx.get(classRef);
        const specialLeaveSnap = await tx.get(
          specialLeaveRef
        );

        if (!userSnap.exists) {
          throw new Error("找不到會員資料");
        }

        if (!bookingSnap.exists) {
          throw new Error("找不到預約紀錄");
        }

        if (!classSnap.exists) {
          throw new Error("找不到課程資料");
        }

        const userData = userSnap.data()!;
        const bookingData = bookingSnap.data()!;
        const classData = classSnap.data()!;

        if (
          bookingData.userId !== userId ||
          bookingData.classId !== classId
        ) {
          throw new Error(
            "你無權使用此筆預約的特殊請假"
          );
        }

        if (bookingData.status !== "booked") {
          throw new Error(
            "此預約目前無法使用特殊請假"
          );
        }

        const override = userData.specialLeaveOverrides?.[periodKey];
        const validRevision = Number.isSafeInteger(override?.revision) && override.revision > 0;
        const manuallyAvailable = override?.status === "available" && validRevision;
        const originallyUsed = specialLeaveSnap.exists &&
          specialLeaveSnap.data()?.status === "approved";

        if (override?.status === "blocked" || (originallyUsed && !manuallyAvailable)) {
          throw new Error(
            `你已使用 ${periodYear} 年${
              periodHalf === 1 ? "上半年" : "下半年"
            }的特殊請假額度。`
          );
        }

        // A restored quota is recorded separately, preserving all original
        // refunds and historical special leave records for auditing.
        const restoredLeaveRef = originallyUsed && manuallyAvailable
          ? adminDb.collection("specialLeaveRecords")
              .doc(`${userId}_${periodKey}_manual_${override.revision}`)
          : null;
        const restoredLeaveSnap = restoredLeaveRef
          ? await tx.get(restoredLeaveRef)
          : null;
        if (restoredLeaveSnap?.exists) {
          throw new Error("此筆恢復額度已使用，請重新整理。");
        }

        if (
          !(classData.startTime instanceof Timestamp)
        ) {
          throw new Error("課程時間設定不正確");
        }

        const classStartTime: Timestamp =
          classData.startTime;

        const currentTime = new Date();

        if (
          currentTime.getTime() >=
          classStartTime.toMillis()
        ) {
          throw new Error(
            "課程已開始，無法使用特殊請假。"
          );
        }

        const classDayStart =
          getClassDayStart(classStartTime);

        if (
          currentTime.getTime() <
          classDayStart.getTime()
        ) {
          throw new Error(
            "目前仍在一般取消期限內，請直接使用取消預約，不需要使用特殊請假額度。"
          );
        }

        const bookedCount = Number(
          classData.bookedCount ?? 0
        );

        if (
          !Number.isInteger(bookedCount) ||
          bookedCount < 0
        ) {
          throw new Error("課程預約人數資料異常");
        }

        if (bookedCount <= 3) {
          throw new Error(
            "此堂課目前預約人數為 3 人以下，無法使用特殊請假。"
          );
        }

        const pointsUsed = Number(
          bookingData.pointsUsed ?? 0
        );

        const currentPoints = Number(
          userData.points ?? 0
        );

        if (
          !Number.isFinite(pointsUsed) ||
          (isTrialVoucher ? pointsUsed !== 0 : pointsUsed <= 0) ||
          !Number.isFinite(currentPoints) ||
          currentPoints < 0
        ) {
          throw new Error("預約點數資料不正確");
        }

        if (isTrialVoucher && (
          !voucherSnap?.exists || voucherSnap.data()?.userId !== userId ||
          voucherSnap.data()?.bookingId !== bookingId ||
          voucherSnap.data()?.status !== "used" || voucherSnap.data()?.quantity !== 0 ||
          trialVoucherId !== `new_student_${userId}_${bookingData.trialOfferId}`
        )) throw new Error("體驗券狀態不正確，無法退還");

        const newPointBalance = currentPoints + pointsUsed;

        const newBookedCount = bookedCount - 1;

        const courseName = String(
          bookingData.courseName ??
            classData.courseName ??
            ""
        );

        const studentName = String(
          userData.name ?? ""
        );

        // 退還點數或體驗券；手動額度也在同一個 transaction 內消耗。
        const memberUpdates: Record<string, unknown> = {};
        if (voucherRef) {
          tx.update(voucherRef, { status: "available", quantity: 1, bookingId: null, usedAt: null, refundedAt: FieldValue.serverTimestamp() });
        } else {
          memberUpdates.points = newPointBalance;
        }
        if (manuallyAvailable) {
          memberUpdates[`specialLeaveOverrides.${periodKey}.status`] = "consumed";
          memberUpdates[`specialLeaveOverrides.${periodKey}.consumedAt`] = FieldValue.serverTimestamp();
        }
        if (Object.keys(memberUpdates).length > 0) tx.update(userRef, memberUpdates);

        // 釋出課程名額
        tx.update(classRef, {
          bookedCount: newBookedCount,
        });

        // 預約狀態改為特殊請假
        tx.update(bookingRef, {
          status: "special_leave",
          specialLeaveAt:
            FieldValue.serverTimestamp(),
          pointsRefunded: pointsUsed,
          trialVoucherRefunded: isTrialVoucher,
        });

        // 半年一次的特殊請假紀錄
        tx.set(restoredLeaveRef ?? specialLeaveRef, {
          userId,
          studentName,
          bookingId,
          classId,
          courseName,
          classStartTime,
          periodYear,
          periodHalf,
          periodKey,
          reason: "特殊請假",
          manualQuotaRevision: restoredLeaveRef ? override.revision : null,
          pointsRefunded: pointsUsed,
          bookedCountBefore: bookedCount,
          refunded: true,
          status: "approved",
          usedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });

        // 退點交易
        tx.set(refundRef, {
          userId,
          bookingId,
          classId,
          courseName,
          classStartTime,
          type: isTrialVoucher ? "trial_voucher_special_leave_refund" : "special_leave_refund",
          trialVoucherId: isTrialVoucher ? trialVoucherId : null,
          amount: pointsUsed,
          balanceAfter: newPointBalance,
          createdAt: FieldValue.serverTimestamp(),
        });

        // 會員通知
        tx.set(notificationRef, {
          userId,
          bookingId,
          classId,
          type: "special_leave",
          title: "特殊請假成功",
          body: `已完成 ${courseName} 的特殊請假，${isTrialVoucher ? "體驗券已退回" : `並退回 ${pointsUsed} 點`}。`,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          refundedPoints: pointsUsed,
          trialVoucherRefunded: isTrialVoucher,
          newPointBalance,
          periodYear,
          periodHalf,
          periodKey,
        };
      }
    );

    // 特殊請假完成後通知候補會員
    // 使用既有通知 API，保留原本的通知規則
    let waitlistNotificationWarning = false;

    try {
      const notifyResponse = await fetch(
        new URL("/api/waitlists/notify", request.url),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authorization,
          },
          body: JSON.stringify({ classId }),
        }
      );

      if (!notifyResponse.ok) {
        waitlistNotificationWarning = true;

        console.error(
          "特殊請假成功，但候補通知 API 回傳錯誤：",
          notifyResponse.status,
          await notifyResponse.text()
        );
      }
    } catch (notifyError) {
      waitlistNotificationWarning = true;

      console.error(
        "特殊請假成功，但候補通知失敗：",
        notifyError
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      waitlistNotificationWarning,
    });
  } catch (error) {
    console.error("特殊請假 API 錯誤：", error);

    const message =
      error instanceof Error
        ? error.message
        : "特殊請假失敗";

    const knownErrors = [
      "找不到會員資料",
      "找不到預約紀錄",
      "找不到課程資料",
      "你無權使用此筆預約的特殊請假",
      "此預約目前無法使用特殊請假",
      "無法計算取消期限",
      "課程時間設定不正確",
      "課程已開始，無法使用特殊請假。",
      "目前仍在一般取消期限內，請直接使用取消預約，不需要使用特殊請假額度。",
      "課程預約人數資料異常",
      "此堂課目前預約人數為 3 人以下，無法使用特殊請假。",
      "預約點數資料不正確",
      "體驗券預約資料不正確",
      "體驗券狀態不正確，無法退還",
    ];

    const isQuotaError =
      message.startsWith("你已使用") &&
      message.includes("的特殊請假額度");

    const isKnownError =
      knownErrors.includes(message) || isQuotaError;

    return NextResponse.json(
      {
        error: isKnownError
          ? message
          : "特殊請假處理失敗，請稍後再試",
      },
      {
        status: isKnownError ? 400 : 500,
      }
    );
  }
}
