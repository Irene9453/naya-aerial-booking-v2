"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { useRouter } from "next/navigation";

import { auth, db } from "@/lib/firebase";
import BookClassButton from "@/components/BookClassButton";
import BookingCalendar from "@/components/BookingCalendar";

type ClassData = {
  id: string;
  courseName: string;
  startTime: Timestamp;
  pointsRequired: number;
  capacity: number;
  bookedCount: number;
  status: string;
  allowMonthlyBooking: boolean;
};

function formatClassTime(timestamp: Timestamp) {
  return timestamp.toDate().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function LiveClassList() {
  const [viewMode, setViewMode] =
  useState<"list" | "calendar">("list");

const [selectedDate, setSelectedDate] =
  useState("");
  const router = useRouter();

  const [classes, setClasses] = useState<ClassData[]>([]);
  const [user, setUser] = useState<User | null>(null);
const [selectedMonth, setSelectedMonth] =
  useState("");

const [selectedCourse, setSelectedCourse] =
  useState("all");
  const [isAuthLoading, setIsAuthLoading] =
    useState(true);

  const [isLoading, setIsLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  // =========================
  // Firebase 登入狀態
  // =========================
  useEffect(() => {
    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (firebaseUser) => {
          setUser(firebaseUser);
          setIsAuthLoading(false);
        }
      );

    return unsubscribeAuth;
  }, []);

  // =========================
  // Firestore 課程
  // =========================
  useEffect(() => {
    const classQuery = query(
      collection(db, "classes"),
      orderBy("startTime", "asc")
    );

    const unsubscribe = onSnapshot(
      classQuery,
      (snapshot) => {
        const nextClasses =
          snapshot.docs
            .map((classDocument) => {
              const data =
                classDocument.data();

              return {
                id: classDocument.id,

                courseName: String(
                  data.courseName ?? ""
                ),

                startTime:
                  data.startTime as Timestamp,

                pointsRequired: Number(
                  data.pointsRequired ?? 0
                ),

                capacity: Number(
                  data.capacity ?? 0
                ),

                bookedCount: Number(
                  data.bookedCount ?? 0
                ),

                status: String(
                  data.status ?? ""
                ),
                allowMonthlyBooking: Boolean(
  data.allowMonthlyBooking ?? true
),
              };
            })
            .filter((classItem) => {
  if (
    classItem.status !== "open" ||
    !(classItem.startTime instanceof Timestamp)
  ) {
    return false;
  }

  return (
    classItem.startTime
      .toDate()
      .getTime() > Date.now()
  );
});

        setClasses(nextClasses);
        setMessage("");
        setIsLoading(false);
      },
      (error) => {
        console.error(error);

        setMessage(
          `讀取課程失敗：${error.message}`
        );

        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  if (isLoading || isAuthLoading) {
    return (
      <p className="py-10 text-center text-slate-600">
        課程資料載入中……
      </p>
    );
  }

  if (message) {
    return (
      <p className="py-10 text-center text-red-600">
        {message}
      </p>
    );
  }
const monthOptions = Array.from(
  new Set(
    classes.map((classItem) => {
      const date =
        classItem.startTime.toDate();

      const parts =
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Taipei",
          year: "numeric",
          month: "2-digit",
        }).formatToParts(date);

      const year =
        parts.find(
          (part) => part.type === "year"
        )?.value ?? "";

      const month =
        parts.find(
          (part) => part.type === "month"
        )?.value ?? "";

      return `${year}-${month}`;
    })
  )
).sort();

const courseOptions = Array.from(
  new Set(
    classes.map(
      (classItem) =>
        classItem.courseName
    )
  )
).sort((a, b) =>
  a.localeCompare(b, "zh-Hant")
);

const filteredClasses = classes.filter(
  (classItem) => {
    const date =
      classItem.startTime.toDate();

    const year =
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Taipei",
        year: "numeric",
      }).format(date);

    const month =
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Taipei",
        month: "2-digit",
      }).format(date);

    const classMonth =
      `${year}-${month}`;

    const matchesMonth =
      !selectedMonth ||
      classMonth === selectedMonth;

    const matchesCourse =
      selectedCourse === "all" ||
      classItem.courseName ===
        selectedCourse;

    return (
      matchesMonth &&
      matchesCourse
    );
  }
);

const calendarClasses = classes.filter(
  (classItem) => {
    return (
      selectedCourse === "all" ||
      classItem.courseName ===
        selectedCourse
    );
  }
);

const groupedClasses =
  filteredClasses.reduce<
    Record<string, ClassData[]>
  >((groups, classItem) => {
    const dateKey =
      classItem.startTime
        .toDate()
        .toLocaleDateString(
          "en-CA",
          {
            timeZone:
              "Asia/Taipei",
          }
        );

    if (!groups[dateKey]) {
      groups[dateKey] = [];
      
    }

    groups[dateKey].push(
      classItem
    );

    return groups;
  }, {});
  if (classes.length === 0) {
  return (
    <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
      <p className="text-slate-600">
        目前沒有符合條件的課程。
      </p>
    </div>
  );
}

  return (
    <>
    <div className="mb-8 rounded-2xl bg-white p-5 shadow-sm">
  <div className="grid gap-4 sm:grid-cols-2">
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        月份
      </label>

      <select
        value={selectedMonth}
        onChange={(event) =>
          setSelectedMonth(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500"
      >
        <option value="">
          全部月份
        </option>

        {monthOptions.map(
          (monthValue) => {
            const [
              year,
              month,
            ] =
              monthValue.split(
                "-"
              );

            return (
              <option
                key={
                  monthValue
                }
                value={
                  monthValue
                }
              >
                {year} 年{" "}
                {Number(month)} 月
              </option>
            );
          }
        )}
      </select>
    </div>

    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        課程
      </label>

      <select
        value={selectedCourse}
        onChange={(event) =>
          setSelectedCourse(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500"
      >
        <option value="all">
          全部課程
        </option>

        {courseOptions.map(
          (courseName) => (
            <option
              key={
                courseName
              }
              value={
                courseName
              }
            >
              {courseName}
            </option>
          )
        )}
      </select>
    </div>
  </div>

  {(selectedMonth ||
    selectedCourse !==
      "all") && (
    <button
      type="button"
      onClick={() => {
        setSelectedMonth("");
        setSelectedCourse(
          "all"
        );
      }}
      className="mt-4 text-sm font-semibold text-sky-700"
    >
      清除篩選
    </button>
  )}
  <div className="mt-5 flex gap-2">
  <button
    type="button"
    onClick={() =>
      setViewMode("list")
    }
    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
      viewMode === "list"
        ? "bg-sky-600 text-white"
        : "border border-slate-300 bg-white text-slate-600"
    }`}
  >
    列表
  </button>

  <button
    type="button"
    onClick={() => {
      setViewMode("calendar");
      setSelectedDate("");
    }}
    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
      viewMode === "calendar"
        ? "bg-sky-600 text-white"
        : "border border-slate-300 bg-white text-slate-600"
    }`}
  >
    月曆
  </button>
</div>
</div>
    {viewMode === "calendar" ? (
  <BookingCalendar
  classes={calendarClasses}
  selectedMonth={selectedMonth}
  onMonthChange={(monthValue) => {
    setSelectedMonth(monthValue);
    setSelectedDate("");
  }}
  onSelectDate={(dateKey) => {
    setSelectedDate(dateKey);
    setViewMode("list");
  }}
/>
) : (
  <div>
    {selectedDate && (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-100 bg-sky-50 px-5 py-4">
        <div>
          <p className="text-sm text-slate-500">
            目前查看
          </p>

          <p className="mt-1 font-bold text-slate-900">
            {new Date(
              `${selectedDate}T00:00:00+08:00`
            ).toLocaleDateString("zh-TW", {
              timeZone: "Asia/Taipei",
              year: "numeric",
              month: "numeric",
              day: "numeric",
              weekday: "long",
            })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedDate("");
            setViewMode("calendar");
          }}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100"
        >
          ← 返回月曆
        </button>
      </div>
    )}

    <div className="grid gap-6 md:grid-cols-2">
    {filteredClasses
      .filter((classItem) => {
        if (!selectedDate) {
          return true;
        }

        const dateKey =
          classItem.startTime
            .toDate()
            .toLocaleDateString(
              "en-CA",
              {
                timeZone: "Asia/Taipei",
              }
            );

        return dateKey === selectedDate;
      })
      .map((classItem) => {
        const remainingSeats = Math.max(
          0,
          classItem.capacity -
            classItem.bookedCount
        );

        const isFull =
          remainingSeats === 0;

        const bookingPercentage =
          classItem.capacity > 0
            ? Math.min(
                100,
                (classItem.bookedCount /
                  classItem.capacity) *
                  100
              )
            : 0;

        return (
          <article
            key={classItem.id}
            className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-bold text-slate-900">
                {classItem.courseName}
              </h2>

              <span className="shrink-0 rounded-full bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
                {classItem.pointsRequired} 點
              </span>
            </div>

            <p className="mt-5 font-medium text-slate-700">
              {formatClassTime(
                classItem.startTime
              )}
            </p>

            {/* =====================
                已登入才顯示名額
               ===================== */}
            {user ? (
              <div className="mt-6">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">
                    目前預約
                  </span>

                  <span className="font-semibold text-slate-800">
                    {classItem.bookedCount} /{" "}
                    {classItem.capacity} 人
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all"
                    style={{
                      width: `${bookingPercentage}%`,
                    }}
                  />
                </div>

                <p className="mt-3 text-sm text-slate-500">
                  {isFull
                    ? "目前已滿班"
                    : `尚有 ${remainingSeats} 個名額`}
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-500">
                  登入會員後可查看即時名額。
                </p>
              </div>
            )}

            {/* =====================
                預約按鈕
               ===================== */}
            {user ? (
              <BookClassButton
  classId={classItem.id}
  courseName={classItem.courseName}
  pointsRequired={classItem.pointsRequired}
  isFull={isFull}
  startTime={classItem.startTime}
  allowMonthlyBooking={
    classItem.allowMonthlyBooking
  }
/>
            ) : (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/login?redirect=/booking"
                  )
                }
                className="mt-6 w-full rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700"
              >
                登入後預約
              </button>
            )}
          </article>
        );
            })}
    </div>
  </div>
)}
</>
);
}