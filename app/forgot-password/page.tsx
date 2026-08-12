"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setIsSubmitting(true);

    try {
      await sendPasswordResetEmail(
        auth,
        email.trim()
      );

      setMessage(
        "密碼重設信已寄出，請前往信箱查看。"
      );
    } catch (error: unknown) {
      console.error(error);

      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(
              (
                error as {
                  code?: string;
                }
              ).code ?? ""
            )
          : "";

      if (
        errorCode === "auth/invalid-email"
      ) {
        setMessage(
          "Email 格式不正確。"
        );
      } else if (
        errorCode ===
        "auth/too-many-requests"
      ) {
        setMessage(
          "嘗試次數過多，請稍後再試。"
        );
      } else {
        setMessage(
          "如果這個 Email 已註冊，我們會寄送密碼重設信給你。"
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-md">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Reset Password
          </p>

          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            忘記密碼
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            輸入註冊時使用的 Email，我們會寄送密碼重設信給你。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-10"
        >
          <label
            htmlFor="email"
            className="mb-2 block font-semibold text-slate-800"
          >
            Email
          </label>

          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="請輸入註冊 Email"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-8 w-full rounded-xl bg-sky-600 px-6 py-3.5 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "寄送中……"
              : "寄送密碼重設信"}
          </button>

          {message && (
            <p className="mt-5 text-center text-sm leading-6 text-slate-600">
              {message}
            </p>
          )}

          <p className="mt-7 text-center text-sm">
            <Link
              href="/login"
              className="font-semibold text-sky-700 hover:text-sky-800"
            >
              返回會員登入
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}