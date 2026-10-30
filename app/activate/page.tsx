"use client";

import Link from "next/link";
import { useState } from "react";
import {
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ActivateAccountPage() {
  const [email, setEmail] =
    useState("");

  const [isSending, setIsSending] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [isSuccess, setIsSuccess] =
    useState(false);

  async function handleSend() {
    setMessage("");
    setIsSuccess(false);

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setMessage(
        "請輸入你原本登記的 Email。"
      );
      return;
    }

    setIsSending(true);

    try {
      await sendPasswordResetEmail(
        auth,
        normalizedEmail,
        {
          url: `${window.location.origin}/login`,
        }
      );

      setIsSuccess(true);

      setMessage(
        "設定密碼信已寄出，請至信箱查看。完成設定後即可使用新系統登入。"
      );
    } catch (error: unknown) {
      console.error(error);

      /*
       * 不直接告訴使用者 Email 是否存在，
       * 避免洩漏會員帳號資訊。
       */
      setIsSuccess(true);

      setMessage(
        "如果此 Email 已建立會員帳號，我們會寄送設定密碼信至你的信箱。請稍後查看收件匣與垃圾郵件。"
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Account Activation
          </p>

          <h1 className="mt-3 text-3xl font-bold text-slate-900 md:text-4xl">
            舊會員首次登入
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            原有課程點數已移轉至新系統。
            請使用舊系統登記的 Email 設定新密碼。
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">
          <label className="block text-sm font-semibold text-slate-700">
            原登記 Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="example@email.com"
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="mt-6 w-full rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending
              ? "寄送中……"
              : "寄送設定密碼信"}
          </button>

          {message && (
            <p
              className={`mt-5 rounded-xl px-4 py-3 text-sm leading-6 ${
                isSuccess
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {message}
            </p>
          )}

          <div className="mt-7 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm text-slate-500">
              已經設定過密碼？
            </p>

            <Link
              href="/login"
              className="mt-2 inline-block font-semibold text-sky-700 hover:text-sky-800"
            >
              回會員登入
            </Link>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-white/70 px-5 py-4 text-sm leading-6 text-slate-500">
          若沒有收到信件，請先確認垃圾郵件，並確認輸入的是舊系統原本登記的 Email。
        </div>
      </div>
    </section>
  );
}