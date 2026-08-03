"use client";

import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [experience, setExperience] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await setDoc(doc(db, "users", credential.user.uid), {
        name,
        phone,
        experience,
        email,
        points: 0,
        role: "student",
        createdAt: serverTimestamp(),
      });

      setMessage("註冊成功！會員資料已建立。");
    } catch (error: unknown) {
      console.error(error);

      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(error.code)
          : "";

      if (errorCode === "auth/email-already-in-use") {
        setMessage("這個 Email 已經註冊過，請改用登入功能。");
      } else if (errorCode === "auth/weak-password") {
        setMessage("密碼強度不足，請至少輸入 6 碼。");
      } else if (errorCode === "auth/invalid-email") {
        setMessage("Email 格式不正確。");
      } else if (
        errorCode === "permission-denied" ||
        errorCode === "firestore/permission-denied"
      ) {
        setMessage("帳號已建立，但會員資料沒有寫入成功，請聯繫老師。");
      } else {
        setMessage(`註冊失敗：${errorCode || "未知錯誤"}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="bg-sky-50 px-6 py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Membership
          </p>

          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            建立會員帳號
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            註冊一次後，未來預約不需重複填寫個人資料。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-10"
        >
          <div className="space-y-6">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block font-semibold text-slate-800"
              >
                姓名
              </label>

              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="mb-2 block font-semibold text-slate-800"
              >
                電話
              </label>

              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="0912-345-678"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div>
              <label
                htmlFor="experience"
                className="mb-2 block font-semibold text-slate-800"
              >
                空中運動經驗
              </label>

              <select
                id="experience"
                required
                value={experience}
                onChange={(event) => setExperience(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">請選擇</option>
                <option value="第一次體驗">第一次體驗</option>
                <option value="未滿三個月">未滿三個月</option>
                <option value="三個月至一年">三個月至一年</option>
                <option value="一年以上">一年以上</option>
              </select>
            </div>

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
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block font-semibold text-slate-800"
              >
                密碼
              </label>

              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 碼"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-8 w-full rounded-xl bg-sky-600 px-6 py-3.5 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "建立帳號中…" : "建立會員帳號"}
          </button>

          {message && (
            <p className="mt-5 text-center text-sm leading-6 text-slate-600">
              {message}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}