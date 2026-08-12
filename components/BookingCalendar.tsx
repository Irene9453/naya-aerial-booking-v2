"use client";

import { Timestamp } from "firebase/firestore";

type CalendarClass = {
  id: string;
  courseName: string;
  startTime: Timestamp;
  capacity: number;
  bookedCount: number;
};

type BookingCalendarProps = {
  classes: CalendarClass[];
  selectedMonth: string;
  onMonthChange: (monthValue: string) => void;
  onSelectDate: (dateKey: string) => void;
};

function getTaipeiDateKey(timestamp: Timestamp) {
  return timestamp.toDate().toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei",
  });
}

function formatTime(timestamp: Timestamp) {
  return timestamp.toDate().toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function getCourseStyle(courseName: string) {
  if (courseName.includes("低空")) {
    return "bg-cyan-50 text-cyan-800";
  }

  if (courseName.includes("Lv.0–1")) {
    return "bg-sky-50 text-sky-800";
  }

  if (courseName.includes("Lv.1–2")) {
    return "bg-blue-50 text-blue-800";
  }

  if (courseName.includes("Lv.3")) {
    return "bg-indigo-50 text-indigo-800";
  }

  if (courseName.includes("舞綢")) {
    return "bg-violet-50 text-violet-800";
  }

  if (courseName.includes("空環")) {
    return "bg-pink-50 text-pink-800";
  }

  return "bg-slate-100 text-slate-700";
}
export default function BookingCalendar({
  classes,
  selectedMonth,
  onMonthChange,
  onSelectDate,
}: BookingCalendarProps) {
  let year: number;
  let month: number;

  if (selectedMonth) {
    const [
      selectedYear,
      selectedMonthNumber,
    ] = selectedMonth.split("-");

    year = Number(selectedYear);
    month = Number(selectedMonthNumber);
  } else if (classes.length > 0) {
    const firstDate =
      classes[0].startTime.toDate();

    year = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Taipei",
        year: "numeric",
      }).format(firstDate)
    );

    month = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Taipei",
        month: "numeric",
      }).format(firstDate)
    );
  } else {
    const now = new Date();

    year = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Taipei",
        year: "numeric",
      }).format(now)
    );

    month = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Taipei",
        month: "numeric",
      }).format(now)
    );
  }

  function changeMonth(offset: number) {
    const targetDate = new Date(
      year,
      month - 1 + offset,
      1
    );

    const targetYear =
      targetDate.getFullYear();

    const targetMonth = String(
      targetDate.getMonth() + 1
    ).padStart(2, "0");

    onMonthChange(
      `${targetYear}-${targetMonth}`
    );
  }

  const daysInMonth = new Date(
    year,
    month,
    0
  ).getDate();

  const firstWeekday = new Date(
    year,
    month - 1,
    1
  ).getDay();

  // 讓星期一當第一欄
  const mondayFirstIndex =
    firstWeekday === 0
      ? 6
      : firstWeekday - 1;

  const classesByDate = classes.reduce<
    Record<string, CalendarClass[]>
  >((groups, classItem) => {
    const key = getTaipeiDateKey(
      classItem.startTime
    );

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(classItem);

    return groups;
  }, {});

  const cells: Array<number | null> = [];

  for (
    let index = 0;
    index < mondayFirstIndex;
    index += 1
  ) {
    cells.push(null);
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day += 1
  ) {
    cells.push(day);
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            ← 上個月
          </button>

          <h3 className="text-center text-xl font-bold text-slate-900">
            {year} 年 {month} 月
          </h3>

          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            下個月 →
          </button>
        </div>

        <p className="mt-3 text-center text-sm text-slate-500">
          點選日期查看當天完整課程。
        </p>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-semibold text-slate-500">
        {[
          "一",
          "二",
          "三",
          "四",
          "五",
          "六",
          "日",
        ].map((weekday) => (
          <div
            key={weekday}
            className="px-2 py-3"
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, index) => {
          if (!day) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-28 border-b border-r border-slate-100 bg-slate-50/50"
              />
            );
          }

          const monthText =
            String(month).padStart(
              2,
              "0"
            );

          const dayText =
            String(day).padStart(
              2,
              "0"
            );

          const dateKey =
            `${year}-${monthText}-${dayText}`;

          const dayClasses =
            classesByDate[dateKey] ?? [];

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() =>
                dayClasses.length > 0 &&
                onSelectDate(dateKey)
              }
              className={`min-h-28 border-b border-r border-slate-100 p-2 text-left transition ${
                dayClasses.length > 0
                  ? "hover:bg-sky-50"
                  : "cursor-default"
              }`}
            >
              <span className="text-sm font-semibold text-slate-700">
                {day}
              </span>

              <div className="mt-2 space-y-1">
                {dayClasses
                  .slice(0, 3)
                  .map((classItem) => (
                    <div
                      key={
                        classItem.id
                      }
                      className={`rounded-lg px-2 py-1 text-[11px] leading-4 ${getCourseStyle(
                        classItem.courseName
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold">
                          {formatTime(
                            classItem.startTime
                          )}
                        </span>

                        {classItem.bookedCount >=
                          classItem.capacity && (
                          <span className="shrink-0 rounded bg-white/70 px-1 font-bold">
                            滿
                          </span>
                        )}
                      </div>

                      <div className="truncate">
                        {
                          classItem.courseName
                        }
                      </div>
                    </div>
                  ))}

                {dayClasses.length >
                  3 && (
                  <p className="text-[11px] font-semibold text-slate-500">
                    +
                    {dayClasses.length -
                      3}{" "}
                    堂
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}