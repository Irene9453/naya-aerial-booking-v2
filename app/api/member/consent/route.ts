import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  CONSENT_VERSION,
  CONSENT_TITLE,
  CONSENT_SECTIONS,
  CONSENT_CONFIRMATIONS,
} from "@/lib/consent";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status }
  );
}

async function getAuthenticatedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  return adminAuth.verifyIdToken(token, true);
}

// 檢查目前會員是否已簽署最新版同意書
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await getAuthenticatedUser(request);

    const memberSnapshot = await adminDb
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (!memberSnapshot.exists) {
      return errorResponse("找不到會員資料。", 404);
    }

    const memberData = memberSnapshot.data();

    if (memberData?.role === "admin") {
      return NextResponse.json({
        success: true,
        required: false,
        signed: true,
        version: CONSENT_VERSION,
      });
    }

    const signatureSnapshot = await adminDb
      .collection("consentSignatures")
      .doc(decodedToken.uid)
      .collection("versions")
      .doc(CONSENT_VERSION)
      .get();

    return NextResponse.json({
      success: true,
      required: true,
      signed: signatureSnapshot.exists,
      version: CONSENT_VERSION,
      signedAt: signatureSnapshot.exists
        ? signatureSnapshot.data()?.signedAt?.toDate?.()?.toISOString?.() ??
          null
        : null,
    });
  } catch (error) {
    console.error("查詢電子簽署狀態失敗：", error);

    return errorResponse("會員驗證失敗，請重新登入。", 401);
  }
}

// 儲存會員電子簽署紀錄
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await getAuthenticatedUser(request);

    const memberSnapshot = await adminDb
      .collection("users")
      .doc(decodedToken.uid)
      .get();

    if (!memberSnapshot.exists) {
      return errorResponse("找不到會員資料。", 404);
    }

    const memberData = memberSnapshot.data();

    if (memberData?.role === "admin") {
      return errorResponse("管理員不需要簽署此文件。", 403);
    }

    const body = await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const version = body.version;
    const confirmations = body.confirmations;
    const signature = body.signature;

    if (!name || name.length > 100) {
      return errorResponse("請填寫正確的學員姓名。", 400);
    }

    if (version !== CONSENT_VERSION) {
      return errorResponse(
        "同意書版本已更新，請重新整理頁面後再簽署。",
        409
      );
    }

    if (
      !Array.isArray(confirmations) ||
      confirmations.length !== CONSENT_CONFIRMATIONS.length ||
      !confirmations.every((value) => value === true)
    ) {
      return errorResponse(
        "請先閱讀並勾選全部確認事項。",
        400
      );
    }

    if (
      typeof signature !== "string" ||
      !signature.startsWith("data:image/png;base64,")
    ) {
      return errorResponse("電子簽名格式不正確。", 400);
    }

    // 檢查圖片大小，避免過大的資料寫入 Firestore
    const base64 = signature.slice(
      "data:image/png;base64,".length
    );

    if (
      base64.length < 100 ||
      base64.length > 700000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
    ) {
      return errorResponse("電子簽名資料不正確或過大。", 400);
    }

    const signatureBuffer = Buffer.from(base64, "base64");

    // 檢查 PNG 檔案標頭
    const pngHeader = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);

    if (
      !signatureBuffer.subarray(0, 8).equals(pngHeader)
    ) {
      return errorResponse("電子簽名圖片格式不正確。", 400);
    }

    const signatureRef = adminDb
      .collection("consentSignatures")
      .doc(decodedToken.uid)
      .collection("versions")
      .doc(CONSENT_VERSION);

    const signedDocument = {
      userId: decodedToken.uid,
      name,
      email: String(
        memberData?.email ?? decodedToken.email ?? ""
      ),
      title: CONSENT_TITLE,
      version: CONSENT_VERSION,

      // 保留當時實際簽署的文件內容
      sections: CONSENT_SECTIONS,
      confirmationTexts: CONSENT_CONFIRMATIONS,
      confirmations,

      signature,
      signedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };

    // 使用 create() 避免同一版本被覆蓋
    try {
      await signatureRef.create(signedDocument);
    } catch (error: unknown) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? (error as { code: unknown }).code
          : null;

      if (code === 6 || code === "already-exists") {
        return NextResponse.json({
          success: true,
          alreadySigned: true,
          version: CONSENT_VERSION,
          message: "此版本同意書已完成簽署。",
        });
      }

      throw error;
    }

    return NextResponse.json({
      success: true,
      alreadySigned: false,
      version: CONSENT_VERSION,
      message: "電子簽署已完成並安全儲存。",
    });
  } catch (error) {
    console.error("儲存電子簽署失敗：", error);

    if (
      error instanceof Error &&
      error.message === "UNAUTHORIZED"
    ) {
      return errorResponse("請先登入會員帳號。", 401);
    }

    return errorResponse(
      "電子簽署儲存失敗，請稍後再試。",
      500
    );
  }
}