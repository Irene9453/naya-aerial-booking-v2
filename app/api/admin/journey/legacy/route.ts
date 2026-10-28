import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode = 400
  ) {
    super(message);
    this.name = "ApiError";
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

    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      throw new ApiError("請求資料不正確");
    }

    const params = body as Record<string, unknown>;
    const userId = params.userId;
    const legacyClasses = params.legacyClasses;
    const reason = params.reason;

    if (
      typeof userId !== "string" ||
      !userId.trim() ||
      userId.includes("/") ||
      userId.length > 150
    ) {
      throw new ApiError("會員編號不正確");
    }

    if (
      typeof legacyClasses !== "number" ||
      !Number.isSafeInteger(legacyClasses) ||
      legacyClasses < 0 ||
      legacyClasses > 100000
    ) {
      throw new ApiError("歷史堂數必須是 0 以上的整數");
    }

    if (
      typeof reason !== "string" ||
      !reason.trim() ||
      reason.trim().length > 500
    ) {
      throw new ApiError("請填寫補登原因（最多 500 字）");
    }

    const userRef = adminDb.collection("users").doc(userId);

    const auditRef = adminDb
      .collection("journeyLegacyAdjustments")
      .doc();

    const result = await adminDb.runTransaction(
      async (transaction) => {
        const userSnapshot = await transaction.get(userRef);

        if (!userSnapshot.exists) {
          throw new ApiError("找不到會員", 404);
        }

        const userData = userSnapshot.data()!;

        if (userData.role !== "student") {
          throw new ApiError("只有學生會員可以補登堂數");
        }

        const previousLegacyClasses = Number(
          userData.journeyLegacyClasses ?? 0
        );

        if (
          !Number.isSafeInteger(previousLegacyClasses) ||
          previousLegacyClasses < 0
        ) {
          throw new ApiError("原有歷史堂數資料不正確");
        }

        transaction.update(userRef, {
          journeyLegacyClasses: legacyClasses,
          journeyLegacyUpdatedAt: FieldValue.serverTimestamp(),
          journeyLegacyUpdatedBy: adminId,
        });

        transaction.create(auditRef, {
          userId,
          adminId,
          previousLegacyClasses,
          newLegacyClasses: legacyClasses,
          difference: legacyClasses - previousLegacyClasses,
          reason: reason.trim(),
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          previousLegacyClasses,
          newLegacyClasses: legacyClasses,
        };
      }
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    console.error("Journey 歷史堂數補登錯誤：", error);

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: "歷史堂數更新失敗，請稍後再試" },
      { status: 500 }
    );
  }
}