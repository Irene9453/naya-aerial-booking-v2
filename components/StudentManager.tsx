"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

import AdminPointButton from "@/components/AdminPointButton";
import SellPackageButton from "@/components/SellPackageButton";
import StudentDetailModal from "@/components/StudentDetailModal";
import ExportStudentLessonRecordsButton from "@/components/ExportStudentLessonRecordsButton";
import AddLegacyStudentButton from "@/components/AddLegacyStudentButton";
import StudentJourneyModal from "@/components/StudentJourneyModal";

export type StudentData = {
  id: string;
  name: string;
  nickname: string;
  email: string;
  phone: string;
  phoneNormalized: string;
  experience: string;

  points: number;
  rewardPoints: number;
journeyLegacyClasses?: number;

  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;

  role: string;
};

type StudentManagerProps = {
  students: StudentData[];
};

function normalizeTaiwanPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function isValidTaiwanMobile(phone: string) {
  return /^09\d{8}$/.test(phone);
}

function formatBirthday(student: StudentData) {
  if (
    !student.birthdayMonth ||
    !student.birthdayDay
  ) {
    return "未填寫";
  }

  const month = String(
    student.birthdayMonth
  ).padStart(2, "0");

  const day = String(
    student.birthdayDay
  ).padStart(2, "0");

  if (student.birthdayYear) {
    return `${student.birthdayYear}/${month}/${day}`;
  }

  return `${month}/${day}`;
}

export default function StudentManager({
  students,
}: StudentManagerProps) {

  const [journeyStudent, setJourneyStudent] =
  useState<StudentData | null>(null);
  const [searchText, setSearchText] =
    useState("");
  // NAYA_COUPON_AVAILABLE_COUNTS
  const [couponCounts, setCouponCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadCouponCounts() {
      try {
        const snapshot = await getDocs(collection(db, "userCoupons"));
        const counts: Record<string, number> = {};

        for (const item of snapshot.docs) {
          const data = item.data();

          if (
            data.status === "available" &&
            typeof data.userId === "string"
          ) {
            counts[data.userId] = (counts[data.userId] ?? 0) + 1;
          }
        }

        if (!cancelled) {
          setCouponCounts(counts);
        }
      } catch (error) {
        console.error("載入會員優惠券張數失敗：", error);
      }
    }

    void loadCouponCounts();

    return () => {
      cancelled = true;
    };
  }, [students]);
  // NAYA_MEMBER_COUPON_COLUMN
  const [couponStudent, setCouponStudent] = useState<StudentData | null>(null);
  const [memberCoupons, setMemberCoupons] = useState<Record<string, unknown>[]>([]);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  async function openMemberCoupons(student: StudentData) {
    setCouponStudent(student);
    setMemberCoupons([]);
    setCouponError("");
    setCouponLoading(true);

    try {
      const couponQuery = query(
        collection(db, "userCoupons"),
        where("userId", "==", student.id)
      );

      const snapshot = await getDocs(couponQuery);

      setMemberCoupons(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Record<string, unknown>[]
      );
    } catch (error: unknown) {
      console.error("讀取會員優惠券失敗", error);
      setCouponError(
        error instanceof Error
          ? error.message
          : "讀取失敗，請確認 Firebase 權限。"
      );
    } finally {
      setCouponLoading(false);
    }
  }

  const [filterType, setFilterType] =
    useState<
      | "all"
      | "birthday"
      | "lowPoints"
      | "hasRewards"
    >("all");

  const [
    viewingStudent,
    setViewingStudent,
  ] = useState<StudentData | null>(null);

  const [
    editingStudent,
    setEditingStudent,
  ] = useState<StudentData | null>(null);

  const [name, setName] = useState("");
const [nickname, setNickname] = useState("");
const [phone, setPhone] = useState("");

  const [experience, setExperience] =
    useState("");

  const [
    birthdayYear,
    setBirthdayYear,
  ] = useState("");

  const [
    birthdayMonth,
    setBirthdayMonth,
  ] = useState("");

  const [
    birthdayDay,
    setBirthdayDay,
  ] = useState("");

  const [points, setPoints] =
    useState("");

  const [
    rewardPoints,
    setRewardPoints,
  ] = useState("");

  const [isSaving, setIsSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const currentTaipeiMonth = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      month: "numeric",
    }).format(new Date())
  );

  const studentList = students
    .filter(
      (student) =>
        student.role === "student"
    )
    .filter((student) => {
      const keyword = searchText
        .trim()
        .toLowerCase();

      const matchesSearch =
  !keyword ||
  student.name
    .toLowerCase()
    .includes(keyword) ||
  (student.nickname ?? "")
    .toLowerCase()
    .includes(keyword) ||
  student.email
    .toLowerCase()
    .includes(keyword) ||
  student.phone.includes(keyword);

      if (!matchesSearch) {
        return false;
      }

      if (
        filterType === "birthday"
      ) {
        return (
          student.birthdayMonth ===
          currentTaipeiMonth
        );
      }

      if (
        filterType === "lowPoints"
      ) {
        return student.points <= 6;
      }

      if (
        filterType === "hasRewards"
      ) {
        return (
          student.rewardPoints > 0
        );
      }

      return true;
    });

  function openEditModal(
    student: StudentData
  ) {
    setEditingStudent(student);

    setName(student.name);
setNickname(student.nickname ?? "");
setPhone(student.phone);
    setExperience(
      student.experience
    );

    setBirthdayYear(
      student.birthdayYear
        ? String(
            student.birthdayYear
          )
        : ""
    );

    setBirthdayMonth(
      student.birthdayMonth
        ? String(
            student.birthdayMonth
          )
        : ""
    );

    setBirthdayDay(
      student.birthdayDay
        ? String(
            student.birthdayDay
          )
        : ""
    );

    setPoints(
      String(
        student.points ?? 0
      )
    );

    setRewardPoints(
      String(
        student.rewardPoints ?? 0
      )
    );

    setMessage("");
  }

  function closeEditModal() {
    if (isSaving) {
      return;
    }

    setEditingStudent(null);
    setMessage("");
  }

  async function handleSaveStudent() {
    if (!editingStudent) {
      return;
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
      setMessage("請填寫會員姓名。");
      return;
    }

    const normalizedPhone =
      normalizeTaiwanPhone(phone);

    if (
      !isValidTaiwanMobile(
        normalizedPhone
      )
    ) {
      setMessage(
        "請輸入正確的台灣手機號碼，例如 0912345678。"
      );
      return;
    }

    const parsedYear =
  birthdayYear.trim()
    ? Number(birthdayYear)
    : 0;

const parsedMonth =
  birthdayMonth.trim()
    ? Number(birthdayMonth)
    : 0;

const parsedDay =
  birthdayDay.trim()
    ? Number(birthdayDay)
    : 0;

const hasAnyBirthday =
  Boolean(
    birthdayYear.trim() ||
    birthdayMonth.trim() ||
    birthdayDay.trim()
  );

if (hasAnyBirthday) {
  if (
    parsedMonth < 1 ||
    parsedMonth > 12
  ) {
    setMessage(
      "生日月份請輸入 1～12。"
    );
    return;
  }

  if (
    parsedDay < 1 ||
    parsedDay > 31
  ) {
    setMessage(
      "生日日期請輸入 1～31。"
    );
    return;
  }

  if (
    parsedYear &&
    (parsedYear < 1900 ||
      parsedYear > 2100)
  ) {
    setMessage(
      "生日年份格式不正確。"
    );
    return;
  }
}

    const parsedPoints = Number(points);
    const parsedRewardPoints =
      Number(rewardPoints);

    if (
      !Number.isInteger(parsedPoints) ||
      parsedPoints < 0
    ) {
      setMessage(
        "課程點數必須是 0 以上的整數。"
      );
      return;
    }

    if (
      !Number.isInteger(
        parsedRewardPoints
      ) ||
      parsedRewardPoints < 0
    ) {
      setMessage(
        "紅利點數必須是 0 以上的整數。"
      );
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const userRef = doc(
        db,
        "users",
        editingStudent.id
      );

      const oldPhone =
        editingStudent.phoneNormalized ||
        normalizeTaiwanPhone(
          editingStudent.phone
        );

      await runTransaction(
        db,
        async (transaction) => {
          /*
           * 如果老師修改了手機，
           * 先檢查新手機是否已有其他會員使用。
           */
          if (
            normalizedPhone !== oldPhone
          ) {
            const newPhoneRegistryRef =
              doc(
                db,
                "phoneRegistry",
                normalizedPhone
              );

            const newPhoneSnapshot =
              await transaction.get(
                newPhoneRegistryRef
              );

            if (
              newPhoneSnapshot.exists()
            ) {
              const registryData =
                newPhoneSnapshot.data();

              if (
                String(
                  registryData.userId ??
                    ""
                ) !== editingStudent.id
              ) {
                throw new Error(
                  "PHONE_ALREADY_REGISTERED"
                );
              }
            }

            transaction.set(
              newPhoneRegistryRef,
              {
                userId:
                  editingStudent.id,

                phone:
                  normalizedPhone,

                createdAt:
                  serverTimestamp(),
              }
            );

            /*
             * 舊電話 Registry 不直接刪除，
             * 避免 Rules / 歷史資料問題。
             * 改成標記 replaced。
             */
            if (oldPhone) {
              const oldPhoneRegistryRef =
                doc(
                  db,
                  "phoneRegistry",
                  oldPhone
                );

              transaction.set(
                oldPhoneRegistryRef,
                {
                  userId:
                    editingStudent.id,

                  phone: oldPhone,

                  status: "replaced",

                  replacedBy:
                    normalizedPhone,

                  updatedAt:
                    serverTimestamp(),
                },
                {
                  merge: true,
                }
              );
            }
          }

          transaction.update(
            userRef,
            {
              name: trimmedName,

nickname: nickname.trim(),

phone:
  normalizedPhone,

              phoneNormalized:
                normalizedPhone,

              experience,

              birthdayYear:
                parsedYear,

              birthdayMonth:
                parsedMonth,

              birthdayDay:
                parsedDay,

              points:
                parsedPoints,

              rewardPoints:
                parsedRewardPoints,

              updatedAt:
                serverTimestamp(),
            }
          );
        }
      );

      setMessage(
        "會員資料已更新。"
      );

      setTimeout(() => {
        setEditingStudent(null);
        setMessage("");
      }, 700);
    } catch (error: unknown) {
      console.error(error);

      if (
        error instanceof Error &&
        error.message ===
          "PHONE_ALREADY_REGISTERED"
      ) {
        setMessage(
          "這支手機號碼已被其他會員使用。"
        );
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : "更新會員資料失敗。"
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
  <>
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      {/* 標題 */}
<div className="flex flex-wrap items-center justify-between gap-4">
  <div>
    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
      Students
    </p>

    <h2 className="mt-2 text-2xl font-bold text-slate-900">
      會員與點數
    </h2>

    <p className="mt-2 text-sm text-slate-500">
      目前共有{" "}
      {
        students.filter(
          (student) =>
            student.role ===
            "student"
        ).length
      }{" "}
      位學生
    </p>
  </div>

  <div className="flex flex-wrap gap-3">
    <AddLegacyStudentButton />

    <ExportStudentLessonRecordsButton />
  </div>
</div>

      {/* 搜尋與篩選 */}
      <div className="mt-7 rounded-2xl bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <label
              htmlFor="studentSearch"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              搜尋會員
            </label>

            <input
              id="studentSearch"
              type="text"
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              placeholder="搜尋姓名、暱稱、Email 或手機號碼"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              篩選
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setFilterType("all")
                }
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  filterType === "all"
                    ? "bg-sky-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600"
                }`}
              >
                全部
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilterType("birthday")
                }
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  filterType === "birthday"
                    ? "bg-pink-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600"
                }`}
              >
                本月生日
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilterType("lowPoints")
                }
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  filterType === "lowPoints"
                    ? "bg-amber-500 text-white"
                    : "border border-slate-300 bg-white text-slate-600"
                }`}
              >
                低點數
              </button>

              <button
                type="button"
                onClick={() =>
                  setFilterType("hasRewards")
                }
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  filterType === "hasRewards"
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600"
                }`}
              >
                有紅利
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-slate-500">
            顯示 {studentList.length} 位會員
          </p>

          {(searchText ||
            filterType !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchText("");
                setFilterType("all");
              }}
              className="font-semibold text-sky-700"
            >
              清除搜尋與篩選
            </button>
          )}
        </div>
      </div>

      {/* 會員列表 */}
      {studentList.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            沒有符合條件的會員。
          </p>
        </div>
      ) : (
        <div className="mt-7 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 font-semibold">
                  姓名
                </th>

                <th className="px-4 py-3 font-semibold">
                  Email
                </th>

                <th className="px-4 py-3 font-semibold">
                  電話
                </th>

                <th className="px-4 py-3 font-semibold">
                  生日
                </th>

                <th className="px-4 py-3 font-semibold">
                  經驗
                </th>

                <th className="px-4 py-3 text-right font-semibold">
                  課程點數
                </th>

                <th className="px-4 py-3 text-right font-semibold">
                  紅利
                </th>
                <th className="px-4 py-3 text-center font-semibold">
                  優惠券
                </th>

                <th className="px-4 py-3 text-right font-semibold">
                  操作
                </th>
              </tr>
            </thead>

            <tbody>
              {studentList.map((student) => (
                <tr
                  key={student.id}
                  className="border-b border-slate-100"
                >
                  <td className="whitespace-nowrap px-4 py-4">
  <p className="font-semibold text-slate-900">
    {student.name || "未填寫"}
  </p>

  {student.nickname && (
    <p className="mt-1 text-xs font-medium text-sky-600">
      {student.nickname}
    </p>
  )}
</td>

                  <td className="px-4 py-4 text-slate-600">
                    {student.email || "未填寫"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {student.phone || "未填寫"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {formatBirthday(student)}
                  </td>

                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {student.experience ||
                      "未填寫"}
                  </td>

                  <td className="px-4 py-4 text-right text-lg font-bold text-sky-600">
                    {student.points}
                  </td>

                  <td className="px-4 py-4 text-right font-semibold text-amber-600">
                    {student.rewardPoints ?? 0}
                  </td>
                  {/* NAYA_MEMBER_COUPON_COLUMN */}
                  <td className="px-4 py-4 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => void openMemberCoupons(student)}
                      className="rounded-xl border border-pink-300 px-3 py-2 text-sm font-semibold text-pink-700 hover:bg-pink-50"
                    >
                      可用 {couponCounts[student.id] ?? 0} 張｜查看優惠券
                    </button>
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex min-w-max justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setViewingStudent(
                            student
                          )
                        }
                        className="rounded-xl border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                      >
                        查看紀錄
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openEditModal(student)
                        }
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        編輯會員
                      </button>
<button
  type="button"
  onClick={() => setJourneyStudent(student)}
  className="rounded-xl border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
>
  🪽 空中旅程
</button>
                      <SellPackageButton
                        studentId={student.id}
                        studentName={student.name}
                        currentPoints={
                          student.points
                        }
                      />

                      <AdminPointButton
                        studentId={student.id}
                        studentName={student.name}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>

    {/* 會員詳細紀錄 */}
    {viewingStudent && (
      <StudentDetailModal
        student={viewingStudent}
        onClose={() => setViewingStudent(null)}
      />
    )}
{/* 編輯會員 Modal */}
      {/* 編輯會員 Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-5 py-8">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Edit Student
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              編輯會員資料
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Email 為會員登入帳號，
              此處不直接修改。
            </p>

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  姓名（本名）
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>
<div>
  <label className="mb-2 block text-sm font-semibold text-slate-700">
    暱稱／綽號
  </label>

  <input
    type="text"
    value={nickname}
    onChange={(event) =>
      setNickname(event.target.value)
    }
    placeholder="選填"
    maxLength={20}
    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
  />
</div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Email
                </label>

                <input
                  type="email"
                  value={
                    editingStudent.email
                  }
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  手機
                </label>

                <input
                  type="tel"
                  value={phone}
                  onChange={(event) =>
                    setPhone(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  空中運動經驗
                </label>

                <select
                  value={experience}
                  onChange={(event) =>
                    setExperience(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500"
                >
                  <option value="">
                    請選擇
                  </option>

                  <option value="第一次體驗">
                    第一次體驗
                  </option>

                  <option value="未滿三個月">
                    未滿三個月
                  </option>

                  <option value="三個月至一年">
                    三個月至一年
                  </option>

                  <option value="一年以上">
                    一年以上
                  </option>
                </select>
              </div>
            </div>

            {/* 生日 */}
            <div className="mt-6">
              <p className="mb-3 font-semibold text-slate-800">
                生日
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    年
                  </label>

                  <input
                    type="number"
                    value={birthdayYear}
                    onChange={(event) =>
                      setBirthdayYear(
                        event.target.value
                      )
                    }
                    placeholder="1995"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    月
                  </label>

                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={birthdayMonth}
                    onChange={(event) =>
                      setBirthdayMonth(
                        event.target.value
                      )
                    }
                    placeholder="8"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    日
                  </label>

                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={birthdayDay}
                    onChange={(event) =>
                      setBirthdayDay(
                        event.target.value
                      )
                    }
                    placeholder="12"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                生日月份會直接影響生日 7 折優惠資格。
              </p>
            </div>

            {/* 點數 */}
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  課程點數
                </label>

                <input
                  type="number"
                  min={0}
                  step={1}
                  value={points}
                  onChange={(event) =>
                    setPoints(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  紅利點數
                </label>

                <input
                  type="number"
                  min={0}
                  step={1}
                  value={rewardPoints}
                  onChange={(event) =>
                    setRewardPoints(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {message && (
              <p
                className={`mt-5 rounded-xl px-4 py-3 text-sm ${
                  message.includes(
                    "已更新"
                  )
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {message}
              </p>
            )}

            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSaving}
                className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50"
              >
                取消
              </button>

              <button
                type="button"
                onClick={
                  handleSaveStudent
                }
                disabled={isSaving}
                className="rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {isSaving
                  ? "儲存中……"
                  : "儲存變更"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* NAYA_MEMBER_COUPON_COLUMN: 優惠券明細 */}
      {couponStudent && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {couponStudent.name}｜優惠券
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {couponStudent.phone || couponStudent.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCouponStudent(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
              >
                關閉
              </button>
            </div>

            {couponLoading ? (
              <p className="py-8 text-center text-slate-500">載入中……</p>
            ) : couponError ? (
              <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {couponError}
              </p>
            ) : (
              <>
                <p className="mt-5 text-sm text-slate-600">
                  共 {memberCoupons.length} 張優惠券
                </p>

                {memberCoupons.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-slate-50 p-5 text-center text-slate-500">
                    目前沒有查到優惠券。
                  </p>
                ) : (
                  <div className="mt-3 max-h-[55vh] space-y-3 overflow-y-auto">
                    {memberCoupons.map((coupon, index) => (
                      <div
                        key={String(coupon.id ?? index)}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-slate-900">
                            {String(coupon.name ?? coupon.couponName ?? coupon.couponId ?? "優惠券")}
                          </p>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                            {coupon.status === "available"
                              ? "可使用"
                              : coupon.status === "used"
                                ? "已使用"
                                : String(coupon.status ?? "狀態未知")}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                          <p>
                            折扣：{
                              typeof coupon.discountRate === "number"
                                ? `${Math.round(coupon.discountRate * 10)} 折`
                                : "未提供"
                            }
                          </p>
                          <p>取得方式：{String(coupon.source ?? "未記錄")}</p>
                          <p>優惠券 ID：{String(coupon.couponId ?? "—")}</p>
                          <p>紀錄 ID：{String(coupon.id ?? "—")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {journeyStudent && (
  <StudentJourneyModal
    student={journeyStudent}
    onClose={() => setJourneyStudent(null)}
  />
)}
    </>
  );
}
