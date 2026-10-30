import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { checkLegacyPrecheckRateLimit } from "@/lib/legacyPrecheckRateLimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // 舊會員認領查詢與自動移轉使用不同的開關。
  if (process.env.NAYA_LEGACY_PRECHECK_LIVE !== "true") {
    return NextResponse.json({ error: "舊會員認領功能尚未開放。" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const year = Number(body.birthdayYear);
    const month = Number(body.birthdayMonth);
    const day = Number(body.birthdayDay);

    if (!/^09\d{8}$/.test(phone)) {
      return NextResponse.json({ error: "請輸入正確的手機號碼。" }, { status: 400 });
    }
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() ||
        !Number.isInteger(month) || !Number.isInteger(day)) {
      return NextResponse.json({ error: "請輸入正確的生日。" }, { status: 400 });
    }
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return NextResponse.json({ error: "請輸入正確的生日。" }, { status: 400 });
    }

    // Vercel 部署時仍須在平台層啟用速率限制；請勿將此視為可信任的 IP 身分驗證。
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "unknown";
    const ipKey = createHash("sha256").update(ip).digest("hex");
    const limit = await checkLegacyPrecheckRateLimit(`ip:${ipKey}`);
    if (!limit.allowed) {
      return NextResponse.json({ error: "查詢次數過多，請稍後再試。" }, {
        status: 429, headers: { "Retry-After": String(limit.retryAfter) },
      });
    }

    const snapshot = await adminDb.collection("legacyMembers")
      .where("phoneNormalized", "==", phone).get();
    const matches = snapshot.docs.filter((doc) => {
      const data = doc.data();
      return data.status === "unclaimed" && !data.claimedBy && !data.claimedAt &&
        Number(data.birthdayYear) === year &&
        Number(data.birthdayMonth) === month &&
        Number(data.birthdayDay) === day;
    });
    if (matches.length !== 1) {
      return NextResponse.json({ matched: false, message: "資料無法確認，請檢查輸入內容或聯繫老師。" });
    }
    return NextResponse.json({ matched: true });
  } catch (error) {
    console.error("舊會員預先比對失敗：", error);
    return NextResponse.json({ error: "暫時無法確認會員資料。" }, { status: 500 });
  }
}
