"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type MemberData = {
  name: string;
  email: string;
  phone: string;
  experience: string;
  points: number;
  role: "student" | "admin";
};

export default function MemberPage() {
  const router = useRouter();

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [member, setMember] = useState<MemberData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      setFirebaseUser(user);

      try {
        const memberReference = doc(db, "users", user.uid);
        const memberSnapshot = await getDoc(memberReference);

        if (!memberSnapshot.exists()) {
          setMessage("找不到會員資料，請聯繫老師協助處理。");
          setIsLoading(false);
          return;
        }

        const data = memberSnapshot.data();

        setMember({
          name: String(data.name ?? ""),
          email: String(data.email ?? user.email ?? ""),
          phone: String(data.phone ?? ""),
          experience: String(data.experience ?? ""),
          points: Number(data.points ?? 0),
          role: data.role === "admin" ? "admin" : "student",
        });
      } catch (error) {
        console.error(error);
        setMessage("讀取會員資料失敗，請重新整理或稍後再試。");
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, [router]);

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error(error);
      setMessage("登出失敗，請稍後再試。");
    }
  }

  if (isLoading) {
    return (
      <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-20">
        <p className="text-center text-slate-600">
          會員資料載入中……
        </p>
      </section>
    );
  }

  if (!member) {
    return (
      <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-20">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            無法顯示會員資料
          </h1>

          <p className="mt-4 text-slate-600">
            {message || "目前找不到會員資料。"}
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-7 rounded-xl border border-sky-600 px-6 py-3 font-semibold text-sky-700"
          >
            登出
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[calc(100vh-8rem)] bg-sky-50 px-6 py-12 md:py-20">
      <div className="mx-auto max-w-5xl">
        {/* 歡迎區 */}
        <div className="rounded-3xl bg-gradient-to-br from-sky-600 to-blue-500 p-8 text-white shadow-lg md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-100">
            Member Center
          </p>

          <h1 className="mt-3 text-3xl font-bold md:text-4xl">
            嗨，{member.name}
          </h1>

          <p className="mt-3 text-sky-100">
            歡迎回到 Naya Aerial
          </p>
        </div>

        {/* 會員資訊卡片 */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <article className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">
              目前點數
            </p>

            <p className="mt-3 text-5xl font-bold text-sky-600">
              {member.points}
            </p>

            <p className="mt-2 text-sm text-slate-500">
              可用於預約課程
            </p>
          </article>

          <article className="rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:col-span-2">
            <h2 className="text-xl font-bold text-slate-900">
              會員資料
            </h2>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">姓名</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {member.name}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="mt-1 break-all font-semibold text-slate-800">
                  {member.email}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">電話</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {member.phone}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">空中運動經驗</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {member.experience}
                </dd>
              </div>
            </dl>
          </article>
        </div>

        {/* 我的預約 */}
        <article className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
                My Bookings
              </p>

              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                我的預約
              </h2>
            </div>

            <Link
              href="/booking"
              className="rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700"
            >
              預約課程
            </Link>
          </div>

          <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
            <p className="text-slate-600">
              目前尚未載入預約紀錄。
            </p>

            <p className="mt-2 text-sm text-slate-500">
              下一步會將課程與預約資料連接到 Firestore。
            </p>
          </div>
        </article>

        {/* 老師入口 */}
        {member.role === "admin" && (
          <article className="mt-8 rounded-3xl border border-orange-100 bg-orange-50 p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">
              Admin
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              老師管理後台
            </h2>

            <p className="mt-3 text-slate-600">
              你的帳號具有管理員權限。
            </p>

            <Link
              href="/admin"
              className="mt-5 inline-block rounded-xl bg-orange-600 px-6 py-3 font-semibold text-white"
            >
              進入管理後台
            </Link>
          </article>
        )}

        {message && (
          <p className="mt-6 text-center text-sm text-red-600">
            {message}
          </p>
        )}

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-300 bg-white px-7 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            登出
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          登入帳號：{firebaseUser?.email}
        </p>
      </div>
    </section>
  );
}