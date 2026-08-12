"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { updateAttendanceWithReward } from "@/lib/attendanceRewardService";

type AdminClassRosterProps = {
  classId: string;
  courseName: string;
};

type AttendanceStatus = "present" | "absent" | null;

type StudentRosterData = {
  bookingId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  experience: string;
  rewardPoints: number;
  attendanceStatus: AttendanceStatus;
};

export default function AdminClassRoster({
  classId,
  courseName,
}: AdminClassRosterProps) {
  const [showRoster, setShowRoster] = useState(false);
  const [students, setStudents] = useState<StudentRosterData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingBookingId, setUpdatingBookingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!showRoster) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    const bookingsQuery = query(
      collection(db, "bookings"),
      where("classId", "==", classId)
    );

    const unsubscribe = onSnapshot(
      bookingsQuery,
      async (snapshot) => {
        try {
          const activeBookings = snapshot.docs.filter(
            (bookingDocument) =>
              bookingDocument.data().status === "booked"
          );

          const nextStudents = await Promise.all(
            activeBookings.map(async (bookingDocument) => {
              const bookingData = bookingDocument.data();
              const userId = String(bookingData.userId ?? "");

              const userSnapshot = await getDoc(
                doc(db, "users", userId)
              );

              const userData = userSnapshot.exists()
                ? userSnapshot.data()
                : {};

              const attendanceStatus: AttendanceStatus =
                bookingData.attendanceStatus === "present" ||
                bookingData.attendanceStatus === "absent"
                  ? bookingData.attendanceStatus
                  : null;

              return {
                bookingId: bookingDocument.id,
                userId,
                name: String(userData.name ?? "找不到姓名"),
                email: String(userData.email ?? ""),
                phone: String(userData.phone ?? ""),
                experience: String(userData.experience ?? ""),
                rewardPoints: Number(userData.rewardPoints ?? 0),
                attendanceStatus,
              };
            })
          );

          nextStudents.sort((first, second) =>
            first.name.localeCompare(second.name, "zh-Hant")
          );

          setStudents(nextStudents);
        } catch (error) {
          console.error(error);
          setMessage("讀取學生資料失敗。");
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error(error);
        setMessage("讀取預約名單失敗。");
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [classId, showRoster]);

  async function handleAttendanceChange(
    bookingId: string,
    status: AttendanceStatus
  ) {
    setMessage("");
    setUpdatingBookingId(bookingId);

    try {
      const result = await updateAttendanceWithReward({
        bookingId,
        status,
      });

      if (result.rewardChange > 0) {
        setMessage(
          `點名完成，紅利增加 ${result.rewardChange} 點，目前共有 ${result.newRewardBalance} 點。`
        );
      } else if (result.rewardChange < 0) {
        setMessage(
          `點名已更正，紅利扣回 ${Math.abs(
            result.rewardChange
          )} 點，目前共有 ${result.newRewardBalance} 點。`
        );
      } else {
        setMessage("點名狀態已更新。");
      }
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "更新點名狀態失敗。"
      );
    } finally {
      setUpdatingBookingId("");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowRoster(true)}
        className="rounded-xl border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
      >
        查看名單
      </button>

      {showRoster && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-5 py-8">
          <div className="w-full max-w-5xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
                  Class Roster
                </p>

                <h2 className="mt-3 text-2xl font-bold text-slate-900">
                  {courseName}
                </h2>

                <p className="mt-2 text-slate-600">
                  已預約學生：{students.length} 人
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowRoster(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                關閉
              </button>
            </div>

            {message && (
              <p className="mt-5 rounded-xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-700">
                {message}
              </p>
            )}

            {isLoading ? (
              <p className="py-10 text-center text-slate-600">
                名單載入中……
              </p>
            ) : students.length === 0 ? (
              <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
                <p className="text-slate-600">
                  目前尚無學生預約。
                </p>
              </div>
            ) : (
              <div className="mt-7 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-4 py-3 font-semibold">姓名</th>
                      <th className="px-4 py-3 font-semibold">紅利</th>
                      <th className="px-4 py-3 font-semibold">經驗</th>
                      <th className="px-4 py-3 font-semibold">電話</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        點名
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((student) => {
                      const isUpdating =
                        updatingBookingId === student.bookingId;

                      return (
                        <tr
                          key={student.bookingId}
                          className="border-b border-slate-100"
                        >
                          <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">
                            {student.name}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 font-semibold text-sky-700">
                            {student.rewardPoints} 點
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {student.experience || "未填寫"}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {student.phone || "未填寫"}
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex min-w-max justify-end gap-2">
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() =>
                                  handleAttendanceChange(
                                    student.bookingId,
                                    "present"
                                  )
                                }
                                className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                                  student.attendanceStatus === "present"
                                    ? "bg-emerald-600 text-white"
                                    : "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                }`}
                              >
                                {isUpdating ? "更新中…" : "已到"}
                              </button>

                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() =>
                                  handleAttendanceChange(
                                    student.bookingId,
                                    "absent"
                                  )
                                }
                                className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                                  student.attendanceStatus === "absent"
                                    ? "bg-red-600 text-white"
                                    : "border border-red-300 text-red-600 hover:bg-red-50"
                                }`}
                              >
                                缺席
                              </button>

                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() =>
                                  handleAttendanceChange(
                                    student.bookingId,
                                    null
                                  )
                                }
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                              >
                                清除
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}