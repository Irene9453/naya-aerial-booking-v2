"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const courseOptions = [
  {
    name: "低空瑜珈 Lv.0",
    category: "lowAerialYoga",
    points: 3,
  },
  {
    name: "空中瑜珈 Lv.0–1",
    category: "aerialYoga",
    points: 3,
  },
  {
    name: "空中瑜珈 Lv.1–2",
    category: "aerialYoga",
    points: 3,
  },
  {
    name: "空中瑜珈 Lv.3",
    category: "aerialYoga",
    points: 3,
  },
  {
    name: "舞綢 Lv.0–1",
    category: "aerialSilk",
    points: 4,
  },
  {
    name: "空環 Lv.0–1",
    category: "aerialHoop",
    points: 4,
  },
  {
    name: "特殊課程",
    category: "special",
    points: 0,
  },
];

const weekdayOptions = [
  { value: 1, label: "星期一" },
  { value: 2, label: "星期二" },
  { value: 3, label: "星期三" },
  { value: 4, label: "星期四" },
  { value: 5, label: "星期五" },
  { value: 6, label: "星期六" },
  { value: 0, label: "星期日" },
];

type CreateMode = "single" | "monthly";

function formatPreviewDate(dateString: string) {
  const [year, month, day] = dateString
    .split("-")
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day
  );

  return date.toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function getDatesForMonth(
  monthValue: string,
  weekday: number
) {
  if (!monthValue) {
    return [];
  }

  const [year, month] = monthValue
    .split("-")
    .map(Number);

  if (!year || !month) {
    return [];
  }

  const dates: string[] = [];

  const daysInMonth = new Date(
    year,
    month,
    0
  ).getDate();

  for (
    let day = 1;
    day <= daysInMonth;
    day += 1
  ) {
    const currentDate = new Date(
      year,
      month - 1,
      day
    );

    if (
      currentDate.getDay() === weekday
    ) {
      const monthText = String(
        month
      ).padStart(2, "0");

      const dayText = String(
        day
      ).padStart(2, "0");

      dates.push(
        `${year}-${monthText}-${dayText}`
      );
    }
  }

  return dates;
}

export default function AdminCreateClass() {
  const [showForm, setShowForm] =
    useState(false);

  const [createMode, setCreateMode] =
    useState<CreateMode>("single");

  const [
    selectedCourse,
    setSelectedCourse,
  ] = useState("");

  // 單堂
  const [date, setDate] =
    useState("");

  // 整月
  const [month, setMonth] =
    useState("");

  const [weekday, setWeekday] =
    useState(2);

  const [
    excludedDates,
    setExcludedDates,
  ] = useState<string[]>([]);

  const [startTime, setStartTime] =
    useState("");

  const [endTime, setEndTime] =
    useState("");

  const [location, setLocation] = useState("");

  const [capacity, setCapacity] =
    useState("8");

  const [
    specialPoints,
    setSpecialPoints,
  ] = useState("");

  const [message, setMessage] =
    useState("");

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const course = courseOptions.find(
    (option) =>
      option.name === selectedCourse
  );

  const pointsRequired =
    course?.category === "special"
      ? Number(specialPoints)
      : course?.points ?? 0;

  const monthlyDates = useMemo(
    () =>
      getDatesForMonth(
        month,
        weekday
      ),
    [month, weekday]
  );

  const datesToCreate =
    createMode === "single"
      ? date
        ? [date]
        : []
      : monthlyDates.filter(
          (dateItem) =>
            !excludedDates.includes(
              dateItem
            )
        );

  function resetForm() {
    setSelectedCourse("");
    setDate("");
    setMonth("");
    setWeekday(2);
    setExcludedDates([]);
    setStartTime("");
    setEndTime("");
    setLocation("");
    setCapacity("8");
    setSpecialPoints("");
  }

  function handleModeChange(
    mode: CreateMode
  ) {
    setCreateMode(mode);
    setMessage("");
    setExcludedDates([]);
  }

  function toggleDate(
    dateString: string
  ) {
    setExcludedDates(
      (currentDates) => {
        if (
          currentDates.includes(
            dateString
          )
        ) {
          return currentDates.filter(
            (item) =>
              item !== dateString
          );
        }

        return [
          ...currentDates,
          dateString,
        ];
      }
    );
  }

  async function classAlreadyExists(
    courseName: string,
    classDate: string,
    classStartTime: string
  ) {
    const startDate = new Date(
      `${classDate}T${classStartTime}:00+08:00`
    );

    const startTimestamp =
      Timestamp.fromDate(startDate);

    const existingQuery = query(
      collection(db, "classes"),
      where(
        "courseName",
        "==",
        courseName
      ),
      where(
        "startTime",
        "==",
        startTimestamp
      )
    );

    const snapshot =
      await getDocs(existingQuery);

    return !snapshot.empty;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    const user = auth.currentUser;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    if (!course) {
      setMessage("請選擇課程。");
      return;
    }

    const parsedCapacity =
      Number(capacity);

    if (
      !Number.isInteger(
        parsedCapacity
      ) ||
      parsedCapacity <= 0
    ) {
      setMessage(
        "名額必須是大於 0 的整數。"
      );
      return;
    }

    if (
      !Number.isInteger(
        pointsRequired
      ) ||
      pointsRequired <= 0
    ) {
      setMessage(
        "課程點數必須是大於 0 的整數。"
      );
      return;
    }

    if (!startTime || !endTime) {
      setMessage(
        "請填寫開始時間與結束時間。"
      );
      return;
    }

    if (
      createMode === "single" &&
      !date
    ) {
      setMessage(
        "請選擇課程日期。"
      );
      return;
    }

    if (
      createMode === "monthly" &&
      !month
    ) {
      setMessage(
        "請選擇要建立的月份。"
      );
      return;
    }

    if (
      datesToCreate.length === 0
    ) {
      setMessage(
        "目前沒有可建立的課程日期。"
      );
      return;
    }

    // 用第一個日期確認時間是否合法
    const testStartDate =
      new Date(
        `${datesToCreate[0]}T${startTime}:00+08:00`
      );

    const testEndDate =
      new Date(
        `${datesToCreate[0]}T${endTime}:00+08:00`
      );

    if (
      Number.isNaN(
        testStartDate.getTime()
      ) ||
      Number.isNaN(
        testEndDate.getTime()
      )
    ) {
      setMessage(
        "日期或時間格式不正確。"
      );
      return;
    }

    if (
      testEndDate <= testStartDate
    ) {
      setMessage(
        "結束時間必須晚於開始時間。"
      );
      return;
    }

    setIsSubmitting(true);

    try {
      let createdCount = 0;
      let skippedCount = 0;

      for (
        const classDate of datesToCreate
      ) {
        const exists =
          await classAlreadyExists(
            course.name,
            classDate,
            startTime
          );

        if (exists) {
          skippedCount += 1;
          continue;
        }

        const startDate =
          new Date(
            `${classDate}T${startTime}:00+08:00`
          );

        const endDate =
          new Date(
            `${classDate}T${endTime}:00+08:00`
          );

        await addDoc(
          collection(db, "classes"),
          {
            courseName:
              course.name,

            category:
              course.category,

            startTime:
              Timestamp.fromDate(
                startDate
              ),

            endTime:
              Timestamp.fromDate(
                endDate
              ),

            pointsRequired,

            capacity:
              parsedCapacity,

            bookedCount: 0,

            status: "open",

            teacher: "Naya",
            location,

            createdBy:
              user.uid,

            createdAt:
              serverTimestamp(),
          }
        );

        createdCount += 1;
      }

      if (
        createdCount > 0 &&
        skippedCount === 0
      ) {
        setMessage(
          createMode === "monthly"
            ? `成功建立 ${createdCount} 堂課程！`
            : "課程建立成功！"
        );
      } else if (
        createdCount > 0 &&
        skippedCount > 0
      ) {
        setMessage(
          `成功建立 ${createdCount} 堂，另有 ${skippedCount} 堂因為已存在而跳過。`
        );
      } else {
        setMessage(
          `沒有建立新課程，${skippedCount} 堂課程已經存在。`
        );
      }

      if (createdCount > 0) {
        resetForm();
      }
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "建立課程失敗，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setShowForm(true);
        }}
        className="rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700"
      >
        ＋ 新增課程
      </button>

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 px-5 py-8 md:items-center">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Create Class
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              新增課程
            </h2>

            <form
              onSubmit={handleSubmit}
              className="mt-7"
            >
              {/* 建立方式 */}
              <div>
                <label className="mb-2 block font-semibold text-slate-800">
                  建立方式
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleModeChange(
                        "single"
                      )
                    }
                    className={`rounded-xl border px-4 py-3 font-semibold transition ${
                      createMode ===
                      "single"
                        ? "border-sky-600 bg-sky-50 text-sky-700"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    單堂課程
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleModeChange(
                        "monthly"
                      )
                    }
                    className={`rounded-xl border px-4 py-3 font-semibold transition ${
                      createMode ===
                      "monthly"
                        ? "border-sky-600 bg-sky-50 text-sky-700"
                        : "border-slate-300 text-slate-600"
                    }`}
                  >
                    整月重複
                  </button>
                </div>
              </div>

              {/* 課程 */}
              <div className="mt-5">
                <label className="mb-2 block font-semibold text-slate-800">
                  課程
                </label>

                <select
                  required
                  value={
                    selectedCourse
                  }
                  onChange={(event) =>
                    setSelectedCourse(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500"
                >
                  <option value="">
                    請選擇課程
                  </option>

                  {courseOptions.map(
                    (option) => (
                      <option
                        key={
                          option.name
                        }
                        value={
                          option.name
                        }
                      >
                        {option.name}
                      </option>
                    )
                  )}
                </select>
              </div>

              {course?.category ===
                "special" && (
                <div className="mt-5">
                  <label className="mb-2 block font-semibold text-slate-800">
                    特殊課程點數
                  </label>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={
                      specialPoints
                    }
                    onChange={(event) =>
                      setSpecialPoints(
                        event.target
                          .value
                      )
                    }
                    placeholder="例如：6"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              )}

              {/* 上課地點 */}
              <div className="mt-5">
                <label className="mb-2 block font-semibold text-slate-800">
                  上課地點
                </label>

                <select
                  required
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500"
                >
                  <option value="">請選擇上課地點</option>
                  <option value="中山國小">中山國小</option>
                  <option value="松江南京｜A 教室">松江南京｜A 教室</option>
                  <option value="松江南京｜B 教室">松江南京｜B 教室</option>
                </select>
              </div>

              {/* 單堂日期 */}
              {createMode ===
                "single" && (
                <div className="mt-5">
                  <label className="mb-2 block font-semibold text-slate-800">
                    日期
                  </label>

                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(event) =>
                      setDate(
                        event.target
                          .value
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              )}

              {/* 整月 */}
              {createMode ===
                "monthly" && (
                <>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block font-semibold text-slate-800">
                        月份
                      </label>

                      <input
                        type="month"
                        required
                        value={month}
                        onChange={(
                          event
                        ) => {
                          setMonth(
                            event.target
                              .value
                          );

                          setExcludedDates(
                            []
                          );
                        }}
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block font-semibold text-slate-800">
                        每週
                      </label>

                      <select
                        value={weekday}
                        onChange={(
                          event
                        ) => {
                          setWeekday(
                            Number(
                              event
                                .target
                                .value
                            )
                          );

                          setExcludedDates(
                            []
                          );
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500"
                      >
                        {weekdayOptions.map(
                          (option) => (
                            <option
                              key={
                                option.value
                              }
                              value={
                                option.value
                              }
                            >
                              {
                                option.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>

                  {monthlyDates.length >
                    0 && (
                    <div className="mt-5 rounded-2xl bg-sky-50 p-5">
                      <p className="font-semibold text-slate-800">
                        本月預計建立
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        不上課的日期可以取消勾選。
                      </p>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {monthlyDates.map(
                          (
                            dateItem
                          ) => {
                            const checked =
                              !excludedDates.includes(
                                dateItem
                              );

                            return (
                              <label
                                key={
                                  dateItem
                                }
                                className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    checked
                                  }
                                  onChange={() =>
                                    toggleDate(
                                      dateItem
                                    )
                                  }
                                />

                                <span
                                  className={
                                    checked
                                      ? "font-medium text-slate-700"
                                      : "text-slate-400 line-through"
                                  }
                                >
                                  {formatPreviewDate(
                                    dateItem
                                  )}
                                </span>
                              </label>
                            );
                          }
                        )}
                      </div>

                      <p className="mt-4 text-sm font-semibold text-sky-700">
                        將建立{" "}
                        {
                          datesToCreate.length
                        }{" "}
                        堂課
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* 時間 */}
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    開始時間
                  </label>

                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(event) =>
                      setStartTime(
                        event.target
                          .value
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    結束時間
                  </label>

                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(event) =>
                      setEndTime(
                        event.target
                          .value
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* 點數 / 名額 */}
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    所需點數
                  </label>

                  <div className="rounded-xl bg-sky-50 px-4 py-3 font-semibold text-sky-700">
                    {pointsRequired ||
                      0}{" "}
                    點
                  </div>
                </div>

                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    名額
                  </label>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={capacity}
                    onChange={(event) =>
                      setCapacity(
                        event.target
                          .value
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {message && (
                <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {message}
                </p>
              )}

              <div className="mt-7 flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowForm(false)
                  }
                  disabled={
                    isSubmitting
                  }
                  className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
                >
                  關閉
                </button>

                <button
                  type="submit"
                  disabled={
                    isSubmitting
                  }
                  className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting
                    ? "建立中……"
                    : createMode ===
                        "monthly"
                      ? `建立 ${datesToCreate.length} 堂課`
                      : "建立課程"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}