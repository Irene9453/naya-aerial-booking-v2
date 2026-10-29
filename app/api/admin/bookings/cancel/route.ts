
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendWaitlistPush } from "@/lib/sendWaitlistPush";

export const runtime = "nodejs";

type CancelMode =
  | "before_class"
  | "after_absent"
  | "after_compensation";

class CancelError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 409
  ) {
    super(message);
  }
}

async function requireAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new CancelError(
      "UNAUTHORIZED",
      "請先登入管理員帳號。",
      401
    );
  }

  let uid: string;

  try {
    const decoded = await adminAuth.verifyIdToken(
      authorization.substring(7)
    );
    uid = decoded.uid;
  } catch {
    throw new CancelError(
      "UNAUTHORIZED",
      "登入已失效，請重新登入。",
      401
    );
  }

  const adminSnapshot = await adminDb
    .collection("users")
    .doc(uid)
    .get();

  if (adminSnapshot.data()?.role !== "admin") {
    throw new CancelError(
      "FORBIDDEN",
      "只有管理員可以執行此操作。",
      403
    );
  }

  return uid;
}

export async function POST(request: NextRequest) {
  try {
    const adminUid = await requireAdmin(request);

    let body: Record<string, unknown>;

    try {
      const parsed: unknown = await request.json();

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("Invalid body");
      }

      body = parsed as Record<string, unknown>;
    } catch {
      throw new CancelError(
        "INVALID_BODY",
        "請求格式不正確。",
        400
      );
    }

    const bookingId =
      typeof body.bookingId === "string"
        ? body.bookingId.trim()
        : "";

    const classId =
      typeof body.classId === "string"
        ? body.classId.trim()
        : "";

    if (
      !bookingId ||
      !classId ||
      bookingId.includes("/") ||
      classId.includes("/") ||
      bookingId.length > 150 ||
      classId.length > 150
    ) {
      throw new CancelError(
        "INVALID_INPUT",
        "預約或課程資料不正確。",
        400
      );
    }

    const requestedMode = body.cancelMode;

    if (
      requestedMode !== undefined &&
      requestedMode !== "before_class" &&
      requestedMode !== "after_absent" &&
      requestedMode !== "after_compensation"
    ) {
      throw new CancelError(
        "INVALID_MODE",
        "取消方式不正確。",
        400
      );
    }

    const bookingRef = adminDb
      .collection("bookings")
      .doc(bookingId);

    const classRef = adminDb
      .collection("classes")
      .doc(classId);

    const operationId = `${bookingId}_admin_cancel`;

    const result = await adminDb.runTransaction(
      async (transaction) => {
        // 所有讀取必須在寫入之前完成
        const bookingSnapshot =
          await transaction.get(bookingRef);

        const classSnapshot =
          await transaction.get(classRef);

        if (!bookingSnapshot.exists) {
          throw new CancelError(
            "BOOKING_NOT_FOUND",
            "找不到預約紀錄。",
            404
          );
        }

        if (!classSnapshot.exists) {
          throw new CancelError(
            "CLASS_NOT_FOUND",
            "找不到課程資料。",
            404
          );
        }

        const bookingData = bookingSnapshot.data()!;
        const classData = classSnapshot.data()!;

        if (bookingData.classId !== classId) {
          throw new CancelError(
            "CLASS_MISMATCH",
            "預約與課程資料不一致。"
          );
        }

        if (bookingData.status !== "booked") {
          throw new CancelError(
            "ALREADY_CANCELLED",
            "此預約已取消或目前無法代取消。"
          );
        }

        const classStartTime = classData.startTime;

        if (!(classStartTime instanceof Timestamp)) {
          throw new CancelError(
            "INVALID_TIME",
            "課程時間設定不正確。"
          );
        }

        const isAfterStart =
          classStartTime.toMillis() <= Date.now();

        const cancelMode: CancelMode = isAfterStart
          ? requestedMode === "after_absent" ||
            requestedMode === "after_compensation"
            ? requestedMode
            : (() => {
                throw new CancelError(
                  "MODE_REQUIRED",
                  "課程已開始，請選擇課後補登取消方式。",
                  400
                );
              })()
          : "before_class";

        const userId = bookingData.userId;

        if (
          typeof userId !== "string" ||
          !userId ||
          userId.includes("/")
        ) {
          throw new CancelError(
            "USER_NOT_FOUND",
            "預約紀錄缺少正確的會員資料。"
          );
        }

        const userRef = adminDb
          .collection("users")
          .doc(userId);

        const lessonRecordRef = adminDb
          .collection("studentLessonRecords")
          .doc(`${userId}_${classId}`);

        const userSnapshot =
          await transaction.get(userRef);

        const lessonSnapshot =
          await transaction.get(lessonRecordRef);

        if (!userSnapshot.exists) {
          throw new CancelError(
            "USER_NOT_FOUND",
            "找不到會員資料。",
            404
          );
        }

        // 先讀取交易紀錄，避免覆蓋既有紀錄
        const refundTransactionRef = adminDb
          .collection("pointTransactions")
          .doc(`${operationId}_refund`);

        const notificationRef = adminDb
          .collection("notifications")
          .doc(`${operationId}_notification`);

        const refundSnapshot =
          await transaction.get(refundTransactionRef);

        if (refundSnapshot.exists) {
          throw new CancelError(
            "REFUND_EXISTS",
            "此預約已有老師退款紀錄，請先確認帳務。"
          );
        }

        const rewardGranted =
          bookingData.rewardGranted === true;

        const rewardCycle = Number(
          bookingData.rewardCycle ?? 0
        );

        const grantedPoints = Number(
          bookingData.rewardPointsGranted ?? 9
        );

        const reversalRef = adminDb
          .collection("rewardTransactions")
          .doc(
            `${bookingId}_attendance_reversal_${rewardCycle}`
          );

        // 課後未出席且已發紅利時，才需要扣回
        const shouldReverseReward =
          cancelMode === "after_absent" &&
          rewardGranted;

        const reversalSnapshot = shouldReverseReward
          ? await transaction.get(reversalRef)
          : null;

        const userData = userSnapshot.data()!;

        const pointsUsed = Number(
          bookingData.pointsUsed ?? 0
        );

        const currentPoints = Number(
          userData.points ?? 0
        );

        const currentRewardPoints = Number(
          userData.rewardPoints ?? 0
        );

        const bookedCount = Number(
          classData.bookedCount ?? 0
        );

        if (
          !Number.isSafeInteger(pointsUsed) ||
          pointsUsed <= 0 ||
          !Number.isSafeInteger(currentPoints) ||
          currentPoints < 0 ||
          !Number.isSafeInteger(bookedCount) ||
          bookedCount <= 0
        ) {
          throw new CancelError(
            "INVALID_POINTS",
            "課程點數或預約人數資料異常。"
          );
        }

        if (
          !Number.isSafeInteger(currentRewardPoints) ||
          currentRewardPoints < 0
        ) {
          throw new CancelError(
            "INVALID_REWARDS",
            "會員紅利餘額資料異常。"
          );
        }

        if (
          cancelMode === "after_compensation" &&
          (bookingData.attendanceStatus !== "present" ||
            !rewardGranted)
        ) {
          throw new CancelError(
            "NOT_PRESENT",
            "補償退點僅適用於已點名出席且已發放紅利的會員。"
          );
        }

        if (
          cancelMode === "before_class" &&
          (rewardGranted ||
            bookingData.attendanceStatus === "present")
        ) {
          throw new CancelError(
            "ATTENDANCE_CONFLICT",
            "此預約已有出席或紅利紀錄，請先確認資料。"
          );
        }

        if (shouldReverseReward) {
          if (
            !Number.isSafeInteger(rewardCycle) ||
            rewardCycle <= 0 ||
            !Number.isSafeInteger(grantedPoints) ||
            grantedPoints <= 0
          ) {
            throw new CancelError(
              "INVALID_REWARD_RECORD",
              "原紅利發放資料異常。"
            );
          }

          if (reversalSnapshot?.exists) {
            throw new CancelError(
              "REVERSAL_EXISTS",
              "紅利扣回紀錄已存在，請先確認帳務。"
            );
          }

          if (currentRewardPoints < grantedPoints) {
            throw new CancelError(
              "INSUFFICIENT_REWARDS",
              `會員目前只有 ${currentRewardPoints} 點紅利，無法扣回 ${grantedPoints} 點。請先處理紅利餘額。`
            );
          }
        }

        // 避免誤刪另一筆預約建立的上課紀錄
        if (
          cancelMode === "after_absent" &&
          lessonSnapshot.exists &&
          lessonSnapshot.data()?.bookingId !== bookingId
        ) {
          throw new CancelError(
            "LESSON_RECORD_MISMATCH",
            "上課紀錄對應其他預約，請先人工確認。"
          );
        }

        const newPointBalance =
          currentPoints + pointsUsed;

        const newBookedCount = bookedCount - 1;

        if (!Number.isSafeInteger(newPointBalance)) {
          throw new CancelError(
            "POINT_OVERFLOW",
            "退款後點數超出可處理範圍。"
          );
        }

        const courseName = String(
          bookingData.courseName ??
            classData.courseName ??
            ""
        );

        // 以下開始寫入
        transaction.update(userRef, {
          points: newPointBalance,
          ...(shouldReverseReward
            ? {
                rewardPoints:
                  currentRewardPoints - grantedPoints,
              }
            : {}),
        });

        transaction.update(classRef, {
          bookedCount: newBookedCount,
        });

        transaction.update(bookingRef, {
          status: "admin_cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          pointsRefunded: pointsUsed,
          cancelledBy: adminUid,
          cancellationSource: "admin",
          cancellationMode: cancelMode,
          ...(cancelMode === "after_absent"
            ? {
                attendanceStatus: "absent",
                attendedAt: null,
                rewardGranted: false,
                rewardPointsGranted: 0,
                ...(shouldReverseReward
                  ? {
                      rewardReversedAt:
                        FieldValue.serverTimestamp(),
                    }
                  : {}),
              }
            : {}),
        });

        transaction.create(refundTransactionRef, {
          userId,
          bookingId,
          classId,
          courseName,
          classStartTime,
          type: "admin_cancellation_refund",
          amount: pointsUsed,
          balanceAfter: newPointBalance,
          adminUid,
          cancelMode,
          createdAt: FieldValue.serverTimestamp(),
        });

        if (shouldReverseReward) {
          transaction.create(reversalRef, {
            userId,
            bookingId,
            classId,
            courseName,
            type: "attendance_reversal",
            amount: -grantedPoints,
            balanceAfter:
              currentRewardPoints - grantedPoints,
            rewardCycle,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        if (
          cancelMode === "after_absent" &&
          lessonSnapshot.exists
        ) {
          // 保留稽核軌跡，不直接刪除紀錄
          transaction.update(lessonRecordRef, {
            status: "voided",
            voidedAt: FieldValue.serverTimestamp(),
            voidedBy: adminUid,
            voidReason: "admin_after_absent",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        const notificationBody =
          cancelMode === "after_compensation"
            ? `老師已為你辦理 ${courseName} 的補償退點，退回 ${pointsUsed} 點。出席紅利與上課紀錄保留。`
            : `老師已替你取消 ${courseName}，並退回 ${pointsUsed} 點。`;

        transaction.set(notificationRef, {
          userId,
          bookingId,
          classId,
          type: "admin_cancellation",
          title:
            cancelMode === "after_compensation"
              ? "老師已辦理補償退點"
              : "老師已取消預約",
          body: notificationBody,
          courseName,
          classStartTime,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          refundedPoints: pointsUsed,
          newPointBalance,
          newBookedCount,
          cancelMode,
          rewardReversed: shouldReverseReward
            ? grantedPoints
            : 0,
          shouldNotifyWaitlist:
            cancelMode === "before_class",
        };
      }
    );

    // 只有課前取消才通知候補
    let waitlistNotifiedCount = 0;

    if (result.shouldNotifyWaitlist) {
      try {
        const latestClassSnapshot =
          await classRef.get();

        const latestClassData =
          latestClassSnapshot.data();

        const latestBookedCount = Number(
          latestClassData?.bookedCount ?? 0
        );

        const capacity = Number(
          latestClassData?.capacity ?? 0
        );

        const latestStartTime =
          latestClassData?.startTime;

        // 再確認一次課程尚未開始
        if (
          latestStartTime instanceof Timestamp &&
          latestStartTime.toMillis() > Date.now() &&
          capacity > 0 &&
          latestBookedCount < capacity
        ) {
          const waitlistSnapshot = await adminDb
            .collection("waitlists")
            .where("classId", "==", classId)
            .where("status", "==", "waiting")
            .get();

          // 每批最多 200 位候補，避免單批寫入過多
          for (
            let index = 0;
            index < waitlistSnapshot.docs.length;
            index += 200
          ) {
            const batch = adminDb.batch();

            const chunk =
              waitlistSnapshot.docs.slice(
                index,
                index + 200
              );

            for (const waitlistDoc of chunk) {
              const waitlistData =
                waitlistDoc.data();

              const waitlistUserId =
                waitlistData.userId;

              if (
                typeof waitlistUserId !== "string" ||
                !waitlistUserId
              ) {
                continue;
              }

              batch.set(
                adminDb.collection("notifications").doc(),
                {
                  userId: waitlistUserId,
                  type: "waitlist_available",
                  title: "候補課程有名額了",
                  body: `${String(
                    latestClassData?.courseName ??
                      "候補課程"
                  )} 已釋出名額，請回到預約頁查看。名額以實際完成預約者為準。`,
                  classId,
                  courseName: String(
                    latestClassData?.courseName ?? ""
                  ),
                  classStartTime: latestStartTime,
                  waitlistId: waitlistDoc.id,
                  isRead: false,
                  createdAt:
                    FieldValue.serverTimestamp(),
                }
              );

              batch.update(waitlistDoc.ref, {
                lastNotifiedAt:
                  FieldValue.serverTimestamp(),
              });

              waitlistNotifiedCount++;
            }

            if (chunk.length > 0) {
              await batch.commit();
            }
// 候補通知寫入成功後，嘗試發送推播。
// sendWaitlistPush 目前有安全鎖，不會發送正式 FCM。
for (const waitlistDoc of chunk) {
  const waitlistUserId = waitlistDoc.data().userId;

  if (
    typeof waitlistUserId !== "string" ||
    !waitlistUserId
  ) {
    continue;
  }

  try {
    await sendWaitlistPush(
      waitlistUserId,
      String(latestClassData?.courseName ?? "候補課程")
    );
  } catch (pushError) {
    console.error(
      "[Naya Push] 老師代取消後候補推播失敗：",
      pushError
    );
  }
}
          }
        }
      } catch (waitlistError) {
        // 退款已成功，不應回報整個取消失敗
        console.error(
          "老師代取消後候補通知失敗：",
          waitlistError
        );
      }
    }

    return NextResponse.json({
      success: true,
      refundedPoints: result.refundedPoints,
      newPointBalance: result.newPointBalance,
      newBookedCount: result.newBookedCount,
      cancelMode: result.cancelMode,
      rewardReversed: result.rewardReversed,
      waitlistNotifiedCount,
    });
  } catch (error: unknown) {
    console.error("老師代取消預約失敗：", error);

    if (error instanceof CancelError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: "老師代取消失敗，請稍後再試。" },
      { status: 500 }
    );
  }
}
