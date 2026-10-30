"use client";

import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type LegacyStudentForm = {
  name: string;
  phone: string;

  birthdayYear: string;
  birthdayMonth: string;
  birthdayDay: string;

  points: string;
  rewardPoints: string;
};

const initialForm: LegacyStudentForm = {
  name: "",
  phone: "",

  birthdayYear: "",
  birthdayMonth: "",
  birthdayDay: "",

  points: "0",
  rewardPoints: "0",
};

function normalizeTaiwanPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function isValidTaiwanMobile(phone: string) {
  return /^09\d{8}$/.test(phone);
}

export default function AddLegacyStudentButton() {
  const [isOpen, setIsOpen] =
    useState(false);

  const [form, setForm] =
    useState<LegacyStudentForm>(
      initialForm
    );

  const [isSaving, setIsSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  function updateField(
    field: keyof LegacyStudentForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function closeModal() {
    if (isSaving) {
      return;
    }

    setIsOpen(false);
    setMessage("");
  }

  async function handleCreate() {
    setMessage("");

    const name =
      form.name.trim();

    const phone =
      normalizeTaiwanPhone(
        form.phone
      );

    const points =
      Number(form.points);

    const rewardPoints =
      Number(form.rewardPoints);

    const birthdayYear =
      form.birthdayYear.trim()
        ? Number(
            form.birthdayYear
          )
        : 0;

    const birthdayMonth =
      form.birthdayMonth.trim()
        ? Number(
            form.birthdayMonth
          )
        : 0;

    const birthdayDay =
      form.birthdayDay.trim()
        ? Number(
            form.birthdayDay
          )
        : 0;

    if (!name) {
      setMessage(
        "請填寫會員姓名。"
      );
      return;
    }

    if (
      !isValidTaiwanMobile(phone)
    ) {
      setMessage(
        "請輸入正確的台灣手機號碼，例如 0912345678。"
      );
      return;
    }

    if (
      birthdayMonth < 1 ||
      birthdayMonth > 12
    ) {
      setMessage(
        "生日月份請輸入 1～12。"
      );
      return;
    }

    if (
      birthdayDay < 1 ||
      birthdayDay > 31
    ) {
      setMessage(
        "生日日期請輸入 1～31。"
      );
      return;
    }

    if (
      birthdayYear &&
      (
        birthdayYear < 1900 ||
        birthdayYear > 2100
      )
    ) {
      setMessage(
        "生日年份格式不正確。"
      );
      return;
    }

    if (
      !Number.isInteger(points) ||
      points < 0
    ) {
      setMessage(
        "舊系統剩餘點數必須是 0 以上的整數。"
      );
      return;
    }

    if (
      !Number.isInteger(
        rewardPoints
      ) ||
      rewardPoints < 0
    ) {
      setMessage(
        "紅利點數必須是 0 以上的整數。"
      );
      return;
    }

    setIsSaving(true);

    try {
      await addDoc(
        collection(
          db,
          "legacyMembers"
        ),
        {
          name,

          phone,
          phoneNormalized:
            phone,

          birthdayYear,
          birthdayMonth,
          birthdayDay,

          points,
          rewardPoints,

          status:
            "unclaimed",

          claimedBy:
            null,

          claimedAt:
            null,

          createdAt:
            serverTimestamp(),
        }
      );

      setMessage(
        "舊會員資料已建立，等待學生認領。"
      );

      setForm(
        initialForm
      );

      setTimeout(() => {
        setIsOpen(false);
        setMessage("");
      }, 900);
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "建立舊會員資料失敗。"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setIsOpen(true);
        }}
        className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700"
      >
        ＋ 新增舊會員
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-900/60 px-4 py-8">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
                  Legacy Member
                </p>

                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  新增待認領舊會員
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  先建立舊系統會員資料，之後由學生註冊新帳號並認領原有點數。
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={
                  isSaving
                }
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                關閉
              </button>
            </div>

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  姓名 *
                </label>

                <input
                  type="text"
                  value={
                    form.name
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "name",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  手機 *
                </label>

                <input
                  type="tel"
                  value={
                    form.phone
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "phone",
                      event.target.value
                    )
                  }
                  placeholder="0912345678"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="mt-6">
              <p className="mb-3 font-semibold text-slate-800">
                生日 *
              </p>

              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  placeholder="年"
                  value={
                    form.birthdayYear
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "birthdayYear",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />

                <input
                  type="number"
                  min={1}
                  max={12}
                  placeholder="月"
                  value={
                    form.birthdayMonth
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "birthdayMonth",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />

                <input
                  type="number"
                  min={1}
                  max={31}
                  placeholder="日"
                  value={
                    form.birthdayDay
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "birthdayDay",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  舊系統剩餘課程點數 *
                </label>

                <input
                  type="number"
                  min={0}
                  step={1}
                  value={
                    form.points
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "points",
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
                  value={
                    form.rewardPoints
                  }
                  onChange={(
                    event
                  ) =>
                    updateField(
                      "rewardPoints",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              這裡只建立「待認領舊會員資料」，不會建立 Email 登入帳號。學生之後會自己註冊新系統帳號，再透過手機與生日認領原有點數。
            </div>

            {message && (
              <p
                className={`mt-5 rounded-xl px-4 py-3 text-sm ${
                  message.includes(
                    "已建立"
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
                onClick={closeModal}
                disabled={
                  isSaving
                }
                className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50"
              >
                取消
              </button>

              <button
                type="button"
                onClick={
                  handleCreate
                }
                disabled={
                  isSaving
                }
                className="rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {isSaving
                  ? "建立中……"
                  : "建立待認領會員"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}