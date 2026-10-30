import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // 1. 驗證登入身分
    const header = request.headers.get("authorization");

    if (!header?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "請先登入管理員帳號。" },
        { status: 401 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(
      header.slice(7)
    );

    // 2. 確認管理員權限
    const adminUser = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (
      !adminUser.exists ||
      adminUser.data()?.role !== "admin"
    ) {
      return NextResponse.json(
        { error: "只有管理員可以審核認領申請。" },
        { status: 403 }
      );
    }

    // 3. 取得申請資料
    const body = await request.json();
    const requestId = String(body.requestId ?? "").trim();

    if (!requestId || requestId.includes("/")) {
      return NextResponse.json(
        { error: "申請編號不正確。" },
        { status: 400 }
      );
    }

    const claimRef = adminDb
      .collection("legacyClaimRequests")
      .doc(requestId);

    // 4. 使用 Transaction 避免重複審核
    await adminDb.runTransaction(async (tx) => {
      const claimSnapshot = await tx.get(claimRef);

      if (!claimSnapshot.exists) {
        throw new Error("NOT_FOUND");
      }

      if (claimSnapshot.data()?.status !== "pending") {
        throw new Error("ALREADY_REVIEWED");
      }

      tx.update(claimRef, {
        status: "rejected",
        reviewedBy: decoded.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({
      success: true,
      message: "已拒絕此認領申請。",
    });
  } catch (error) {
    console.error("拒絕認領申請失敗：", error);

    const message =
      error instanceof Error ? error.message : "";

    if (message === "NOT_FOUND") {
      return NextResponse.json(
        { error: "找不到認領申請。" },
        { status: 404 }
      );
    }

    if (message === "ALREADY_REVIEWED") {
      return NextResponse.json(
        { error: "此申請已審核，無法重複操作。" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "審核失敗，請稍後再試。" },
      { status: 500 }
    );
  }
}