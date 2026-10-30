"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import {
  auth,
  db,
} from "@/lib/firebase";

import {
  updateAttendanceWithReward,
} from "@/lib/attendanceRewardService";

import {
  applyClassLessonToPresentStudents,
} from "@/lib/studentLessonRecordService";

type AdminClassRosterProps = {
  classId: string;
  courseName: string;
};

type AttendanceStatus =
  | "present"
  | "absent"
  | null;

type RosterTab =
  | "active"
  | "waitlist"
  | "history";

type StudentRosterData = {
  bookingId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  experience: string;
  points: number;
  rewardPoints: number;
  attendanceStatus: AttendanceStatus;
  status: string;
  pointsUsed: number;
  cancelledAt: Timestamp | null;
  specialLeaveAt: Timestamp | null;
};

type WaitlistStudentData = {
  waitlistId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  experience: string;
  points: number;
  rewardPoints: number;
  status: string;
  createdAt: Timestamp | null;
  lastNotifiedAt: Timestamp | null;
};

function getStatusLabel(
  status: string
) {
  if (status === "booked") {
    return "已預約";
  }

  if (status === "cancelled") {
    return "一般取消";
  }

  if (
    status ===
    "special_leave"
  ) {
    return "特殊請假";
  }

  if (
    status ===
    "admin_cancelled"
  ) {
    return "老師代取消";
  }

  return status || "未知";
}

function getWaitlistStatusLabel(
  status: string
) {
  if (status === "waiting") {
    return "候補中";
  }

  if (status === "converted") {
    return "已轉為預約";
  }

  if (status === "cancelled") {
    return "已取消候補";
  }

  return status || "未知";
}

function formatDateTime(
  timestamp: Timestamp | null
) {
  if (!timestamp) {
    return "—";
  }

  return timestamp
    .toDate()
    .toLocaleString(
      "zh-TW",
      {
        timeZone:
          "Asia/Taipei",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    );
}

async function adminPost(
  path: string,
  body: Record<
    string,
    unknown
  >
) {
  const user =
    auth.currentUser;

  if (!user) {
    throw new Error(
      "請先登入管理員帳號。"
    );
  }

  const idToken =
    await user.getIdToken();

  const response =
    await fetch(
      path,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${idToken}`,
        },
        body:
          JSON.stringify(body),
      }
    );

  const text =
    await response.text();

  let data: {
    error?: string;
    refundedPoints?: number;
    newPointBalance?: number;
    waitlistNotifiedCount?: number;
  } = {};

  try {
    data = text
      ? JSON.parse(text)
      : {};
  } catch {
    console.error(
      "API 回傳非 JSON：",
      text
    );

    throw new Error(
      `API 執行失敗（HTTP ${response.status}）。`
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ??
        "操作失敗。"
    );
  }

  return data;
}

export default function AdminClassRoster({
  classId,
  courseName,
}: AdminClassRosterProps) {
  const [
    showRoster,
    setShowRoster,
  ] = useState(false);

  const [
    students,
    setStudents,
  ] = useState<
    StudentRosterData[]
  >([]);

  const [
    waitlistStudents,
    setWaitlistStudents,
  ] = useState<
    WaitlistStudentData[]
  >([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(false);

  const [
    isWaitlistLoading,
    setIsWaitlistLoading,
  ] = useState(false);

  const [
    updatingBookingId,
    setUpdatingBookingId,
  ] = useState("");
const attendanceUpdatingRef = useRef(false);
  const [
    cancellingBookingId,
    setCancellingBookingId,
  ] = useState("");

  const [
    pendingCancel,
    setPendingCancel,
  ] =
    useState<
      StudentRosterData | null
    >(null);
const [afterCancelMode, setAfterCancelMode] = useState<
  "after_absent" | "after_compensation"
>("after_absent");
  const [
    message,
    setMessage,
  ] = useState("");

  const [
    isApplyingLesson,
    setIsApplyingLesson,
  ] = useState(false);

  const [
    tab,
    setTab,
  ] =
    useState<RosterTab>(
      "active"
    );

  // =========================
  // 預約名單監聽
  // =========================
  useEffect(() => {
    if (!showRoster) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    const bookingsQuery =
      query(
        collection(
          db,
          "bookings"
        ),
        where(
          "classId",
          "==",
          classId
        )
      );

    const unsubscribe =
      onSnapshot(
        bookingsQuery,

        async (snapshot) => {
          try {
            const nextStudents =
              await Promise.all(
                snapshot.docs.map(
                  async (
                    bookingDocument
                  ) => {
                    const bookingData =
                      bookingDocument.data();

                    const userId =
                      String(
                        bookingData.userId ??
                          ""
                      );

                    const userSnapshot =
                      userId
                        ? await getDoc(
                            doc(
                              db,
                              "users",
                              userId
                            )
                          )
                        : null;

                    const userData =
                      userSnapshot?.exists()
                        ? userSnapshot.data()
                        : {};

                    const attendanceStatus:
                      AttendanceStatus =
                      bookingData.attendanceStatus ===
                        "present" ||
                      bookingData.attendanceStatus ===
                        "absent"
                        ? bookingData.attendanceStatus
                        : null;

                    return {
                      bookingId:
                        bookingDocument.id,

                      userId,

                      name:
                        String(
                          userData.name ??
                            "找不到姓名"
                        ),

                      email:
                        String(
                          userData.email ??
                            ""
                        ),

                      phone:
                        String(
                          userData.phone ??
                            ""
                        ),

                      experience:
                        String(
                          userData.experience ??
                            ""
                        ),

                      points:
                        Number(
                          userData.points ??
                            0
                        ),

                      rewardPoints:
                        Number(
                          userData.rewardPoints ??
                            0
                        ),

                      attendanceStatus,

                      status:
                        String(
                          bookingData.status ??
                            ""
                        ),

                      pointsUsed:
                        Number(
                          bookingData.pointsUsed ??
                            0
                        ),

                      cancelledAt:
                        bookingData.cancelledAt instanceof
                        Timestamp
                          ? bookingData.cancelledAt
                          : null,

                      specialLeaveAt:
                        bookingData.specialLeaveAt instanceof
                        Timestamp
                          ? bookingData.specialLeaveAt
                          : null,
                    } satisfies StudentRosterData;
                  }
                )
              );

            nextStudents.sort(
              (
                first,
                second
              ) =>
                first.name.localeCompare(
                  second.name,
                  "zh-Hant"
                )
            );

            setStudents(
              nextStudents
            );
          } catch (error) {
            console.error(
              error
            );

            setMessage(
              "讀取學生資料失敗。"
            );
          } finally {
            setIsLoading(
              false
            );
          }
        },

        (error) => {
          console.error(
            error
          );

          setMessage(
            "讀取預約名單失敗。"
          );

          setIsLoading(
            false
          );
        }
      );

    return unsubscribe;
  }, [
    classId,
    showRoster,
  ]);

  // =========================
  // 候補名單監聽
  // =========================
  useEffect(() => {
    if (!showRoster) {
      return;
    }

    setIsWaitlistLoading(
      true
    );

    const waitlistQuery =
      query(
        collection(
          db,
          "waitlists"
        ),
        where(
          "classId",
          "==",
          classId
        ),
        where(
          "status",
          "==",
          "waiting"
        )
      );

    const unsubscribe =
      onSnapshot(
        waitlistQuery,

        async (snapshot) => {
          try {
            const nextWaitlistStudents =
              await Promise.all(
                snapshot.docs.map(
                  async (
                    waitlistDocument
                  ) => {
                    const waitlistData =
                      waitlistDocument.data();

                    const userId =
                      String(
                        waitlistData.userId ??
                          ""
                      );

                    const userSnapshot =
                      userId
                        ? await getDoc(
                            doc(
                              db,
                              "users",
                              userId
                            )
                          )
                        : null;

                    const userData =
                      userSnapshot?.exists()
                        ? userSnapshot.data()
                        : {};

                    return {
                      waitlistId:
                        waitlistDocument.id,

                      userId,

                      name:
                        String(
                          userData.name ??
                            "找不到姓名"
                        ),

                      email:
                        String(
                          userData.email ??
                            ""
                        ),

                      phone:
                        String(
                          userData.phone ??
                            ""
                        ),

                      experience:
                        String(
                          userData.experience ??
                            ""
                        ),

                      points:
                        Number(
                          userData.points ??
                            0
                        ),

                      rewardPoints:
                        Number(
                          userData.rewardPoints ??
                            0
                        ),

                      status:
                        String(
                          waitlistData.status ??
                            ""
                        ),

                      createdAt:
                        waitlistData.createdAt instanceof
                        Timestamp
                          ? waitlistData.createdAt
                          : null,

                      lastNotifiedAt:
                        waitlistData.lastNotifiedAt instanceof
                        Timestamp
                          ? waitlistData.lastNotifiedAt
                          : null,
                    } satisfies WaitlistStudentData;
                  }
                )
              );

            nextWaitlistStudents.sort(
              (
                first,
                second
              ) => {
                const firstTime =
                  first.createdAt?.toMillis() ??
                  0;

                const secondTime =
                  second.createdAt?.toMillis() ??
                  0;

                return (
                  firstTime -
                  secondTime
                );
              }
            );

            setWaitlistStudents(
              nextWaitlistStudents
            );
          } catch (error) {
            console.error(
              error
            );

            setMessage(
              "讀取候補名單失敗。"
            );
          } finally {
            setIsWaitlistLoading(
              false
            );
          }
        },

        (error) => {
          console.error(
            error
          );

          setMessage(
            "讀取候補名單失敗。"
          );

          setIsWaitlistLoading(
            false
          );
        }
      );

    return unsubscribe;
  }, [
    classId,
    showRoster,
  ]);

  const activeStudents =
    useMemo(
      () =>
        students.filter(
          (student) =>
            student.status ===
            "booked"
        ),
      [students]
    );

  const historyStudents =
    useMemo(
      () =>
        students.filter(
          (student) =>
            student.status !==
            "booked"
        ),
      [students]
    );

  const visibleStudents =
    tab === "active"
      ? activeStudents
      : historyStudents;


async function handleAttendanceChange(
  bookingId: string,
  status: AttendanceStatus
) {
  if (attendanceUpdatingRef.current) {
    return;
  }

  attendanceUpdatingRef.current = true;
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
        : "更新點名狀態失敗，請先確認目前點名紀錄。"
    );
  } finally {
    attendanceUpdatingRef.current = false;
    setUpdatingBookingId("");
  }
}


  async function handleApplyLessonContent() {
    setMessage("");

    setIsApplyingLesson(
      true
    );

    try {
      const result =
        await applyClassLessonToPresentStudents(
          {
            classId,
          }
        );

      setMessage(
        `已將本堂內容「${result.lessonContent}」套用到 ${result.createdCount} 位已出席學生。`
      );
    } catch (
      error: unknown
    ) {
      console.error(
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "套用上課內容失敗。"
      );
    } finally {
      setIsApplyingLesson(
        false
      );
    }
  }

  async function handleAdminCancel() {
    if (!pendingCancel) {
      return;
    }

    setMessage("");

    setCancellingBookingId(
      pendingCancel.bookingId
    );

    try {
      const result = await adminPost(
  "/api/admin/bookings/cancel",
  {
    bookingId: pendingCancel.bookingId,
    classId,
    cancelMode: afterCancelMode,
  }
);

      const waitlistMessage =
        typeof result.waitlistNotifiedCount ===
          "number" &&
        result.waitlistNotifiedCount >
          0
          ? ` 已通知 ${result.waitlistNotifiedCount} 位候補會員。`
          : "";

      setMessage(
        `已替 ${pendingCancel.name} 取消預約，退回 ${
          result.refundedPoints ??
          pendingCancel.pointsUsed
        } 點，目前會員剩餘 ${
          result.newPointBalance ??
          "—"
        } 點。${waitlistMessage}`
      );

      setPendingCancel(
        null
      );
    } catch (
      error: unknown
    ) {
      console.error(
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "老師代取消失敗。"
      );

      setPendingCancel(
        null
      );
    } finally {
      setCancellingBookingId(
        ""
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setShowRoster(true)
        }
        className="rounded-xl border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
      >
        查看名單
      </button>

      {showRoster && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-6xl rounded-3xl bg-white p-6 shadow-2xl md:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
                  Class Roster
                </p>

                <h2 className="mt-3 text-2xl font-bold text-slate-900">
                  {courseName}
                </h2>

                <p className="mt-2 text-slate-600">
                  目前預約：
                  {
                    activeStudents.length
                  }{" "}
                  人
                  {waitlistStudents.length >
                    0 && (
                    <>
                      {" "}
                      ・ 候補：
                      {
                        waitlistStudents.length
                      }{" "}
                      人
                    </>
                  )}
                </p>

                <button
                  type="button"
                  onClick={
                    handleApplyLessonContent
                  }
                  disabled={
                    isApplyingLesson
                  }
                  className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isApplyingLesson
                    ? "套用中……"
                    : "套用本堂內容到已出席學生"}
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowRoster(
                    false
                  )
                }
                className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                關閉
              </button>
            </div>

            {/* 三個分頁 */}
            <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() =>
                  setTab("active")
                }
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  tab === "active"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                目前名單{" "}
                {
                  activeStudents.length
                }
              </button>

              <button
                type="button"
                onClick={() =>
                  setTab(
                    "waitlist"
                  )
                }
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  tab === "waitlist"
                    ? "bg-white text-amber-700 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                候補名單{" "}
                {
                  waitlistStudents.length
                }
              </button>

              <button
                type="button"
                onClick={() =>
                  setTab(
                    "history"
                  )
                }
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  tab === "history"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                異動紀錄{" "}
                {
                  historyStudents.length
                }
              </button>
            </div>

            {message && (
              <p className="mt-5 rounded-xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-700">
                {message}
              </p>
            )}

            {/* =====================
                候補名單
            ===================== */}
            {tab ===
            "waitlist" ? (
              isWaitlistLoading ? (
                <p className="py-10 text-center text-slate-600">
                  候補名單載入中……
                </p>
              ) : waitlistStudents.length ===
                0 ? (
                <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
                  <p className="text-slate-600">
                    目前沒有候補會員。
                  </p>
                </div>
              ) : (
                <div className="mt-7 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="px-3 py-3 font-semibold">
                          順序
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          姓名
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          課程點數
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          紅利
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          電話
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          加入候補
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          狀態
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {waitlistStudents.map(
                        (
                          student,
                          index
                        ) => (
                          <tr
                            key={
                              student.waitlistId
                            }
                            className="border-b border-slate-100"
                          >
                            <td className="whitespace-nowrap px-3 py-4">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 font-bold text-amber-700">
                                {index +
                                  1}
                              </span>
                            </td>

                            <td className="px-3 py-4">
                              <p className="whitespace-nowrap font-semibold text-slate-900">
                                {
                                  student.name
                                }
                              </p>

                              <p className="mt-1 whitespace-nowrap text-xs text-slate-400">
                                {student.experience ||
                                  "未填寫經驗"}
                              </p>
                            </td>

                            <td className="whitespace-nowrap px-3 py-4 font-semibold text-violet-700">
                              {
                                student.points
                              }{" "}
                              點
                            </td>

                            <td className="whitespace-nowrap px-3 py-4 font-semibold text-sky-700">
                              {
                                student.rewardPoints
                              }{" "}
                              點
                            </td>

                            <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                              {student.phone ||
                                "未填寫"}
                            </td>

                            <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                              {formatDateTime(
                                student.createdAt
                              )}
                            </td>

                            <td className="whitespace-nowrap px-3 py-4">
                              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                {getWaitlistStatusLabel(
                                  student.status
                                )}
                              </span>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>

                  <p className="mt-4 text-xs leading-6 text-slate-400">
                    候補順序依加入候補時間顯示；有名額釋出時會通知所有候補會員，實際名額仍以完成預約者為準。
                  </p>
                </div>
              )
            ) : isLoading ? (
              <p className="py-10 text-center text-slate-600">
                名單載入中……
              </p>
            ) : visibleStudents.length ===
              0 ? (
              <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
                <p className="text-slate-600">
                  {tab ===
                  "active"
                    ? "目前尚無學生預約。"
                    : "目前沒有取消或特殊請假紀錄。"}
                </p>
              </div>
            ) : (
              <div className="mt-7 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-3 py-3 font-semibold">
                        姓名
                      </th>

                      <th className="px-3 py-3 font-semibold">
                        課程點數
                      </th>

                      <th className="px-3 py-3 font-semibold">
                        紅利
                      </th>

                      <th className="px-3 py-3 font-semibold">
                        電話
                      </th>

                      {tab ===
                      "active" ? (
                        <>
                          <th className="px-3 py-3 text-right font-semibold">
                            點名
                          </th>

                          <th className="px-3 py-3 text-right font-semibold">
                            管理
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-3 font-semibold">
                            狀態
                          </th>

                          <th className="px-3 py-3 font-semibold">
                            異動時間
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {visibleStudents.map(
                      (
                        student
                      ) => {
                        const isUpdating =
                          updatingBookingId ===
                          student.bookingId;

                        const isCancelling =
                          cancellingBookingId ===
                          student.bookingId;

                        return (
                          <tr
                            key={
                              student.bookingId
                            }
                            className="border-b border-slate-100"
                          >
                            <td className="px-3 py-4">
                              <p className="whitespace-nowrap font-semibold text-slate-900">
                                {
                                  student.name
                                }
                              </p>

                              <p className="mt-1 whitespace-nowrap text-xs font-normal text-slate-400">
                                {student.experience ||
                                  "未填寫經驗"}
                              </p>
                            </td>

                            <td className="whitespace-nowrap px-3 py-4 font-semibold text-violet-700">
                              {
                                student.points
                              }{" "}
                              點
                            </td>

                            <td className="whitespace-nowrap px-3 py-4 font-semibold text-sky-700">
                              {
                                student.rewardPoints
                              }{" "}
                              點
                            </td>

                            <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                              {student.phone ||
                                "未填寫"}
                            </td>

                            {tab ===
                            "active" ? (
                              <>
                                <td className="px-3 py-4">
                                  <div className="flex min-w-max justify-end gap-2">
                                    <button
                                      type="button"
                                      disabled={
                                        isUpdating ||
                                        isCancelling
                                      }
                                      onClick={() =>
                                        handleAttendanceChange(
                                          student.bookingId,
                                          "present"
                                        )
                                      }
                                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                                        student.attendanceStatus ===
                                        "present"
                                          ? "bg-emerald-600 text-white"
                                          : "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                      }`}
                                    >
                                      {isUpdating
                                        ? "更新中…"
                                        : "已到"}
                                    </button>

                                    <button
                                      type="button"
                                      disabled={
                                        isUpdating ||
                                        isCancelling
                                      }
                                      onClick={() =>
                                        handleAttendanceChange(
                                          student.bookingId,
                                          "absent"
                                        )
                                      }
                                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                                        student.attendanceStatus ===
                                        "absent"
                                          ? "bg-red-600 text-white"
                                          : "border border-red-300 text-red-600 hover:bg-red-50"
                                      }`}
                                    >
                                      缺席
                                    </button>

                                    <button
                                      type="button"
                                      disabled={
                                        isUpdating ||
                                        isCancelling
                                      }
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

                                <td className="px-3 py-4 text-right">
                                  <button
                                    type="button"
                                    disabled={
                                      isUpdating ||
                                      isCancelling
                                    }
                                    onClick={() =>
                                      setPendingCancel(
                                        student
                                      )
                                    }
                                    className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                                  >
                                    {isCancelling
                                      ? "取消中…"
                                      : "代取消"}
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="whitespace-nowrap px-3 py-4">
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                      student.status ===
                                      "special_leave"
                                        ? "bg-sky-50 text-sky-700"
                                        : student.status ===
                                          "admin_cancelled"
                                        ? "bg-violet-50 text-violet-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {getStatusLabel(
                                      student.status
                                    )}
                                  </span>
                                </td>

                                <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                                  {student.status ===
                                  "special_leave"
                                    ? formatDateTime(
                                        student.specialLeaveAt
                                      )
                                    : formatDateTime(
                                        student.cancelledAt
                                      )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 老師代取消確認視窗 */}
      {pendingCancel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 px-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-500">
              Admin Cancellation
            </p>

            <h3 className="mt-3 text-2xl font-bold text-slate-900">
              確定替學生取消？
            </h3>

            <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm leading-7 text-slate-700">
              <p>
                學生：
                <span className="font-semibold">
                  {
                    pendingCancel.name
                  }
                </span>
              </p>

              <p>
                課程：
                <span className="font-semibold">
                  {courseName}
                </span>
              </p>

              <p>
                預計退回：
                <span className="font-semibold">
                  {
                    pendingCancel.pointsUsed
                  }{" "}
                  點
                </span>
              </p>
            </div>


<div className="mt-4 space-y-4">
  <p className="text-sm leading-6 text-slate-500">
    課前代取消會全額退還課程點數並通知候補會員。
    課程開始後可使用課後補登取消，但不會通知候補會員。
  </p>

  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
    <p className="mb-3 text-sm font-bold text-slate-800">
      如果課程已開始，請選擇補登方式：
    </p>

    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="radio"
        name="afterCancelMode"
        value="after_absent"
        checked={afterCancelMode === "after_absent"}
        onChange={() => setAfterCancelMode("after_absent")}
        className="mt-1"
      />
      <span className="text-sm text-slate-700">
        <strong>未出席／誤預約</strong>
        <span className="mt-1 block text-slate-500">
          全額退點、扣回已發放的出席紅利，
          並將對應上課紀錄標記作廢。
        </span>
      </span>
    </label>

    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="radio"
        name="afterCancelMode"
        value="after_compensation"
        checked={afterCancelMode === "after_compensation"}
        onChange={() =>
          setAfterCancelMode("after_compensation")
        }
        className="mt-1"
      />
      <span className="text-sm text-slate-700">
        <strong>已出席／補償退點</strong>
        <span className="mt-1 block text-slate-500">
          全額退點，但保留出席紅利及上課紀錄。
          僅適用於已點名出席並發放紅利的會員。
        </span>
      </span>
    </label>
  </div>
</div>


            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setPendingCancel(
                    null
                  )
                }
                disabled={Boolean(
                  cancellingBookingId
                )}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50"
              >
                返回
              </button>

              <button
                type="button"
                onClick={
                  handleAdminCancel
                }
                disabled={Boolean(
                  cancellingBookingId
                )}
                className="flex-1 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {cancellingBookingId
                  ? "處理中……"
                  : "確認代取消"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}