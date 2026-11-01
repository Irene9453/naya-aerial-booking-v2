import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

// Fail closed: trial-voucher bookings are enabled only in the isolated demo emulator
// or after a separate explicit rollout flag has been set.
const isDemoEmulator =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-naya-aerial" &&
  process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099";

type TrialKind = "yoga" | "aerial";
type TrialOfferId = "trial_yoga" | "trial_aerial";

function getEligibleTrialOffer(courseName: string): TrialOfferId | null {
  // Exact, conservative mapping. Unknown or mixed course titles are not eligible.
  const title = courseName.replace(/\s/g, "");
  if (/舞綢|空環/.test(title) && !/空瑜|空中瑜[伽珈]|低空瑜[伽珈]/.test(title)) {
    return "trial_aerial";
  }
  if (/空中瑜[伽珈]|空瑜|低空瑜[伽珈]/.test(title) && !/舞綢|空環/.test(title)) {
    return "trial_yoga";
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!isDemoEmulator && process.env.NAYA_BOOKING_LIVE !== "true") {
    return NextResponse.json(
      { error: "新系統預約功能尚未開放，請稍後再試。" },
      { status: 503 }
    );
  }

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(authorization.slice(7));
    const userId = decodedToken.uid;
    const authUser = await adminAuth.getUser(userId);
    if (!authUser.emailVerified) {
      const roleSnap = await adminDb.collection("users").doc(userId).get();
      if (!roleSnap.exists || roleSnap.data()?.role !== "admin") {
        return NextResponse.json(
          { error: "請先完成 Email 驗證，才能預約課程。" },
          { status: 403 }
        );
      }
    }

    const body: unknown = await request.json();
    const fields = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown> : {};
    const classId = fields.classId;
    const trialVoucherId = fields.trialVoucherId;
    if (typeof classId !== "string" || !classId.trim() || classId.includes("/")) {
      return NextResponse.json({ error: "課程資料不正確" }, { status: 400 });
    }
    if (trialVoucherId !== undefined &&
      (typeof trialVoucherId !== "string" || !trialVoucherId.trim() || trialVoucherId.includes("/"))) {
      return NextResponse.json({ error: "體驗券資料不正確" }, { status: 400 });
    }

    const usesTrialVoucher = typeof trialVoucherId === "string";
    if (usesTrialVoucher && !isDemoEmulator && process.env.NAYA_TRIAL_BOOKING_ENABLED !== "true") {
      return NextResponse.json({ error: "新生體驗券預約功能尚未開放" }, { status: 503 });
    }

    const userRef = adminDb.collection("users").doc(userId);
    const classRef = adminDb.collection("classes").doc(classId);
    const bookingId = `${userId}_${classId}`;
    const bookingRef = adminDb.collection("bookings").doc(bookingId);
    const waitlistRef = adminDb.collection("waitlists").doc(bookingId);
    const voucherRef = usesTrialVoucher
      ? adminDb.collection("trialVouchers").doc(trialVoucherId)
      : null;

    const result = await adminDb.runTransaction(async (tx) => {
      // All reads happen before writes.
      const userSnap = await tx.get(userRef);
      const classSnap = await tx.get(classRef);
      const bookingSnap = await tx.get(bookingRef);
      const waitlistSnap = await tx.get(waitlistRef);
      const voucherSnap = voucherRef ? await tx.get(voucherRef) : null;

      if (!userSnap.exists) throw new Error("找不到會員資料");
      if (!classSnap.exists) throw new Error("找不到課程資料");
      const userData = userSnap.data()!;
      const classData = classSnap.data()!;

      if (bookingSnap.exists) {
        const existingStatus = String(bookingSnap.data()?.status ?? "");
        if (existingStatus === "booked") throw new Error("你已經預約過這堂課");
        if (!["cancelled", "admin_cancelled"].includes(existingStatus)) {
          throw new Error("這堂課已有無法重新預約的紀錄");
        }
      }

      const points = Number(userData.points ?? 0);
      const required = Number(classData.pointsRequired ?? 0);
      const booked = Number(classData.bookedCount ?? 0);
      const capacity = Number(classData.capacity ?? 0);
      if (classData.status !== "open") throw new Error("這堂課目前無法預約");
      if (!Number.isSafeInteger(capacity) || capacity <= 0 ||
          !Number.isSafeInteger(booked) || booked < 0 || booked >= capacity) {
        throw new Error("這堂課已滿班或名額設定不正確");
      }
      if (!Number.isFinite(required) || required <= 0) {
        throw new Error("課程點數設定不正確");
      }
      if (!Number.isFinite(points) || points < 0) throw new Error("會員點數資料異常");
      if (!(classData.startTime instanceof Timestamp)) {
        throw new Error("課程時間設定不正確");
      }
      if (classData.startTime.toMillis() <= Date.now()) {
        throw new Error("此課程已開始，無法預約");
      }

      let remainingPoints = points;
      let voucherOfferId: TrialOfferId | null = null;
      if (usesTrialVoucher) {
        const courseName = String(classData.courseName ?? "");
        const eligibleOfferId = getEligibleTrialOffer(courseName);
        if (!eligibleOfferId) throw new Error("這堂課不適用新生體驗券");
        const expectedVoucherId = `new_student_${userId}_${eligibleOfferId}`;
        if (trialVoucherId !== expectedVoucherId) throw new Error("體驗券與課程種類不符");
        if (!voucherSnap?.exists) throw new Error("找不到體驗券");
        const voucher = voucherSnap.data()!;
        const expectedKind: TrialKind = eligibleOfferId === "trial_yoga" ? "yoga" : "aerial";
        if (voucher.userId !== userId || voucher.offerId !== eligibleOfferId ||
            voucher.kind !== expectedKind || voucher.status !== "available" ||
            voucher.quantity !== 1 || voucher.bookingId != null) {
          throw new Error("體驗券已使用或資料不正確");
        }
        voucherOfferId = eligibleOfferId;
      } else {
        if (points < required) throw new Error("點數不足，無法預約");
        remainingPoints = points - required;
      }

      const pointRef = usesTrialVoucher ? null : adminDb.collection("pointTransactions").doc();
      const notificationRef = adminDb.collection("notifications").doc();
      if (!usesTrialVoucher) {
        tx.update(userRef, { points: remainingPoints });
      } else {
        tx.update(voucherRef!, {
          status: "used", quantity: 0, bookingId,
          usedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(classRef, { bookedCount: booked + 1 });
      tx.set(bookingRef, {
        userId, classId,
        courseName: String(classData.courseName ?? ""),
        classStartTime: classData.startTime,
        paymentType: usesTrialVoucher ? "trial_voucher" : "points",
        trialVoucherId: usesTrialVoucher ? trialVoucherId : null,
        trialOfferId: voucherOfferId,
        pointsUsed: usesTrialVoucher ? 0 : required,
        status: "booked", createdAt: FieldValue.serverTimestamp(),
        cancelledAt: null, pointsRefunded: 0,
      });
      if (waitlistSnap.exists && waitlistSnap.data()?.status === "waiting") {
        tx.update(waitlistRef, { status: "converted", convertedAt: FieldValue.serverTimestamp() });
      }
      if (pointRef) {
        tx.create(pointRef, {
          userId, bookingId, classId,
          courseName: String(classData.courseName ?? ""),
          classStartTime: classData.startTime,
          type: "booking", amount: -required, balanceAfter: remainingPoints,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      tx.create(notificationRef, {
        userId, type: "booking", title: "預約成功",
        body: `你已成功預約 ${String(classData.courseName ?? "")}`,
        classId, bookingId, courseName: String(classData.courseName ?? ""),
        classStartTime: classData.startTime, isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { bookingId, remainingPoints, paymentType: usesTrialVoucher ? "trial_voucher" : "points" };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("預約 API 錯誤：", error);
    const message = error instanceof Error ? error.message : "預約失敗";
    const knownErrors = new Set([
      "找不到會員資料", "找不到課程資料", "你已經預約過這堂課",
      "這堂課已有無法重新預約的紀錄", "這堂課目前無法預約",
      "這堂課已滿班或名額設定不正確", "課程點數設定不正確",
      "點數不足，無法預約", "會員點數資料異常", "課程時間設定不正確",
      "此課程已開始，無法預約", "這堂課不適用新生體驗券",
      "體驗券與課程種類不符", "找不到體驗券", "體驗券已使用或資料不正確",
    ]);
    return NextResponse.json(
      { error: knownErrors.has(message) ? message : "預約處理失敗，請稍後再試" },
      { status: knownErrors.has(message) ? 400 : 500 }
    );
  }
}
