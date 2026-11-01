export type AdminClassCategory = "upcoming" | "past" | "cancelled";
type ScheduledClass = { id: string; status: string; startTime: { toMillis(): number } | null; endTime?: { toMillis(): number } | null };

export function classTime(value: { toMillis(): number } | null | undefined): number | null {
  if (!value) return null;
  const time = value.toMillis();
  return Number.isFinite(time) ? time : null;
}
export function classEndTime(item: ScheduledClass) {
  const start = classTime(item.startTime), end = classTime(item.endTime);
  return end !== null && (start === null || end >= start) ? end : start;
}
export function adminClassCategory(item: ScheduledClass, now: number): AdminClassCategory {
  if (item.status === "cancelled" || item.status === "canceled") return "cancelled";
  const end = classEndTime(item);
  return end !== null && end <= now ? "past" : "upcoming";
}
export function groupAdminClasses<T extends ScheduledClass>(classes: T[], now: number) {
  const groups: Record<AdminClassCategory, T[]> = { upcoming: [], past: [], cancelled: [] };
  for (const item of classes) groups[adminClassCategory(item, now)].push(item);
  const compareId = (a: T, b: T) => a.id.localeCompare(b.id);
  groups.upcoming.sort((a, b) => (classTime(a.startTime) ?? Infinity) - (classTime(b.startTime) ?? Infinity) || compareId(a, b));
  groups.past.sort((a, b) => (classEndTime(b) ?? -Infinity) - (classEndTime(a) ?? -Infinity) || compareId(a, b));
  groups.cancelled.sort((a, b) => {
    const first = classTime(a.startTime), second = classTime(b.startTime);
    return (first === null ? Infinity : Math.abs(first - now)) - (second === null ? Infinity : Math.abs(second - now)) || compareId(a, b);
  });
  return groups;
}
