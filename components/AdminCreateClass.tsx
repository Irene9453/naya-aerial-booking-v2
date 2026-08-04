"use client";

import { FormEvent, useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
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

export default function AdminCreateClass() {
  const [showForm, setShowForm] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [specialPoints, setSpecialPoints] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const course = courseOptions.find(
    (option) => option.name === selectedCourse
  );

  const pointsRequired =
    course?.category === "special"
      ? Number(specialPoints)
      : course?.points ?? 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

    const parsedCapacity = Number(capacity);

    if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      setMessage("名額必須是大於 0 的整數。");
      return;
    }

    if (!Number.isInteger(pointsRequired) || pointsRequired <= 0) {
      setMessage("課程點數必須是大於 0 的整數。");
      return;
    }

    if (!date || !startTime || !endTime) {
      setMessage("請填寫日期、開始時間與結束時間。");
      return;
    }

    const startDate = new Date(`${date}T${startTime}:00+08:00`);
    const endDate = new Date(`${date}T${endTime}:00+08:00`);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      setMessage("日期或時間格式不正確。");
      return;
    }

    if (endDate <= startDate) {
      setMessage("結束時間必須晚於開始時間。");
      return;
    }

    setIsSubmitting(true);

    try {
      await addDoc(collection(db, "classes"), {
        courseName: course.name,
        category: course.category,
        startTime: Timestamp.fromDate(startDate),
        endTime: Timestamp.fromDate(endDate),
        pointsRequired,
        capacity: parsedCapacity,
        bookedCount: 0,
        status: "open",
        teacher: "Naya",
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      setMessage("課程建立成功！");
      setSelectedCourse("");
      setDate("");
      setStartTime("");
      setEndTime("");
      setCapacity("8");
      setSpecialPoints("");
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-5 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Create Class
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              新增課程
            </h2>

            <form onSubmit={handleSubmit} className="mt-7">
              <div>
                <label className="mb-2 block font-semibold text-slate-800">
                  課程
                </label>

                <select
                  required
                  value={selectedCourse}
                  onChange={(event) =>
                    setSelectedCourse(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500"
                >
                  <option value="">請選擇課程</option>

                  {courseOptions.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>

              {course?.category === "special" && (
                <div className="mt-5">
                  <label className="mb-2 block font-semibold text-slate-800">
                    特殊課程點數
                  </label>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={specialPoints}
                    onChange={(event) =>
                      setSpecialPoints(event.target.value)
                    }
                    placeholder="例如：6"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              )}

              <div className="mt-5">
                <label className="mb-2 block font-semibold text-slate-800">
                  日期
                </label>

                <input
                  type="date"
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

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
                      setStartTime(event.target.value)
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
                      setEndTime(event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    所需點數
                  </label>

                  <div className="rounded-xl bg-sky-50 px-4 py-3 font-semibold text-sky-700">
                    {pointsRequired || 0} 點
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
                      setCapacity(event.target.value)
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
                  onClick={() => setShowForm(false)}
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
                >
                  關閉
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "建立中……" : "建立課程"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}