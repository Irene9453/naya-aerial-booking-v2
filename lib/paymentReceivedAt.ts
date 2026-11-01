export function paymentReceivedAt(value: unknown, now = Date.now()): number {
  if (value === undefined) return now;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < Date.UTC(2000, 0, 1) || value > now) throw Error("實際入帳時間無效或晚於現在。");
  return value;
}
export function taipeiPaymentInput(now = Date.now()) { return new Date(now + 8 * 3600000).toISOString().slice(0, 16); }
export function parseTaipeiPaymentInput(value: string, now = Date.now()) {
  const input = value.trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw Error("請輸入台灣時間 YYYY-MM-DD HH:mm。");
  const millis = Date.parse(`${input}:00+08:00`);
  if (!Number.isFinite(millis) || taipeiPaymentInput(millis) !== input) throw Error("入帳日期或時間不存在。");
  return paymentReceivedAt(millis, now);
}
