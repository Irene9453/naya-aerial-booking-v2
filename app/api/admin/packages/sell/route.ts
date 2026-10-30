
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

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

    const adminSnap = await adminDb
      .collection("users")
      .doc(adminId)
      .get();

    if (!adminSnap.exists || adminSnap.data()?.role !== "admin") {
      throw new ApiError("你沒有管理員權限", 403);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ApiError("請求格式不正確");
    }

    const params =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};

    const studentId = params.studentId;
    const packageId = params.packageId;
    const operationId = params.operationId;

    const validId = (value: unknown) =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      !value.includes("/") &&
      value.length <= 150;

    if (
      !validId(studentId) ||
      !validId(packageId) ||
      typeof operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        operationId
      )
    ) {
      throw new ApiError("課卡銷售資料不正確");
    }

    const safeStudentId = studentId as string;
    const safePackageId = packageId as string;

    const studentRef = adminDb
      .collection("users")
      .doc(safeStudentId);

    const packageRef = adminDb
      .collection("packages")
      .doc(safePackageId);

    // 相同管理員 + 相同操作識別碼，只能建立一筆銷售
    const saleRef = adminDb
      .collection("packageSales")
      .doc(`sale_${adminId}_${operationId}`);

    const pointTransactionRef = adminDb
      .collection("pointTransactions")
      .doc(`package_${adminId}_${operationId}`);

    const notificationRef = adminDb
      .collection("notifications")
      .doc(`package_${adminId}_${operationId}`);

    const result = await adminDb.runTransaction(async (tx) => {
      // 所有讀取必須在寫入之前
      const saleSnap = await tx.get(saleRef);

      // 重試同一筆操作：直接回傳先前結果
      if (saleSnap.exists) {
        const previous = saleSnap.data()!;

        if (
          previous.adminId !== adminId ||
          previous.studentId !== safeStudentId ||
          previous.packageId !== safePackageId
        ) {
          throw new ApiError(
            "此操作識別碼已用於其他銷售，請重新開啟銷售視窗",
            409
          );
        }

        return {
          packageName: String(previous.packageName ?? ""),
          packagePoints: Number(previous.points ?? 0),
          packagePrice: Number(previous.price ?? 0),
          newBalance: Number(previous.balanceAfter ?? 0),
          saleId: saleRef.id,
          alreadyProcessed: true,
        };
      }

      const studentSnap = await tx.get(studentRef);
      const packageSnap = await tx.get(packageRef);

      if (!studentSnap.exists) {
        throw new ApiError("找不到學生資料");
      }

      if (!packageSnap.exists) {
        throw new ApiError("找不到課卡商品");
      }

      const studentData = studentSnap.data()!;
      const packageData = packageSnap.data()!;

      if (packageData.isActive !== true) {
        throw new ApiError("這張課卡目前已停用");
      }

      const currentPoints = Number(studentData.points ?? 0);
      const packagePoints = Number(packageData.points ?? 0);
      const packagePrice = Number(packageData.price ?? 0);
      const packageName = String(packageData.name ?? "");

      if (
        !Number.isSafeInteger(currentPoints) ||
        currentPoints < 0
      ) {
        throw new ApiError("會員點數資料不正確");
      }

      if (
        !Number.isSafeInteger(packagePoints) ||
        packagePoints <= 0
      ) {
        throw new ApiError("課卡點數設定不正確");
      }

      if (
        !Number.isSafeInteger(packagePrice) ||
        packagePrice < 0
      ) {
        throw new ApiError("課卡價格設定不正確");
      }

      const newBalance = currentPoints + packagePoints;

      if (!Number.isSafeInteger(newBalance)) {
        throw new ApiError("會員點數超出可處理範圍");
      }

      tx.update(studentRef, {
        points: newBalance,
      });

      tx.create(saleRef, {
        adminId,
        studentId: safeStudentId,
        packageId: safePackageId,
        packageName,
        points: packagePoints,
        price: packagePrice,
        balanceAfter: newBalance,
        operationId,
        status: "completed",
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.create(pointTransactionRef, {
        userId: safeStudentId,
        adminId,
        packageId: safePackageId,
        packageName,
        saleId: saleRef.id,
        type: "package_purchase",
        amount: packagePoints,
        note: `購買 ${packageName}`,
        balanceAfter: newBalance,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.create(notificationRef, {
        userId: safeStudentId,
        type: "package_purchase",
        title: "課卡購買成功",
        body: `已購買 ${packageName}，增加 ${packagePoints} 點。目前共有 ${newBalance} 點。`,
        packageId: safePackageId,
        packageName,
        pointsAdded: packagePoints,
        price: packagePrice,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        packageName,
        packagePoints,
        packagePrice,
        newBalance,
        saleId: saleRef.id,
        alreadyProcessed: false,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("課卡銷售 API 錯誤：", error);

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "課卡銷售處理失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
