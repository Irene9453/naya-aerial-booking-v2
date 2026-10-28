import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    // 1. 驗證會員登入身分
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return errorResponse("請先登入會員。", 401);
    }

    const idToken = authorization.slice(7);
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 2. 讀取會員提供的資料
    const body = await request.json();

    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const birthdayYear = Number(body.birthdayYear ?? 0);
    const birthdayMonth = Number(body.birthdayMonth);
    const birthdayDay = Number(body.birthdayDay);

    if (!/^09\d{8}$/.test(phone)) {
      return errorResponse("請輸入正確的手機號碼。", 400);
    }

    if (
      !Number.isInteger(birthdayMonth) ||
      birthdayMonth < 1 ||
      birthdayMonth > 12 ||
      !Number.isInteger(birthdayDay) ||
      birthdayDay < 1 ||
      birthdayDay > 31
    ) {
      return errorResponse("請輸入正確的生日月份與日期。", 400);
    }

    if (
      !Number.isInteger(birthdayYear) ||
      birthdayYear < 0 ||
      birthdayYear > new Date().getFullYear()
    ) {
      return errorResponse("生日年份格式不正確。", 400);
    }

    // 3. 確認會員資料存在
    const userRef = adminDb.collection("users").doc(uid);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      return errorResponse("找不到會員資料，請重新登入。", 404);
    }

    const userData = userSnapshot.data() ?? {};

    if (userData.legacyMemberId || userData.legacyClaimedAt) {
      return errorResponse("此帳號已完成舊會員認領。", 409);
    }

    // 4. 一個會員帳號只保留一筆目前的認領申請
    const claimRef = adminDb
      .collection("legacyClaimRequests")
      .doc(uid);

    const existingClaim = await claimRef.get();

    if (existingClaim.exists) {
      const status = existingClaim.data()?.status;

      if (status === "pending") {
        return NextResponse.json({
          success: true,
          status: "pending",
          message: "你的認領申請已送出，正在等待老師審核。",
        });
      }

      if (status === "approved") {
        return errorResponse("此帳號已完成舊會員認領。", 409);
      }

      if (status === "rejected") {
        return errorResponse(
          "先前的認領申請未通過，請聯繫老師確認。",
          409
        );
      }

      return errorResponse("認領申請狀態異常，請聯繫老師。", 409);
    }

    // 5. 建立待審核申請，不移轉任何點數
    // 使用 create()，避免同時送出兩次申請時互相覆蓋。
    try {
      await claimRef.create({
        uid,
        phone,
        birthdayYear,
        birthdayMonth,
        birthdayDay,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      // 若同時送出兩次，由已存在的申請決定結果。
      const latestClaim = await claimRef.get();

      if (latestClaim.exists && latestClaim.data()?.status === "pending") {
        return NextResponse.json({
          success: true,
          status: "pending",
          message: "你的認領申請已送出，正在等待老師審核。",
        });
      }

      throw error;
    }

    return NextResponse.json({
      success: true,
      status: "pending",
      message: "認領申請已送出，請等待老師審核。",
    });
  } catch (error) {
    console.error("Legacy claim request error:", error);

    return errorResponse("送出認領申請失敗，請稍後再試。", 500);
  }
}