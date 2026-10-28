"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  updateDoc,
} from "firebase/firestore";

export default function LegacyMemberClaim() {
  const [phone, setPhone] =
    useState("");

  const [birthdayYear, setBirthdayYear] =
    useState("");

  const [birthdayMonth, setBirthdayMonth] =
    useState("");

  const [birthdayDay, setBirthdayDay] =
    useState("");

  const [isOpen, setIsOpen] =
    useState(false);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [isSuccess, setIsSuccess] =
    useState(false);

  const [claimStatus, setClaimStatus] =
    useState<"loading" | "none" | "pending" | "approved" | "rejected" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadClaimStatus() {
      try {
        const user = auth.currentUser;

        if (!user) {
          if (!cancelled) setClaimStatus("error");
          return;
        }

        const token = await user.getIdToken();

        const response = await fetch("/api/legacy-members/status", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("無法取得認領狀態");
        }

        const data = await response.json();

        if (!cancelled) {
          const status = data.status;

          if (
            status === "none" ||
            status === "pending" ||
            status === "approved" ||
            status === "rejected"
          ) {
            setClaimStatus(status);
          } else {
            setClaimStatus("error");
          }
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setClaimStatus("error");
      }
    }

    loadClaimStatus();

    return () => {
      cancelled = true;
    };
  }, []);
async function handleMarkAsNewMember() {
    const user = auth.currentUser;

    if (!user) {
      setMessage("請先登入會員帳號。");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      await updateDoc(
        doc(db, "users", user.uid),
        {
          legacyStatus: "new",
        }
      );

      setMessage("已設定為新會員。");
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "更新會員狀態失敗。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClaim() {
    setMessage("");
    setIsSuccess(false);

    const user =
      auth.currentUser;

    if (!user) {
      setMessage(
        "請先登入會員帳號。"
      );
      return;
    }

    if (!phone.trim()) {
      setMessage(
        "請輸入舊系統登記的手機號碼。"
      );
      return;
    }

    if (
      !birthdayYear.trim() ||
      !birthdayMonth.trim() ||
      !birthdayDay.trim()
    ) {
      setMessage(
        "請輸入完整出生年月日。"
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const idToken =
        await user.getIdToken();

      const response =
        await fetch(
          "/api/admin/legacy-members/claim",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${idToken}`,
            },

            body: JSON.stringify({
              phone:
                phone.trim(),

              birthdayYear:
                birthdayYear.trim()
                  ? Number(
                      birthdayYear
                    )
                  : 0,

              birthdayMonth:
                Number(
                  birthdayMonth
                ),

              birthdayDay:
                Number(
                  birthdayDay
                ),
            }),
          }
        );

      const responseText =
  await response.text();

let data: {
  success?: boolean;
  error?: string;
  message?: string;
  points?: number;
  rewardPoints?: number;
  newPointBalance?: number;
  newRewardBalance?: number;
} = {};

try {
  data = responseText
    ? JSON.parse(responseText)
    : {};
} catch {
  console.error(
    "認領 API 回傳非 JSON：",
    responseText
  );

  throw new Error(
    `認領 API 執行失敗（HTTP ${response.status}），請查看 Terminal 錯誤訊息。`
  );
}

if (!response.ok) {
  throw new Error(
    data.error ||
      "認領失敗。"
  );
}
      setIsSuccess(true);

setMessage(
  data.message || "認領申請已送出，請等待老師審核。"
);

    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "認領舊會員資料失敗。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (claimStatus === "loading") {
    return (
      <div className="mt-8 rounded-2xl bg-slate-50 p-5 text-slate-600">
        正在確認舊會員認領狀態……
      </div>
    );
  }

  if (claimStatus === "error") {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        暫時無法取得認領狀態，請重新整理頁面後再試。
      </div>
    );
  }

  if (claimStatus === "pending" || isSuccess) {
    return (
      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
        ⏳ 認領申請已送出，正在等待老師審核。
      </div>
    );
  }

  if (claimStatus === "approved") {
    return (
      <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800">
        ✓ 舊會員點數已成功移轉
      </div>
    );
  }

  if (claimStatus === "rejected" && !isOpen) {
    return (
      <div className="mt-8 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-orange-800">
        <p>認領申請未通過，請確認資料後重新申請。</p>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="mt-3 rounded-xl bg-orange-600 px-5 py-2 font-semibold text-white"
        >
          重新申請
        </button>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <article className="mt-8 rounded-3xl border border-emerald-100 bg-emerald-50 p-7 shadow-sm md:p-9">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Legacy Member
        </p>

        <h2 className="mt-2 text-2xl font-bold text-slate-900">
          舊會員資料已完成移轉
        </h2>

        <p className="mt-4 text-emerald-700">
          {message}
        </p>
      </article>
    );
  }

  return (
    <article className="mt-8 rounded-3xl border border-violet-100 bg-white p-7 shadow-sm md:p-9">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
            Legacy Member
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            舊系統會員？
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            如果你在舊系統仍有課程點數，可以使用原登記資料認領。
          </p>
        </div>

        {!isOpen && (
  <div className="flex flex-wrap gap-3">
    <button
      type="button"
      onClick={() => {
        setMessage("");
        setIsOpen(true);
      }}
      className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-700"
    >
      我是舊會員
    </button>

    <button
      type="button"
      onClick={handleMarkAsNewMember}
      disabled={isSubmitting}
      className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSubmitting
        ? "設定中……"
        : "我是新會員"}
    </button>
  </div>
)}
      </div>

      {isOpen && (
        <div className="mt-6 rounded-2xl bg-violet-50/60 p-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              舊系統登記手機 *
            </label>

            <input
              type="tel"
              value={phone}
              onChange={(event) =>
                setPhone(
                  event.target.value
                )
              }
              placeholder="0912345678"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-violet-500"
            />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              生日 *
            </p>

            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                value={birthdayYear}
                onChange={(event) =>
                  setBirthdayYear(
                    event.target.value
                  )
                }
                placeholder="年"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              />

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
                placeholder="月"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              />

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
                placeholder="日"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              />
            </div>

            <p className="mt-2 text-xs text-slate-500">
              請填寫舊系統登記的完整出生年月日。
            </p>
          </div>

          {message && (
            <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {message}
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setMessage("");
              }}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50"
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleClaim}
              disabled={isSubmitting}
              className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {isSubmitting
                ? "認領中……"
                : "確認認領"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

