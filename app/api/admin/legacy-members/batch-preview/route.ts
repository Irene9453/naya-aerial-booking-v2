import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  getBatchLines,
  loadCouponNames,
  parseBatchMember,
  type BatchMember,
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
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const lines = getBatchLines(String(body.text ?? ""));

    if (!lines.length) {
      return NextResponse.json({ error: "請先貼上舊會員資料。" }, { status: 400 });
    }

    if (lines.length > 200) {
      return NextResponse.json(
        { error: "一次最多預覽 200 位會員。" },
        { status: 400 }
      );
    }

    const couponNames = await loadCouponNames();
    const seen = new Set<string>();
    const valid: Array<BatchMember & { line: number }> = [];
    const errors: string[] = [];

    let duplicateCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < lines.length; i++) {
      try {
        const row = parseBatchMember(lines[i], i + 1, couponNames);

        if (seen.has(row.phone)) {
          duplicateCount++;
          errors.push(`第 ${i + 1} 行：同批次手機重複`);
          continue;
        }

        seen.add(row.phone);
        valid.push({ line: i + 1, ...row });
      } catch (error) {
        invalidCount++;
        errors.push(
          error instanceof Error ? error.message : `第 ${i + 1} 行：格式錯誤`
        );
      }
    }

    const existingPhones = new Set<string>();

    for (const row of valid) {
      const existing = await adminDb.collection("legacyMembers")
        .where("phoneNormalized", "==", row.phone)
        .limit(1)
        .get();

      if (!existing.empty) existingPhones.add(row.phone);
    }

    const importable = valid.filter((row) => !existingPhones.has(row.phone));

    return NextResponse.json({
      success: true,
      total: lines.length,
      valid: valid.length,
      importable: importable.length,
      duplicateCount,
      existingCount: existingPhones.size,
      invalidCount,
      coursePointsTotal: importable.reduce((sum, row) => sum + row.points, 0),
      rewardPointsTotal: importable.reduce(
        (sum, row) => sum + row.rewardPoints, 0
      ),
      journeyLegacyClassesTotal: importable.reduce(
        (sum, row) => sum + row.journeyLegacyClasses, 0
      ),
      couponCountTotal: importable.reduce(
        (sum, row) =>
          sum + row.coupons.reduce((count, coupon) => count + coupon.quantity, 0),
        0
      ),
      errors: [
        ...errors,
        ...valid
          .filter((row) => existingPhones.has(row.phone))
          .map((row) => `第 ${row.line} 行：手機 ${row.phone} 已存在`),
      ],
      preview: importable.slice(0, 20).map((row) => ({
        line: row.line,
        name: row.name,
        phone: row.phone,
        birthday: `${row.birthdayYear}/${String(row.birthdayMonth).padStart(2, "0")}/${String(row.birthdayDay).padStart(2, "0")}`,
        points: row.points,
        rewardPoints: row.rewardPoints,
        journeyLegacyClasses: row.journeyLegacyClasses,
        coupons: row.coupons,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("批次預覽失敗：", error);

    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "請先登入管理員帳號。" },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "只有管理員可以預覽。" },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: "預覽失敗。" }, { status: 500 });
  }
}