import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
  const user = await adminDb.collection("users").doc(decoded.uid).get();

  if (!user.exists || user.data()?.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
}

function parseLine(line: string, index: number) {
  const parts = line.includes("\t")
    ? line.split("\t")
    : line.split(/\s*[,，]\s*/);

  if (parts.length < 4) {
    throw new Error(`第 ${index} 行：欄位不足`);
  }

  const [nameRaw, phoneRaw, birthdayRaw, pointsRaw, rewardRaw = "0"] = parts;

  const name = nameRaw.trim();
  const phone = phoneRaw.replace(/\D/g, "");
  const match = birthdayRaw.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (!name) throw new Error(`第 ${index} 行：姓名空白`);
  if (!/^09\d{8}$/.test(phone)) throw new Error(`第 ${index} 行：手機格式錯誤`);
  if (!match) throw new Error(`第 ${index} 行：生日格式錯誤`);

  const birthdayYear = Number(match[1]);
  const birthdayMonth = Number(match[2]);
  const birthdayDay = Number(match[3]);

  const date = new Date(birthdayYear, birthdayMonth - 1, birthdayDay);

  if (
    date.getFullYear() !== birthdayYear ||
    date.getMonth() !== birthdayMonth - 1 ||
    date.getDate() !== birthdayDay
  ) {
    throw new Error(`第 ${index} 行：生日不存在`);
  }

  const points = Number(pointsRaw);
  const rewardPoints = Number(rewardRaw || 0);

  if (!Number.isInteger(points) || points < 0) {
    throw new Error(`第 ${index} 行：課程點數需為 0 以上整數`);
  }

  if (!Number.isInteger(rewardPoints) || rewardPoints < 0) {
    throw new Error(`第 ${index} 行：紅利點數需為 0 以上整數`);
  }

  return {
    name,
    phone,
    birthdayYear,
    birthdayMonth,
    birthdayDay,
    points,
    rewardPoints,
  };
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const input = String(body.text ?? "");
    const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    if (!lines.length) {
      return NextResponse.json({ error: "請先貼上舊會員資料。" }, { status: 400 });
    }

    if (lines.length > 200) {
      return NextResponse.json({ error: "一次最多預覽 200 位會員。" }, { status: 400 });
    }

    const seen = new Set<string>();
    const valid: Array<{
      line: number;
      name: string;
      phone: string;
      birthdayYear: number;
      birthdayMonth: number;
      birthdayDay: number;
      points: number;
      rewardPoints: number;
    }> = [];

    const errors: string[] = [];
    let formatErrorCount = 0;
    let duplicateCount = 0;
    let coursePointsTotal = 0;
    let rewardPointsTotal = 0;

    for (let i = 0; i < lines.length; i++) {
      try {
        const row = parseLine(lines[i], i + 1);

        if (seen.has(row.phone)) {
          duplicateCount++;
          errors.push(`第 ${i + 1} 行：同批次手機重複`);
          continue;
        }

        seen.add(row.phone);
        valid.push({ line: i + 1, ...row });
        coursePointsTotal += row.points;
        rewardPointsTotal += row.rewardPoints;
      } catch (error) {
        formatErrorCount++;
        errors.push(error instanceof Error ? error.message : `第 ${i + 1} 行：格式錯誤`);
      }
    }

    const existingPhones = new Set<string>();

    for (const row of valid) {
      const existing = await adminDb
        .collection("legacyMembers")
        .where("phoneNormalized", "==", row.phone)
        .limit(1)
        .get();

      if (!existing.empty) {
        existingPhones.add(row.phone);
      }
    }

    const existingCount = existingPhones.size;
    const importable = valid.filter((row) => !existingPhones.has(row.phone));

    return NextResponse.json({
      success: true,
      total: lines.length,
      valid: valid.length,
      importable: importable.length,
      duplicateCount,
      existingCount,
      invalidCount: formatErrorCount,
      coursePointsTotal: importable.reduce((sum, row) => sum + row.points, 0),
      rewardPointsTotal: importable.reduce((sum, row) => sum + row.rewardPoints, 0),
      errors: [
        ...errors,
        ...valid
          .filter((row) => existingPhones.has(row.phone))
          .map((row) => `第 ${row.line} 行：手機 ${row.phone} 已存在於舊會員資料`),
      ],
      preview: importable.slice(0, 20).map((row) => ({
        line: row.line,
        name: row.name,
        phone: row.phone,
        birthday: `${row.birthdayYear}/${String(row.birthdayMonth).padStart(2, "0")}/${String(row.birthdayDay).padStart(2, "0")}`,
        points: row.points,
        rewardPoints: row.rewardPoints,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    console.error("批次預覽失敗：", error);

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "請先登入管理員帳號。" }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "只有管理員可以預覽匯入資料。" }, { status: 403 });
    }

    return NextResponse.json({ error: "預覽失敗，請稍後再試。" }, { status: 500 });
  }
}