/** True once the ordinary cancellation window (previous day, 23:59 Taipei time) has ended. */
export function isPastNormalCancellationDeadline(classStart: Date, now = Date.now()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(classStart);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);
  const day = Number(parts.find(part => part.type === "day")?.value);
  // Start of class day at 00:00 Asia/Taipei is 16:00 UTC on the previous date.
  const startOfClassDayTaipei = Date.UTC(year, month - 1, day - 1, 16, 0, 0);
  return now >= startOfClassDayTaipei;
}
