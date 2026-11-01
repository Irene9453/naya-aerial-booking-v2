/**
 * Naya Aerial — trial voucher booking guards.
 * Pure helpers: do not write Firestore or mutate student points.
 * Voucher payment must be executed atomically in the existing booking transaction.
 */
export type TrialVoucherKind = "yoga" | "aerial";

export type TrialVoucherRecord = {
  userId?: unknown;
  kind?: unknown;
  status?: unknown;
  quantity?: unknown;
  bookingId?: unknown;
  offerId?: unknown;
};

/** Fail closed for unrecognized class titles; never guess a class is eligible. */
export function getTrialClassKind(courseName: unknown): TrialVoucherKind | null {
  if (typeof courseName !== "string") return null;
  const name = courseName.trim().replace(/\s+/g, "");
  if (!name) return null;
  // Exclude low aerial and mixed/special classes until explicitly mapped by admin.
  if (/低空|環綢|特別課|特殊課|混合|雙人|私人|包班/.test(name)) return null;
  if (/空中瑜[伽珈]|空瑜/.test(name) && !/舞綢|空環/.test(name)) return "yoga";
  if (/舞綢|空環/.test(name) && !/空中瑜[伽珈]|空瑜/.test(name)) return "aerial";
  return null;
}

export function validateAvailableTrialVoucher(params: {
  voucherId: string;
  voucher: TrialVoucherRecord | undefined;
  userId: string;
  courseName: unknown;
}): TrialVoucherKind {
  const { voucherId, voucher, userId, courseName } = params;
  if (!voucher || !voucherId || voucherId.includes("/")) {
    throw new Error("找不到有效的體驗券");
  }
  if (voucher.userId !== userId) throw new Error("體驗券不屬於此會員");
  if (voucher.status !== "available" || voucher.bookingId != null || voucher.quantity !== 1) {
    throw new Error("體驗券已使用或無法預約");
  }
  const classKind = getTrialClassKind(courseName);
  if (classKind === null) throw new Error("這堂課不適用新生體驗券");
  if (voucher.kind !== classKind) throw new Error("體驗券與課程種類不符");
  if (voucher.offerId !== (classKind === "yoga" ? "trial_yoga" : "trial_aerial")) {
    throw new Error("體驗券商品資料不正確");
  }
  if (voucherId !== `new_student_${userId}_${voucher.offerId}`) {
    throw new Error("體驗券識別碼不正確");
  }
  return classKind;
}
