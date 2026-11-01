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
      const [classSnapshot, adminSnapshot] = await Promise.all([
        tx.get(classRef),
        tx.get(adminDb.collection("users").doc(adminUid)),
      ]);
      if (adminSnapshot.data()?.role !== "admin") {
        throw new CancelError("FORBIDDEN", "管理員權限已變更，請重新登入。", 403);
      }

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
        .where("classId", "==", classId);

      const bookingSnapshot = await tx.get(bookingQuery);
      // 單欄查詢不依賴正式站另行建立複合索引；狀態仍在交易快照內篩選。
      const activeBookings = bookingSnapshot.docs.filter(doc => doc.data().status === "booked");

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
        paymentType: "points" | "trial_voucher";
        voucherRef: FirebaseFirestore.DocumentReference | null;
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

        const paymentType = bookingData.paymentType === "trial_voucher"
          ? "trial_voucher" as const
          : bookingData.paymentType == null || bookingData.paymentType === "points"
            ? "points" as const
            : null;
        if (!paymentType) {
          throw new CancelError("INVALID_PAYMENT_TYPE", `預約 ${bookingId} 的使用權益不正確。`);
        }
        const pointsUsed = bookingData.pointsUsed;
        if (
          typeof pointsUsed !== "number" ||
          !Number.isSafeInteger(pointsUsed) ||
          (paymentType === "points" && pointsUsed <= 0) ||
          (paymentType === "trial_voucher" && pointsUsed !== 0)
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

        const voucherId = bookingData.trialVoucherId;
        if (paymentType === "trial_voucher" &&
            (typeof voucherId !== "string" || !voucherId || voucherId.includes("/"))) {
          throw new CancelError("INVALID_VOUCHER", `預約 ${bookingId} 缺少有效體驗券資料。`);
        }
        const voucherRef = paymentType === "trial_voucher"
          ? adminDb.collection("trialVouchers").doc(voucherId as string)
          : null;
        const [userSnapshot, refundSnapshot, voucherSnapshot] = await Promise.all([
          tx.get(userRef),
          tx.get(refundRef),
          voucherRef ? tx.get(voucherRef) : Promise.resolve(null),
        ]);
        if (voucherRef && (!voucherSnapshot?.exists ||
            voucherSnapshot.data()?.userId !== userId ||
            voucherSnapshot.data()?.status !== "used" ||
            voucherSnapshot.data()?.bookingId !== bookingId)) {
          throw new CancelError("VOUCHER_MISMATCH", `預約 ${bookingId} 的體驗券狀態不一致，已停止退款。`);
        }

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

        const newBalance = currentPoints + (paymentType === "points" ? pointsUsed : 0);

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
          paymentType,
          voucherRef,
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
        .where("classId", "==", classId);

      const waitlistSnapshot = await tx.get(waitlistQuery);

      const waitingEntries = waitlistSnapshot.docs.filter(doc => doc.data().status === "waiting");

      if (waitingEntries.length > 50) {
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

        if (entry.paymentType === "points") {
          tx.update(entry.userRef, { points: entry.newBalance });
        } else if (entry.voucherRef) {
          tx.update(entry.voucherRef, {
            status: "available",
            quantity: 1,
            bookingId: null,
            usedAt: null,
            refundedAt: FieldValue.serverTimestamp(),
          });
        }

        tx.update(entry.bookingRef, {
          status: "admin_cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          pointsRefunded: entry.paymentType === "points" ? entry.pointsUsed : 0,
          trialVoucherRefunded: entry.paymentType === "trial_voucher",
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
          type: entry.paymentType === "trial_voucher"
            ? "admin_whole_class_trial_voucher_refund"
            : "admin_whole_class_cancellation_refund",
          paymentType: entry.paymentType,
          trialVoucherId: entry.voucherRef?.id ?? null,
          amount: entry.paymentType === "points" ? entry.pointsUsed : 0,
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
          body: entry.paymentType === "trial_voucher"
            ? `${courseName || "你預約的課程"} 已由老師整堂取消，已退還原體驗券。`
            : `${courseName || "你預約的課程"} 已由老師整堂取消，已退還 ${entry.pointsUsed} 點。`,
          courseName,
          classStartTime: startTime,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // 整堂取消後，所有等待中的候補一併取消
      for (const waitlistDoc of waitingEntries) {
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
          (sum, entry) => sum + (entry.paymentType === "points" ? entry.pointsUsed : 0),
          0
        ),
      });

      return {
        classId,
        cancelledBookings: entries.length,
        refundedPoints: entries.reduce(
          (sum, entry) => sum + (entry.paymentType === "points" ? entry.pointsUsed : 0),
          0
        ),
        refundedTrialVouchers: entries.filter((entry) => entry.paymentType === "trial_voucher").length,
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

    const detail = error instanceof Error ? error.message : "";
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const diagnostic = /Firebase Admin|environment|credential|private key|PEM/i.test(detail)
      ? { code: "ADMIN_CONFIGURATION", error: "伺服器 Firebase 管理員設定不完整，請檢查此部署的環境變數。" }
      : errorCode === "9" || errorCode === "failed-precondition"
        ? { code: "DATABASE_PRECONDITION", error: "資料庫查詢設定尚未就緒，請管理員核對伺服器紀錄。" }
        : errorCode === "7" || errorCode === "permission-denied"
          ? { code: "DATABASE_PERMISSION", error: "伺服器沒有資料庫存取權限，請管理員核對服務帳號設定。" }
          : { code: "CLASS_CANCEL_INTERNAL", error: "整堂取消失敗，請提供錯誤代碼供管理員核對伺服器紀錄。" };
    return NextResponse.json(diagnostic, { status: 500 });
  }
}
