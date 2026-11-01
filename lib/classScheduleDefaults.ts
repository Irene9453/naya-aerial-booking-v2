export function oneHourLater(start: string) {
  if (!/^\d{2}:\d{2}$/.test(start)) return { endTime: "", nextDay: false };
  const [hour, minute] = start.split(":").map(Number);
  if (hour > 23 || minute > 59) return { endTime: "", nextDay: false };
  return { endTime: `${String((hour + 1) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, nextDay: hour === 23 };
}
export function classScheduleDates(date: string, start: string, end: string, nextDay: boolean) {
  const startDate = new Date(`${date}T${start}:00+08:00`);
  const endDate = new Date(`${date}T${end}:00+08:00`);
  if (nextDay) endDate.setTime(endDate.getTime() + 86400000);
  return { startDate, endDate };
}
export function selectedClassName(course: { category: string; name: string }, specialName: string) {
  const name = course.category === "special" ? specialName.trim() : course.name;
  if (!name || name.length > 100) throw Error("請填寫 1～100 字的特殊課程名稱。");
  return name;
}
