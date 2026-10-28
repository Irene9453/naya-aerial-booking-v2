import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { checkLegacyPrecheckRateLimit } from "@/lib/legacyPrecheckRateLimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // 安全限制：目前僅允許本機 Firebase Emulator 測試
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true" ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "demo-naya-aerial" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
  ) {
    return NextResponse.json(
      { error: "舊會員認領功能尚未開放。" },
      { status: 503 }
    );
  }
  try {
    // Emulator 測試專用：不信任使用者提供的 IP 標頭。
    const limit = await checkLegacyPrecheckRateLimit("local-emulator");

    if (!limit.allowed) {
      return NextResponse.json(
        { error: "查詢次數過多，請稍後再試。" },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfter),
          },
        }
      );
    }

    const body = await request.json();

    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const year = Number(body.birthdayYear);
    const month = Number(body.birthdayMonth);
    const day = Number(body.birthdayDay);

    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: "手機格式不正確。" },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > new Date().getFullYear() ||
      !Number.isInteger(month) ||
      !Number.isInteger(day)
    ) {
      return NextResponse.json(
        { error: "生日格式不正確。" },
        { status: 400 }
      );
    }

    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return NextResponse.json(
        { error: "生日日期不正確。" },
        { status: 400 }
      );
    }

    const snapshot = await adminDb
      .collection("legacyMembers")
      .where("phoneNormalized", "==", phone)
      .get();

    const matches = snapshot.docs.filter((doc) => {
      const data = doc.data();

      return (
        data.status === "unclaimed" &&
        !data.claimedBy &&
        !data.claimedAt &&
        Number(data.birthdayYear) === year &&
        Number(data.birthdayMonth) === month &&
        Number(data.birthdayDay) === day
      );
    });

    if (matches.length !== 1) {
      return NextResponse.json({
        matched: false,
        message: "資料無法確認，請檢查輸入內容或聯繫老師。",
      });
    }

    return NextResponse.json({
      matched: true,
    });
  } catch (error) {
    console.error("舊會員預先比對失敗：", error);

    return NextResponse.json(
      { error: "暫時無法確認會員資料。" },
      { status: 500 }
    );
  }
}