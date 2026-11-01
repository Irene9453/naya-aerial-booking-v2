export type CouponExpiryMode = "unlimited" | "date" | "days" | "unknown";
export function expiryDateMillis(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("優惠券到期日期格式不正確。");
  const start = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(start) || new Date(start + 8 * 3600000).toISOString().slice(0, 10) !== value) throw Error("優惠券到期日期不存在。");
  return start + 86400000;
}
export function couponDeadline(coupon: Record<string, unknown>): number | null | undefined {
  if (coupon.expiryMode === "unknown") return undefined;
  if (typeof coupon.expiresAtMillis === "number" && Number.isFinite(coupon.expiresAtMillis)) return coupon.expiresAtMillis;
  if ((coupon.expiresAtMillis !== undefined && coupon.expiresAtMillis !== null) || coupon.expiryMode === "date" || coupon.expiryMode === "days") return undefined;
  if (coupon.expiryMode === "unlimited") return null;
  return String(coupon.source ?? "").startsWith("legacy") ? undefined : null;
}
export function couponIsUsable(coupon: Record<string, unknown>, now = Date.now()) {
  const deadline = couponDeadline(coupon);
  return coupon.status === "available" && deadline !== undefined && (deadline === null || now < deadline);
}
export function issueCouponValidity(template: Record<string, unknown>, now = Date.now(), allowExpired = false) {
  const mode = template.expiryMode ?? "unlimited";
  if (mode === "unknown") { if (!allowExpired) throw Error("優惠券期限尚未確認，無法發放或兌換。"); return { expiryMode: "unknown", expiresAtMillis: null, expiresOn: null }; }
  if (mode === "unlimited") return { expiryMode: "unlimited", expiresAtMillis: null, expiresOn: null };
  let deadline: number;
  if (mode === "date") deadline = expiryDateMillis(template.expiryDate);
  else if (mode === "days" && Number.isSafeInteger(template.validDays) && Number(template.validDays) >= 1 && Number(template.validDays) <= 3650) {
    const localDate = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    deadline = expiryDateMillis(localDate) + (Number(template.validDays) - 1) * 86400000;
  } else throw Error("優惠券期限設定不正確。");
  if (!allowExpired && deadline <= now) throw Error("優惠券已到期，無法發放或兌換。");
  return { expiryMode: "date", expiresAtMillis: deadline, expiresOn: new Date(deadline - 1 + 8 * 3600000).toISOString().slice(0, 10) };
}
export function legacyCouponValidity(entry: { expiresOn?: string | null; expiresOnByIndex?: Array<string | null> }, index: number) {
  const date = entry.expiresOnByIndex?.[index - 1] ?? entry.expiresOn;
  // Explicit null means unlimited. Preserve it instead of falling through ?? above.
  const value = entry.expiresOnByIndex && index <= entry.expiresOnByIndex.length ? entry.expiresOnByIndex[index - 1] : date;
  return issueCouponValidity({ expiryMode: value === null ? "unlimited" : !value ? "unknown" : "date", expiryDate: value }, Date.now(), true);
}
export function couponValidityLabel(coupon: Record<string, unknown>) {
  const deadline = couponDeadline(coupon);
  if (deadline === undefined) return "期限待核對";
  if (deadline === null) return "無期限";
  const date = new Date(deadline - 1 + 8 * 3600000).toISOString().slice(0, 10);
  return `${date} 23:59 到期（台灣時間）${Date.now() >= deadline ? "・已到期" : ""}`;
}

export function templateValidityLabel(template: Record<string, unknown>) {
  return template.expiryMode === "date" ? `有效至 ${template.expiryDate} 當日 23:59（台灣時間）` : template.expiryMode === "days" ? `領取當日起 ${template.validDays} 天（含當日）` : template.expiryMode === "unknown" ? "期限待確認" : "無期限";
}
export function templateCanIssue(template: Record<string, unknown>) {
  try { issueCouponValidity(template); return true; } catch { return false; }
}
