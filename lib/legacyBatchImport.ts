import { adminDb } from "@/lib/firebaseAdmin";
import { parseLegacyCoupons, type LegacyCoupon } from "@/lib/legacyCouponTransfer";

export type BatchMember = {
  name: string;
  phone: string;
  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;
  points: number;
  rewardPoints: number;
  journeyLegacyClasses: number;
  coupons: LegacyCoupon[];
};

export function getBatchLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (
    lines.length &&
    /^(姓名|name)\s*[,，\t]/i.test(lines[0]) &&
    /手機|phone/i.test(lines[0])
  ) {
    lines.shift();
  }

  return lines;
}

export async function loadCouponNames() {
  const snapshot = await adminDb.collection("coupons").get();
  const names = new Map<string, string | null>();

  for (const doc of snapshot.docs) {
    const name = String(doc.data().name ?? "").trim();
    if (!name) continue;

    if (names.has(name)) {
      names.set(name, null);
    } else {
      names.set(name, doc.id);
    }
  }

  return names;
}

export function parseBatchMember(
  line: string,
  index: number,
  couponNames: Map<string, string | null>
): BatchMember {
  const parts = line.includes("\t")
    ? line.split("\t")
    : line.split(/\s*[,，]\s*/);

  if (parts.length < 4 || parts.length > 7) {
    throw new Error(`第 ${index} 行：欄位數量不正確，應為 4～7 欄`);
  }

  const [
    nameRaw,
    phoneRaw,
    birthdayRaw,
    pointsRaw,
    rewardRaw = "0",
    classesRaw = "0",
    couponsRaw = "",
  ] = parts;

  const name = nameRaw.trim();
  const phone = phoneRaw.replace(/\D/g, "");
  const match = birthdayRaw.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (!name) throw new Error(`第 ${index} 行：姓名空白`);
  if (!/^09\d{8}$/.test(phone)) {
    throw new Error(`第 ${index} 行：手機格式錯誤`);
  }
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
  const rewardPoints = Number(rewardRaw || "0");
  const journeyLegacyClasses = Number(classesRaw || "0");

  if (!Number.isSafeInteger(points) || points < 0) {
    throw new Error(`第 ${index} 行：課程點數需為非負整數`);
  }
  if (!Number.isSafeInteger(rewardPoints) || rewardPoints < 0) {
    throw new Error(`第 ${index} 行：紅利點數需為非負整數`);
  }
  if (
    !Number.isSafeInteger(journeyLegacyClasses) ||
    journeyLegacyClasses < 0 ||
    journeyLegacyClasses > 100000
  ) {
    throw new Error(`第 ${index} 行：歷史堂數需為 0～100000 的整數`);
  }

  const coupons: LegacyCoupon[] = [];
  const couponText = couponsRaw.trim();

  if (couponText) {
    for (const item of couponText.split("|")) {
      const entry = item.trim();
      const couponMatch = entry.match(/^(.+?)\s*[*＊×]\s*(\d+)$/);

      if (!couponMatch) {
        throw new Error(
          `第 ${index} 行：優惠券格式錯誤，請使用「優惠券名稱*張數」`
        );
      }

      const couponName = couponMatch[1].trim();
      const quantity = Number(couponMatch[2]);

      if (!couponNames.has(couponName)) {
        throw new Error(`第 ${index} 行：找不到優惠券「${couponName}」`);
      }

      const couponId = couponNames.get(couponName);

      if (!couponId) {
        throw new Error(`第 ${index} 行：優惠券「${couponName}」名稱重複，無法判定`);
      }

      coupons.push({ couponId, quantity });
    }
  }

  try {
    parseLegacyCoupons(coupons);
  } catch {
    throw new Error(
      `第 ${index} 行：優惠券不可重複，每種最多 30 張，總計最多 60 張`
    );
  }

  return {
    name,
    phone,
    birthdayYear,
    birthdayMonth,
    birthdayDay,
    points,
    rewardPoints,
    journeyLegacyClasses,
    coupons,
  };
}