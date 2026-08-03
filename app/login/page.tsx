"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);

      setMessage("登入成功，正在前往會員中心……");
      router.push("/member");
    } catch (error: unknown) {
      console.error(error);

      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(error.code)
          : "";

      if (
        errorCode === "auth/invalid-credential" ||
        errorCode === "auth/wrong-password" ||
        errorCode === "auth/user-not-found"
      ) {
        setMessage("Email 或密碼不正確。");
      } else if (errorCode === "auth/invalid-email") {
        setMessage("Email 格式不正確。");
      } else if (errorCode === "auth/too-many-requests") {
        setMessage("嘗試次數過多，請稍後再試。");
      } else {
        setMessage(`登入失敗：${errorCode || "未知錯誤"}`);
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
            Member Login
          </p>

          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            會員登入
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            登入後即可查看點數、預約課程與管理自己的預約。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-10"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-2 block font-semibold text-slate-800"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="請輸入 Email"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>

          <div className="mt-6">
            <label
              htmlFor="password"
              className="mb-2 block font-semibold text-slate-800"
            >
              密碼
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="請輸入密碼"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-8 w-full rounded-xl bg-sky-600 px-6 py-3.5 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "登入中……" : "登入"}
          </button>

          {message && (
            <p className="mt-5 text-center text-sm leading-6 text-slate-600">
              {message}
            </p>
          )}

          <p className="mt-7 text-center text-sm text-slate-600">
            還沒有會員帳號？
            <Link
              href="/register"
              className="ml-2 font-semibold text-sky-700 hover:text-sky-800"
            >
              前往註冊
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}