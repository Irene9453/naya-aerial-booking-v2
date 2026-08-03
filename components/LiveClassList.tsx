"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import BookClassButton from "@/components/BookClassButton";

type ClassData = {
  id: string;
  courseName: string;
  startTime: Timestamp;
  pointsRequired: number;
  capacity: number;
  bookedCount: number;
  status: string;
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
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const classQuery = query(
      collection(db, "classes"),
      orderBy("startTime", "asc")
    );

    const unsubscribe = onSnapshot(
      classQuery,
      (snapshot) => {
        const nextClasses = snapshot.docs
          .map((classDocument) => {
            const data = classDocument.data();

            return {
              id: classDocument.id,
              courseName: String(data.courseName ?? ""),
              startTime: data.startTime as Timestamp,
              pointsRequired: Number(data.pointsRequired ?? 0),
              capacity: Number(data.capacity ?? 0),
              bookedCount: Number(data.bookedCount ?? 0),
              status: String(data.status ?? ""),
            };
          })
          .filter((classItem) => classItem.status === "open");

        setClasses(nextClasses);
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setMessage(`讀取課程失敗：${error.message}`);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  if (isLoading) {
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

  if (classes.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
        <p className="text-slate-600">
          目前沒有可預約的課程。
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {classes.map((classItem) => {
        const remainingSeats = Math.max(
          0,
          classItem.capacity - classItem.bookedCount
        );

        const isFull = remainingSeats === 0;

        const bookingPercentage =
          classItem.capacity > 0
            ? Math.min(
                100,
                (classItem.bookedCount / classItem.capacity) * 100
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
              {formatClassTime(classItem.startTime)}
            </p>

            <div className="mt-6">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">目前預約</span>

                <span className="font-semibold text-slate-800">
                  {classItem.bookedCount} / {classItem.capacity} 人
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${bookingPercentage}%` }}
                />
              </div>

              <p className="mt-3 text-sm text-slate-500">
                {isFull
                  ? "目前已滿班"
                  : `尚有 ${remainingSeats} 個名額`}
              </p>
            </div>

            <BookClassButton
  classId={classItem.id}
  courseName={classItem.courseName}
  pointsRequired={classItem.pointsRequired}
  isFull={isFull}
/>
          </article>
        );
      })}
    </div>
  );
}