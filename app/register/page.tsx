"use client";

import { FormEvent, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  reload,
  sendEmailVerification,
} from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

type MemberType = "new" | "legacy";
type RegistrationStage = "select" | "legacy-info" | "form" | "verify-email";

function normalizeTaiwanPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function isValidTaiwanMobile(phone: string) {
  return /^09\d{8}$/.test(phone);
}

function parseBirthday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day ||
    date.getTime() > Date.now()
  ) return null;
  return { birthdayYear: year, birthdayMonth: month, birthdayDay: day };
}

export default function RegisterPage() {
  const router = useRouter();
  const [memberType, setMemberType] = useState<MemberType | null>(null);
  const [stage, setStage] = useState<RegistrationStage>("select");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [experience, setExperience] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [claimSubmitted, setClaimSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  function getSafeRedirectPath() {
    if (typeof window === "undefined") return "/member";
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//") ||
        redirect.startsWith("/\\")) return "/member";
    return redirect;
  }

  function chooseType(type: MemberType) {
    setMemberType(type);
    setMessage("");
    setStage(type === "legacy" ? "legacy-info" : "form");
  }

  function handleLegacyInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidTaiwanMobile(normalizeTaiwanPhone(phone))) {
      setMessage("請輸入正確的台灣手機號碼，例如 0912345678。");
      return;
    }
    if (!parseBirthday(birthday)) {
      setMessage("請填寫正確的生日。");
      return;
    }
    setMessage("");
    // 手機＋生日只是資料比對線索，不能證明身分。
    // 不在未驗證身分前公開舊會員姓名及點數。
    setStage("form");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const normalizedPhone = normalizeTaiwanPhone(phone);
    const birth = parseBirthday(birthday);
    if (!memberType) return;
    if (!isValidTaiwanMobile(normalizedPhone)) {
      setMessage("請輸入正確的台灣手機號碼，例如 0912345678。");
      return;
    }
    if (!birth) {
      setMessage("請填寫正確的生日。");
      return;
    }
    if (!name.trim()) {
      setMessage("請填寫真實姓名。");
      return;
    }
    if (!experience) {
      setMessage("請選擇空中運動經驗。");
      return;
    }

    setIsSubmitting(true);
    let createdUser: typeof auth.currentUser = null;
    let profileCreated = false;

    try {
      const credential = await createUserWithEmailAndPassword(
        auth, email.trim(), password
      );
      createdUser = credential.user;
      const userRef = doc(db, "users", credential.user.uid);
      const phoneRegistryRef = doc(db, "phoneRegistry", normalizedPhone);

      await runTransaction(db, async (transaction) => {
        const phoneSnapshot = await transaction.get(phoneRegistryRef);
        if (phoneSnapshot.exists()) throw new Error("PHONE_ALREADY_REGISTERED");

        transaction.set(userRef, {
          name: name.trim(),
          nickname: nickname.trim(),
          phone: normalizedPhone,
          phoneNormalized: normalizedPhone,
          phoneVerified: false, // Email 驗證不等於手機驗證
          experience,
          email: email.trim().toLowerCase(),
          points: 0,
          rewardPoints: 0,
          isNewStudent: memberType === "new",
          birthdayMonth: birth.birthdayMonth,
          birthdayDay: birth.birthdayDay,
          role: "student",
          createdAt: serverTimestamp(),
        });
        transaction.set(phoneRegistryRef, {
          userId: credential.user.uid,
          phone: normalizedPhone,
          createdAt: serverTimestamp(),
        });
      });
      profileCreated = true;
      setStage("verify-email");

      // 先保留帳號，再個別處理驗證信與認領失敗。
      if (memberType === "legacy") {
        try {
          const token = await credential.user.getIdToken();
          const response = await fetch("/api/admin/legacy-members/claim", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              phone: normalizedPhone,
              birthdayYear: birth.birthdayYear,
              birthdayMonth: birth.birthdayMonth,
              birthdayDay: birth.birthdayDay,
            }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              typeof result.error === "string"
                ? result.error
                : `認領申請送出失敗（HTTP ${response.status}）`
            );
          }
          setClaimSubmitted(true);
        } catch (claimError) {
          console.error("舊會員認領申請失敗：", claimError);
          setMessage(
            "帳號已建立，但舊會員認領申請尚未成功。請先完成 Email 驗證，再聯絡老師協助處理；請勿重新註冊。"
          );
        }
      }

      try {
        await sendEmailVerification(credential.user);
        setEmailSent(true);
      } catch (mailError) {
        console.error("寄送驗證信失敗：", mailError);
        setMessage(
          "帳號已建立，但驗證信暫時無法寄出。請按下方「重新寄送驗證信」，不要重新註冊。"
        );
      }
    } catch (error: unknown) {
      console.error(error);
      // 只有會員資料尚未寫入時，才嘗試清理 Auth 帳號。
      if (createdUser && !profileCreated) {
        try { await deleteUser(createdUser); }
        catch (cleanupError) { console.error("清理未完成帳號失敗：", cleanupError); }
      }
      const err = error as { code?: string; message?: string };
      if (err?.message === "PHONE_ALREADY_REGISTERED") {
        setMessage("這支手機已註冊過會員，請直接登入；如有疑問請聯絡老師。");
      } else if (err?.code === "auth/email-already-in-use") {
        setMessage("這個 Email 已經註冊過，請改用登入功能。");
      } else if (err?.code === "auth/weak-password") {
        setMessage("密碼強度不足，請至少輸入 6 碼。");
      } else if (err?.code === "auth/invalid-email") {
        setMessage("Email 格式不正確。");
      } else if (err?.code === "permission-denied" ||
                 err?.code === "firestore/permission-denied") {
        setMessage("會員資料寫入失敗，請聯絡老師。");
      } else {
        setMessage(`註冊失敗：${err?.message || err?.code || "未知錯誤"}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendEmail() {
    setIsSubmitting(true);
    setMessage("");
    try {
      if (!auth.currentUser) throw new Error("登入狀態已失效，請重新登入。");
      await sendEmailVerification(auth.currentUser);
      setEmailSent(true);
      setMessage("驗證信已重新寄出，請查看收件匣及垃圾郵件。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新寄送失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function checkEmailVerified() {
    setIsSubmitting(true);
    setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("登入狀態已失效，請重新登入。");
      await reload(user);
      if (!user.emailVerified) {
        setMessage("Email 尚未完成驗證。請先點擊驗證信中的連結，再回來按此按鈕。");
        return;
      }
      await user.getIdToken(true);
      router.replace(getSafeRedirectPath());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "確認驗證狀態失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  const card = "rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-10";
  const input = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
  const label = "mb-2 block font-semibold text-slate-800";
  const button = "w-full rounded-xl bg-sky-600 px-6 py-3.5 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60";

  return (
    <section className="min-h-screen bg-sky-50 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <header className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">Membership</p>
          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            {stage === "select" ? "建立會員帳號"
              : stage === "legacy-info" ? "連結舊會員資料"
              : stage === "verify-email" ? "驗證電子郵件"
              : "建立會員帳號"}
          </h1>
          <p className="mt-4 leading-7 text-slate-600">
            {stage === "select" ? "請先選擇您的會員身分"
              : stage === "legacy-info" ? "請輸入舊系統登記的手機號碼與生日。"
              : stage === "verify-email" ? "請至信箱點擊驗證連結，完成帳號驗證。"
              : "註冊一次後，未來預約不需重複填寫個人資料。"}
          </p>
        </header>

        {stage === "select" && (
          <div className="space-y-4">
            <button type="button" onClick={() => chooseType("new")}
              className="w-full rounded-3xl border border-sky-100 bg-white p-7 text-left shadow-sm transition hover:border-sky-300">
              <p className="text-xl font-bold text-slate-900">我是新會員</p>
              <p className="mt-2 text-sm text-slate-500">第一次加入 Naya Aerial，建立新的會員帳號。</p>
            </button>
            <button type="button" onClick={() => chooseType("legacy")}
              className="w-full rounded-3xl border border-violet-100 bg-white p-7 text-left shadow-sm transition hover:border-violet-300">
              <p className="text-xl font-bold text-slate-900">我是舊會員</p>
              <p className="mt-2 text-sm text-slate-500">曾使用舊版預約系統，申請連結舊會員資料與點數。</p>
            </button>
          </div>
        )}

        {stage === "legacy-info" && (
          <form onSubmit={handleLegacyInfo} className={card}>
            <div>
              <label htmlFor="legacy-phone" className={label}>舊系統登記手機</label>
              <input id="legacy-phone" type="tel" inputMode="numeric" required
                value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="0912345678" className={input} />
            </div>
            <div className="mt-6">
              <label htmlFor="legacy-birthday" className={label}>生日</label>
              <input id="legacy-birthday" type="date" required
                value={birthday} onChange={e => setBirthday(e.target.value)}
                className={input} />
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-500">
              舊會員資料將在建立帳號後送交老師確認；核准前不會移轉點數。
            </p>
            {message && <p className="mt-5 text-sm text-red-600">{message}</p>}
            <button type="submit" className={`mt-7 ${button}`}>繼續建立帳號</button>
            <button type="button" onClick={() => { setStage("select"); setMessage(""); }}
              className="mt-4 w-full py-2 text-sm text-slate-500">← 返回選擇會員類型</button>
          </form>
        )}

        {stage === "form" && (
          <form onSubmit={handleSubmit} className={card}>
            <div className="space-y-6">
              <div>
                <label htmlFor="name" className={label}>姓名（本名）</label>
                <input id="name" type="text" required value={name}
                  onChange={e => setName(e.target.value)} className={input}
                  placeholder="請填寫真實姓名" />
                <p className="mt-2 text-xs text-slate-500">供老師核對會員身分使用。</p>
              </div>
              <div>
                <label htmlFor="nickname" className={label}>暱稱／綽號（選填）</label>
                <input id="nickname" type="text" maxLength={20} value={nickname}
                  onChange={e => setNickname(e.target.value)} className={input}
                  placeholder="例如：Naya、娜娜" />
              </div>
              {memberType === "new" && (
                <>
                  <div>
                    <label htmlFor="phone" className={label}>手機號碼</label>
                    <input id="phone" type="tel" inputMode="numeric" required
                      value={phone} onChange={e => setPhone(e.target.value)}
                      className={input} placeholder="0912345678" />
                    <p className="mt-2 text-xs text-slate-500">每支手機號碼只能註冊一個會員帳號。</p>
                  </div>
                  <div>
                    <label htmlFor="birthday" className={label}>生日</label>
                    <input id="birthday" type="date" required value={birthday}
                      onChange={e => setBirthday(e.target.value)} className={input} />
                    <p className="mt-2 text-xs text-slate-500">生日將用於生日優惠資格判定。</p>
                  </div>
                </>
              )}
              <div>
                <label htmlFor="experience" className={label}>空中運動經驗</label>
                <select id="experience" required value={experience}
                  onChange={e => setExperience(e.target.value)} className={input}>
                  <option value="">請選擇</option>
                  <option value="第一次體驗">第一次體驗</option>
                  <option value="未滿三個月">未滿三個月</option>
                  <option value="三個月至一年">三個月至一年</option>
                  <option value="一年以上">一年以上</option>
                </select>
              </div>
              <div>
                <label htmlFor="email" className={label}>Email</label>
                <input id="email" type="email" required value={email}
                  onChange={e => setEmail(e.target.value)} className={input} />
              </div>
              <div>
                <label htmlFor="password" className={label}>密碼</label>
                <input id="password" type="password" required minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
                  className={input} placeholder="至少 6 碼" />
              </div>
            </div>
            {memberType === "legacy" && (
              <p className="mt-6 rounded-xl bg-violet-50 p-4 text-sm leading-6 text-violet-800">
                舊會員將先建立新帳號，原有點數需經老師核對身分並核准後才會移轉。
              </p>
            )}
            <button type="submit" disabled={isSubmitting} className={`mt-8 ${button}`}>
              {isSubmitting ? "建立帳號中…" : "建立會員帳號"}
            </button>
            {message && <p className="mt-5 text-sm leading-6 text-red-600">{message}</p>}
            <button type="button" onClick={() => { setStage(memberType === "legacy" ? "legacy-info" : "select"); setMessage(""); }}
              className="mt-4 w-full py-2 text-sm text-slate-500">← 返回上一步</button>
          </form>
        )}

        {stage === "verify-email" && (
          <div className={card}>
            <p className="text-lg font-semibold text-slate-900">
              {emailSent ? "驗證信已寄出" : "帳號已建立"}
            </p>
            <p className="mt-3 break-words text-slate-600">{email.trim()}</p>
            <p className="mt-4 leading-7 text-slate-600">
              請開啟驗證信，點擊其中的連結，然後回到這裡確認。
              若沒有收到，請檢查垃圾郵件。
            </p>
            {memberType === "legacy" && (
              <p className="mt-4 rounded-xl bg-violet-50 p-4 text-sm leading-6 text-violet-800">
                {claimSubmitted
                  ? "舊會員認領申請已送出，老師核准後才會移轉課程點數及紅利點數。"
                  : "舊會員認領申請尚未成功，請完成 Email 驗證後聯絡老師協助。"}
              </p>
            )}
            {message && <p className="mt-4 text-sm leading-6 text-red-600">{message}</p>}
            <button type="button" disabled={isSubmitting} onClick={checkEmailVerified}
              className={`mt-7 ${button}`}>
              {isSubmitting ? "確認中…" : "我已完成 Email 驗證"}
            </button>
            <button type="button" disabled={isSubmitting} onClick={resendEmail}
              className="mt-4 w-full rounded-xl border border-sky-300 px-6 py-3 font-semibold text-sky-700 disabled:opacity-60">
              重新寄送驗證信
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
