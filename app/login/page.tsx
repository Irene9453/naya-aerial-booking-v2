"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

function getSafeRedirectPath() {
  if (typeof window === "undefined") {
    return "/member";
  }

  const params = new URLSearchParams(
    window.location.search
  );

  const redirect = params.get("redirect");

  if (!redirect) {
    return "/member";
  }

  // 只允許站內路徑，避免跳轉外部網站
  if (
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    redirect.includes("\\")
  ) {
    return "/member";
  }

  return redirect;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      // 1. Firebase 登入
      const credential =
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
await credential.user.reload();

if (!credential.user.emailVerified) {
  setMessage(
    "您的 Email 尚未完成驗證，請先至信箱點擊驗證連結。"
  );
  return;
}
      // 2. 取得會員身分驗證 Token
      const token =
        await credential.user.getIdToken();

      // 3. 查詢電子同意書簽署狀態
      setMessage("登入成功，正在確認電子同意書……");

      const response = await fetch(
        "/api/member/consent",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error("CONSENT_CHECK_FAILED");
      }

      const result = await response.json();

      // 4. 尚未簽署 → 電子同意書
      if (result.required && !result.signed) {
        setMessage(
          "請先完成學員安全須知暨課程同意書。"
        );

        router.replace("/consent");
        return;
      }

      // 5. 已簽署或管理員 → 原本頁面
      const redirectPath = getSafeRedirectPath();

      setMessage(
        redirectPath === "/booking"
          ? "登入成功，正在返回課程預約……"
          : "登入成功，正在前往會員中心……"
      );

      router.replace(redirectPath);
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
        error instanceof Error &&
        error.message === "CONSENT_CHECK_FAILED"
      ) {
        setMessage(
          "登入成功，但無法確認電子同意書狀態，請稍後再試。"
        );
      } else if (
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
        setMessage(
          `登入失敗：${errorCode || "未知錯誤"}`
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const registerHref =
    typeof window !== "undefined"
      ? (() => {
          const redirect = new URLSearchParams(
            window.location.search
          ).get("redirect");

          return redirect
            ? `/register?redirect=${encodeURIComponent(
                redirect
              )}`
            : "/register";
        })()
      : "/register";

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
              onChange={(event) =>
                setEmail(event.target.value)
              }
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
              onChange={(event) =>
                setPassword(event.target.value)
              }
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

          {/* 舊會員首次登入 */}
          <div className="mt-7 rounded-2xl bg-sky-50 px-5 py-5 text-center">
            <p className="text-sm font-semibold text-slate-700">
              舊系統會員第一次使用新系統？
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              請前往註冊並選擇「我是舊會員」，
              即可連結原有會員資料與剩餘點數。
            </p>

            <Link
              href={registerHref}
              className="mt-3 inline-block font-semibold text-sky-700 transition hover:text-sky-800"
            >
              前往會員註冊
            </Link>
          </div>

          {/* 新會員註冊 */}
          <p className="mt-7 text-center text-sm text-slate-600">
            還沒有會員帳號？
            <Link
              href={registerHref}
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