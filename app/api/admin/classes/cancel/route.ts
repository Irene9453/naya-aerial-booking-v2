import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

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
    throw new CancelError("UNAUTHORIZED", "請先登入管理員帳號。", 401);
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(authorization.slice(7));
  } catch {
    throw new CancelError("UNAUTHORIZED", "登入已失效，請重新登入。", 401);
  }

  const adminSnapshot = await adminDb.collection("users").doc(decoded.uid).get();

  if (!adminSnapshot.exists || adminSnapshot.data()?.role !== "admin") {
    throw new CancelError("FORBIDDEN", "只有管理員可以執行此操作。", 403);
  }

  return decoded.uid;
}

export async function POST(request: NextRequest) {
  try {
    const adminUid = await requireAdmin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new CancelError("INVALID_BODY", "請求格式不正確。", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new CancelError("INVALID_BODY", "請求格式不正確。", 400);
    }

    const classId = (body as Record<string, unknown>).classId;

    if (
      typeof classId !== "string" ||
      !classId.trim() ||
      classId.includes("/") ||
      classId.length > 150
    ) {
      throw new CancelError("INVALID_INPUT", "課程資料不正確。", 400);
    }

    const classRef = adminDb.collection("classes").doc(classId);

    const result = await adminDb.runTransaction(async (tx) => {
      // 第一階段：先完成所有讀取，之後才開始寫入。
      const classSnapshot = await tx.get(classRef);

      if (!classSnapshot.exists) {
        throw new CancelError("CLASS_NOT_FOUND", "找不到課程資料。", 404);
      }

      const classData = classSnapshot.data()!;
      const startTime = classData.startTime;

      if (!(startTime instanceof Timestamp)) {
        throw new CancelError("INVALID_TIME", "課程時間設定不正確。");
      }

      // 嚴格限制：開始時間等於或早於現在，一律不可整堂取消。
      if (startTime.toMillis() <= Date.now()) {
        throw new CancelError(
          "CLASS_ALREADY_STARTED",
          "課程已開始或已到開始時間，無法整堂取消。"
        );
      }

      if (classData.status !== "open") {
        throw new CancelError(
          "CLASS_NOT_OPEN",
          "課程已關閉或取消，不能重複執行整堂取消。"
        );
      }

      const bookingQuery = adminDb
        .collection("bookings")
        .where("classId", "==", classId)
        .where("status", "==", "booked");

      const bookingSnapshot = await tx.get(bookingQuery);
      const activeBookings = bookingSnapshot.docs;

      if (activeBookings.length > 50) {
        throw new CancelError(
          "TOO_MANY_BOOKINGS",
          "有效預約數量超出單次安全處理範圍，請聯絡系統管理員。"
        );
      }

      const entries: Array<{
        bookingRef: FirebaseFirestore.DocumentReference;
        bookingData: FirebaseFirestore.DocumentData;
        userRef: FirebaseFirestore.DocumentReference;
        userData: FirebaseFirestore.DocumentData;
        refundRef: FirebaseFirestore.DocumentReference;
        notificationRef: FirebaseFirestore.DocumentReference;
        pointsUsed: number;
        newBalance: number;
        userId: string;
        bookingId: string;
      }> = [];

      // 同一會員不得有多筆有效預約，避免重複退款或帳務異常
      const seenUserIds = new Set<string>();

      // 先讀取全部會員、退款交易及通知文件。
      for (const bookingDoc of activeBookings) {
        const bookingData = bookingDoc.data();
        const bookingId = bookingDoc.id;
        const userId = bookingData.userId;

        if (
          bookingData.classId !== classId ||
          typeof userId !== "string" ||
          !userId ||
          userId.includes("/")
        ) {
          throw new CancelError(
            "INVALID_BOOKING",
            `預約 ${bookingId} 的會員或課程資料異常，已停止整堂取消。`
          );
        }

        if (seenUserIds.has(userId)) {
          throw new CancelError(
            "DUPLICATE_USER_BOOKINGS",
            `會員 ${userId} 在同一堂課有多筆有效預約，請先人工核對。`
          );
        }
        seenUserIds.add(userId);

        const pointsUsed = bookingData.pointsUsed;
        if (
          typeof pointsUsed !== "number" ||
          !Number.isSafeInteger(pointsUsed) ||
          pointsUsed <= 0
        ) {
          throw new CancelError(
            "INVALID_POINTS",
            `預約 ${bookingId} 的扣點資料異常，已停止整堂取消。`
          );
        }

        const userRef = adminDb.collection("users").doc(userId);
        const refundRef = adminDb.collection("pointTransactions")
          .doc(`${bookingId}_whole_class_cancel_refund`);
        const notificationRef = adminDb.collection("notifications")
          .doc(`${bookingId}_whole_class_cancel_notification`);

        const [userSnapshot, refundSnapshot] = await Promise.all([
          tx.get(userRef),
          tx.get(refundRef),
        ]);

        if (!userSnapshot.exists) {
          throw new CancelError(
            "USER_NOT_FOUND",
            `找不到會員 ${userId}，已停止整堂取消。`
          );
        }

        if (refundSnapshot.exists) {
          throw new CancelError(
            "REFUND_EXISTS",
            `預約 ${bookingId} 已有整堂取消退款紀錄，請先人工核帳。`
          );
        }

        const userData = userSnapshot.data()!;
        const currentPoints = userData.points;

        if (
          typeof currentPoints !== "number" ||
          !Number.isSafeInteger(currentPoints) ||
          currentPoints < 0
        ) {
          throw new CancelError(
            "INVALID_BALANCE",
            `會員 ${userId} 的點數餘額異常，已停止整堂取消。`
          );
        }

        const newBalance = currentPoints + pointsUsed;

        if (!Number.isSafeInteger(newBalance)) {
          throw new CancelError(
            "POINT_OVERFLOW",
            `會員 ${userId} 退款後點數超出安全範圍。`
          );
        }

        entries.push({
          bookingRef: bookingDoc.ref,
          bookingData,
          userRef,
          userData,
          refundRef,
          notificationRef,
          pointsUsed,
          newBalance,
          userId,
          bookingId,
        });
      }

      // 預約人數也必須合理，避免錯誤覆蓋既有資料。
      const bookedCount = classData.bookedCount;
      if (
        typeof bookedCount !== "number" ||
        !Number.isSafeInteger(bookedCount) ||
        bookedCount < 0 ||
        bookedCount < activeBookings.length
      ) {
        throw new CancelError(
          "INVALID_BOOKED_COUNT",
          "課程預約人數與有效預約紀錄不一致，已停止取消，請先人工核對。"
        );
      }

      // 讀取所有仍在候補中的會員
      const waitlistQuery = adminDb
        .collection("waitlists")
        .where("classId", "==", classId)
        .where("status", "==", "waiting");

      const waitlistSnapshot = await tx.get(waitlistQuery);

      if (waitlistSnapshot.size > 50) {
        throw new CancelError(
          "TOO_MANY_WAITLISTS",
          "候補人數超出單次安全處理範圍，請聯絡系統管理員。"
        );
      }

      // 第二階段：所有驗證通過後，才開始寫入。
      for (const entry of entries) {
        const courseName = String(
          entry.bookingData.courseName ?? classData.courseName ?? ""
        );

        tx.update(entry.userRef, {
          points: entry.newBalance,
        });

        tx.update(entry.bookingRef, {
          status: "admin_cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          pointsRefunded: entry.pointsUsed,
          cancelledBy: adminUid,
          cancellationSource: "admin",
          cancellationMode: "whole_class",
          wholeClassCancelled: true,
          wholeClassCancelledAt: FieldValue.serverTimestamp(),
        });

        tx.create(entry.refundRef, {
          userId: entry.userId,
          bookingId: entry.bookingId,
          classId,
          courseName,
          classStartTime: startTime,
          type: "admin_whole_class_cancellation_refund",
          amount: entry.pointsUsed,
          balanceAfter: entry.newBalance,
          adminUid,
          cancelMode: "whole_class",
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.create(entry.notificationRef, {
          userId: entry.userId,
          bookingId: entry.bookingId,
          classId,
          type: "admin_whole_class_cancellation",
          title: "課程已取消",
          body: `${courseName || "你預約的課程"} 已由老師整堂取消，已退還 ${entry.pointsUsed} 點。`,
          courseName,
          classStartTime: startTime,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // 整堂取消後，所有等待中的候補一併取消
      for (const waitlistDoc of waitlistSnapshot.docs) {
        tx.update(waitlistDoc.ref, {
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          cancelledBy: adminUid,
          cancellationSource: "whole_class",
        });
      }

      tx.update(classRef, {
        bookedCount: 0,
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: adminUid,
        cancellationMode: "whole_class",
        cancellationRefundCount: entries.length,
        cancellationRefundPoints: entries.reduce(
          (sum, entry) => sum + entry.pointsUsed,
          0
        ),
      });

      return {
        classId,
        cancelledBookings: entries.length,
        refundedPoints: entries.reduce(
          (sum, entry) => sum + entry.pointsUsed,
          0
        ),
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("整堂課程取消失敗：", error);

    if (error instanceof CancelError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: "整堂取消失敗，請檢查系統紀錄後再試。" },
      { status: 500 }
    );
  }
}
