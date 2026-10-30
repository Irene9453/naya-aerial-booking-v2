import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  getBatchLines,
  loadCouponNames,
  parseBatchMember,
} from "@/lib/legacyBatchImport";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");

  const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
  const user = await adminDb.collection("users").doc(decoded.uid).get();

  if (!user.exists || user.data()?.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  return decoded.uid;
}

export async function POST(request: NextRequest) {
  try {
    const adminUid = await requireAdmin(request);
    const body = await request.json();
    const lines = getBatchLines(String(body.text ?? ""));

    if (!lines.length) {
      return NextResponse.json(
        { error: "沒有可匯入的資料。" },
        { status: 400 }
      );
    }

    if (lines.length > 200) {
      return NextResponse.json(
        { error: "一次最多新增 200 位會員。" },
        { status: 400 }
      );
    }

    const couponNames = await loadCouponNames();

    // 先驗證所有資料，避免優惠券錯誤造成部分會員已匯入。
    const parsed = lines.map((line, index) =>
      parseBatchMember(line, index + 1, couponNames)
    );

    const seen = new Set<string>();

    for (const row of parsed) {
      if (seen.has(row.phone)) {
        return NextResponse.json(
          { error: `同批次手機重複：${row.phone}` },
          { status: 400 }
        );
      }
      seen.add(row.phone);
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of parsed) {
      const existing = await adminDb.collection("legacyMembers")
        .where("phoneNormalized", "==", row.phone)
        .limit(1)
        .get();

      if (!existing.empty) {
        skipped++;
        errors.push(`手機 ${row.phone} 已存在，略過`);
        continue;
      }

      await adminDb.collection("legacyMembers").add({
        ...row,
        phoneNormalized: row.phone,
        status: "unclaimed",
        createdBy: adminUid,
        createdAt: FieldValue.serverTimestamp(),
      });

      created++;
    }

    return NextResponse.json({ success: true, created, skipped, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("批次新增舊會員失敗：", error);

    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "請先登入管理員帳號。" },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "只有管理員可以批次新增。" },
        { status: 403 }
      );
    }

    // 格式錯誤直接回傳給管理員。
    if (message.startsWith("第 ") || message.startsWith("INVALID_")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "批次新增失敗，請檢查伺服器紀錄。" },
      { status: 500 }
    );
  }
}