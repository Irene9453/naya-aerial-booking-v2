"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { withConnectionTimeout } from "@/lib/clientConnection";

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
  const [showVerificationHelp, setShowVerificationHelp] = useState(false);
  const [correctedEmail, setCorrectedEmail] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setShowVerificationHelp(false);
    setIsSubmitting(true);

    try {
      // 1. Firebase 登入
      const credential =
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
await withConnectionTimeout(credential.user.reload());

if (!credential.user.emailVerified) {
  setShowVerificationHelp(true);
  setMessage(
    "您的 Email 尚未完成驗證。若未收到驗證信，可點選下方按鈕重新寄送。"
  );
  return;
}
      // 2. 由後端同步已驗證的 Auth Email；不授權前端直接更改會員資料。
      const syncToken = await credential.user.getIdToken(true);
      // Email 同步非登入必要條件：失敗或逾時不阻斷既有登入。
      try {
        const syncResponse = await fetch("/api/member/sync-email", {
          method: "POST",
          headers: { Authorization: `Bearer ${syncToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!syncResponse.ok) {
          console.warn("[Naya Email Sync] Could not synchronize profile email.");
        }
      } catch (syncError) {
        console.warn("[Naya Email Sync] Synchronization request failed.", syncError);
      }

      // 3. 取得會員身分驗證 Token
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
          signal: AbortSignal.timeout(15000),
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
      } else if (errorCode === "auth/network-request-failed" || errorCode === "unavailable" || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) {
        setMessage("連線暫時無法完成，請確認網路後再試一次。");
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

  async function handleCorrectEmail() {
    const user = auth.currentUser;
    const requestedEmail = correctedEmail.trim().toLowerCase();
    if (!user || !user.email || !showVerificationHelp) {
      setMessage("請先使用原帳號與密碼登入，再修改 Email。");
      return;
    }
    if (!requestedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
      setMessage("請輸入有效的新 Email。");
      return;
    }
    if (requestedEmail === user.email.toLowerCase()) {
      setMessage("新 Email 與原本相同，請直接重新寄送驗證信。");
      return;
    }
    if (!password) {
      setMessage("請先輸入原帳號密碼，才能修改 Email。");
      return;
    }
    setCorrectionBusy(true);
    setMessage("");
    try {
      await reload(user);
      if (user.emailVerified) {
        setShowVerificationHelp(false);
        setMessage("此帳號已完成 Email 驗證，請重新登入；其他 Email 修改請聯絡老師。");
        return;
      }
      const credential = EmailAuthProvider.credential(user.email!, password);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, requestedEmail);
      setMessage("已寄出 Email 更正驗證信。請到新信箱點擊連結，完成後使用新 Email 與原密碼登入。原會員資料與點數都會保留。");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code) : "";
      if (code === "auth/email-already-in-use") {
        setMessage("這個 Email 已被其他帳號使用，請更換信箱或聯絡老師。");
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setMessage("原帳號密碼不正確，請重新輸入後再試。");
      } else if (code === "auth/too-many-requests") {
        setMessage("操作過於頻繁，請稍後再試。");
      } else if (code === "auth/requires-recent-login") {
        setMessage("需要重新登入驗證身分，請重新輸入原帳密。");
      } else {
        console.error("[Naya Email Correction]", error);
        setMessage("修改 Email 的驗證信寄送失敗，請稍後再試或聯絡老師。");
      }
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function handleResendVerification() {
    const user = auth.currentUser;

    if (!user) {
      setMessage("登入狀態已失效，請重新輸入帳號密碼。");
      return;
    }

    if (resendBusy || resendCooldown) return;

    setResendBusy(true);

    try {
      await reload(user);

      if (user.emailVerified) {
        setShowVerificationHelp(false);
        setMessage("Email 已完成驗證，請再次點選登入。");
        return;
      }

      await sendEmailVerification(user);
      setMessage("驗證信已寄出，請查看收件匣及垃圾郵件匣。");
      setResendCooldown(true);
      setTimeout(() => setResendCooldown(false), 60000);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "";

      if (code === "auth/too-many-requests") {
        setMessage("寄送次數過多，請稍後再試。");
      } else if (code === "auth/requires-recent-login") {
        setMessage("登入狀態已過期，請重新登入後再試。");
      } else {
        setMessage("驗證信寄送失敗，請稍後再試或聯絡老師。");
      }
    } finally {
      setResendBusy(false);
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

          <div className="mt-4 text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-sky-700 hover:text-sky-800"
            >
              忘記密碼？
            </Link>
          </div>

          {message && (
            <p className="mt-5 text-center text-sm leading-6 text-slate-600">
              {message}
            </p>
          )}

          {showVerificationHelp && (
            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-center">
              <p className="font-semibold text-slate-800">
                尚未收到 Email 驗證信？
              </p>
              <button
                type="button"
                disabled={resendBusy || resendCooldown}
                onClick={handleResendVerification}
                className="mt-4 w-full rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {resendBusy
                  ? "寄送中……"
                  : resendCooldown
                    ? "已寄送，請稍後再試"
                    : "重新寄送驗證信"}
              </button>
              <label htmlFor="corrected-email" className="mt-5 block text-left text-sm font-semibold text-slate-700">
                註冊時 Email 輸入錯誤？
              </label>
              <input
                id="corrected-email"
                type="email"
                autoComplete="email"
                value={correctedEmail}
                onChange={(event) => setCorrectedEmail(event.target.value)}
                placeholder="請輸入正確的新 Email"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900"
              />
              <button
                type="button"
                disabled={correctionBusy || isSubmitting || resendBusy}
                onClick={handleCorrectEmail}
                className="mt-3 w-full rounded-xl border border-sky-300 px-5 py-3 font-semibold text-sky-700 disabled:opacity-50"
              >
                {correctionBusy ? "確認身分並寄送中……" : "驗證新 Email 並修改"}
              </button>
              <p className="mt-3 text-sm text-slate-600">
                修改後請至新信箱點擊驗證連結，再用新 Email 與原密碼登入；請勿重複註冊。
              </p>
            </div>
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