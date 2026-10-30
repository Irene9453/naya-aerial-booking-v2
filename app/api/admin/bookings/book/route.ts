
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // 正式環境預設關閉新增預約；本機 Emulator 保留測試能力。
  const isLocalEmulator =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-naya-aerial" &&
    process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099";

  if (!isLocalEmulator && process.env.NAYA_BOOKING_LIVE !== "true") {
    return NextResponse.json(
      { error: "新系統預約功能尚未開放，請稍後再試。" },
      { status: 503 }
    );
  }
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "請先登入會員" },
        { status: 401 }
      );
    }

    const idToken = authorization.slice(7);
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // 管理員 API 必須確認登入者具有管理員權限。
    const adminRoleSnap = await adminDb.collection("users").doc(userId).get();

    if (!adminRoleSnap.exists || adminRoleSnap.data()?.role !== "admin") {
      return NextResponse.json(
        { error: "沒有管理員操作權限。" },
        { status: 403 }
      );
    }

    // Firebase Authentication 是 Email 驗證狀態的權威來源。
    // 既有管理員暫時豁免，避免在過渡期間無法使用管理功能。
    const authUser = await adminAuth.getUser(userId);
    if (!authUser.emailVerified) {
      const roleSnap = await adminDb.collection("users").doc(userId).get();
      const isAdmin = roleSnap.exists && roleSnap.data()?.role === "admin";

      if (!isAdmin) {
        return NextResponse.json(
          { error: "請先完成 Email 驗證，才能預約課程。" },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const classId = body?.classId;

    if (
      typeof classId !== "string" ||
      !classId.trim() ||
      classId.includes("/")
    ) {
      return NextResponse.json(
        { error: "課程資料不正確" },
        { status: 400 }
      );
    }

    const userRef = adminDb.collection("users").doc(userId);
    const classRef = adminDb.collection("classes").doc(classId);
    const bookingId = `${userId}_${classId}`;

    const bookingRef = adminDb
      .collection("bookings")
      .doc(bookingId);

    const waitlistRef = adminDb
      .collection("waitlists")
      .doc(bookingId);

    const result = await adminDb.runTransaction(async (tx) => {
      // 先讀取所有資料
      const userSnap = await tx.get(userRef);
      const classSnap = await tx.get(classRef);
      const bookingSnap = await tx.get(bookingRef);
      const waitlistSnap = await tx.get(waitlistRef);

      if (!userSnap.exists) {
        throw new Error("找不到會員資料");
      }

      if (!classSnap.exists) {
        throw new Error("找不到課程資料");
      }

      const userData = userSnap.data()!;
      const classData = classSnap.data()!;

      if (bookingSnap.exists) {
        const existingStatus = String(
          bookingSnap.data()?.status ?? ""
        );

        if (existingStatus === "booked") {
          throw new Error("你已經預約過這堂課");
        }

        if (
          !["cancelled", "admin_cancelled"].includes(
            existingStatus
          )
        ) {
          throw new Error("這堂課已有無法重新預約的紀錄");
        }
      }

      const points = Number(userData.points ?? 0);
      const required = Number(classData.pointsRequired ?? 0);
      const booked = Number(classData.bookedCount ?? 0);
      const capacity = Number(classData.capacity ?? 0);

      if (classData.status !== "open") {
        throw new Error("這堂課目前無法預約");
      }

      if (
        !Number.isFinite(capacity) ||
        !Number.isInteger(capacity) ||
        capacity <= 0 ||
        !Number.isInteger(booked) ||
        booked < 0 ||
        booked >= capacity
      ) {
        throw new Error("這堂課已滿班或名額設定不正確");
      }

      if (
        !Number.isFinite(required) ||
        required <= 0
      ) {
        throw new Error("課程點數設定不正確");
      }

      if (!Number.isFinite(points) || points < required) {
        throw new Error("點數不足，無法預約");
      }

      if (!(classData.startTime instanceof Timestamp)) {
        throw new Error("課程時間設定不正確");
      }

      if (classData.startTime.toMillis() <= Date.now()) {
        throw new Error("此課程已開始，無法預約");
      }

      const remainingPoints = points - required;

      const pointRef = adminDb
        .collection("pointTransactions")
        .doc();

      const notificationRef = adminDb
        .collection("notifications")
        .doc();

      tx.update(userRef, {
        points: remainingPoints,
      });

      tx.update(classRef, {
        bookedCount: booked + 1,
      });

      tx.set(bookingRef, {
        userId,
        classId,
        courseName: String(classData.courseName ?? ""),
        classStartTime: classData.startTime,
        pointsUsed: required,
        status: "booked",
        createdAt: FieldValue.serverTimestamp(),
        cancelledAt: null,
        pointsRefunded: 0,
      });

      if (
        waitlistSnap.exists &&
        waitlistSnap.data()?.status === "waiting"
      ) {
        tx.update(waitlistRef, {
          status: "converted",
          convertedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.create(pointRef, {
        userId,
        bookingId,
        classId,
        courseName: String(classData.courseName ?? ""),
        classStartTime: classData.startTime,
        type: "booking",
        amount: -required,
        balanceAfter: remainingPoints,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.create(notificationRef, {
        userId,
        type: "booking",
        title: "預約成功",
        body: `你已成功預約 ${String(classData.courseName ?? "")}`,
        classId,
        bookingId,
        courseName: String(classData.courseName ?? ""),
        classStartTime: classData.startTime,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        bookingId,
        remainingPoints,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("預約 API 錯誤：", error);

    const message =
      error instanceof Error ? error.message : "預約失敗";

    const knownErrors = [
      "找不到會員資料",
      "找不到課程資料",
      "你已經預約過這堂課",
      "這堂課已有無法重新預約的紀錄",
      "這堂課目前無法預約",
      "這堂課已滿班或名額設定不正確",
      "課程點數設定不正確",
      "點數不足，無法預約",
      "課程時間設定不正確",
      "此課程已開始，無法預約",
    ];

    return NextResponse.json(
      {
        error: knownErrors.includes(message)
          ? message
          : "預約處理失敗，請稍後再試",
      },
      {
        status: knownErrors.includes(message) ? 400 : 500,
      }
    );
  }
}
