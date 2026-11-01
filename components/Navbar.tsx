"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);

  const [role, setRole] = useState<
    "student" | "admin" | null
  >(null);

  const [roleError, setRoleError] = useState(false);

  const [isMenuOpen, setIsMenuOpen] =
    useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let generation = 0;
    let disposed = false;
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      const current = ++generation;
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      setUser(firebaseUser);
      setRole(null);
      setRoleError(false);
      if (!firebaseUser) return;
      unsubscribeProfile = onSnapshot(doc(db, "users", firebaseUser.uid), snapshot => {
        if (disposed || current !== generation) return;
        if (!snapshot.exists()) { setRole(null); setRoleError(true); return; }
        setRole(snapshot.data().role === "admin" ? "admin" : "student");
        setRoleError(false);
      }, error => {
        if (disposed || current !== generation) return;
        console.error("讀取會員身分失敗：", error);
        setRole(null);
        setRoleError(true);
      });
    }, error => {
      if (disposed) return;
      console.error("讀取登入狀態失敗：", error);
      setUser(null); setRole(null); setRoleError(true);
    });
    return () => { disposed = true; generation++; unsubscribe(); unsubscribeProfile?.(); };
  }, []);

  const memberHref = !user ? "/login" : role === "admin" ? "/admin" : "/member";
  const memberLabel = !user ? "登入" : role === "admin" ? "管理後台" : "會員中心";

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          onClick={closeMenu}
          className="shrink-0"
        >
          <Image
            src="/images/logo-3.png"
            alt="Naya Aerial"
            width={280}
            height={90}
            priority
            className="h-16 w-auto sm:h-20"
          />
        </Link>

        {/* 桌機版導覽 */}
        <nav className="hidden items-center gap-6 text-base md:flex">
          <Link
            href="/"
            className="transition hover:text-sky-600"
          >
            首頁
          </Link>

          <Link
            href="/courses"
            className="transition hover:text-sky-600"
          >
            課程
          </Link>

          <Link
            href="/booking"
            className="transition hover:text-sky-600"
          >
            預約
          </Link>

          <Link href={memberHref} className="rounded-full bg-sky-600 px-4 py-2 font-semibold text-white transition hover:bg-sky-700">
            {memberLabel}
          </Link>
          {user && (roleError || role === null) && <Link href="/login" className="text-sm font-semibold text-sky-800 underline">登入頁</Link>}
        </nav>

        {/* 手機版漢堡按鈕 */}
        <button
          type="button"
          onClick={() =>
            setIsMenuOpen(
              (current) => !current
            )
          }
          aria-label="切換導覽選單"
          aria-expanded={isMenuOpen}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 md:hidden"
        >
          {isMenuOpen ? (
            <span className="text-2xl leading-none">
              ×
            </span>
          ) : (
            <span className="text-2xl leading-none">
              ☰
            </span>
          )}
        </button>
      </div>

      {/* 手機版選單 */}
      {isMenuOpen && (
        <div className="border-t border-slate-100 bg-white px-4 pb-5 pt-3 md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-2">
            <Link
              href="/"
              onClick={closeMenu}
              className="rounded-xl px-4 py-3 font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
            >
              首頁
            </Link>

            <Link
              href="/courses"
              onClick={closeMenu}
              className="rounded-xl px-4 py-3 font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
            >
              課程
            </Link>

            <Link
              href="/booking"
              onClick={closeMenu}
              className="rounded-xl px-4 py-3 font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
            >
              預約
            </Link>

            <Link href={memberHref} onClick={closeMenu} className="mt-2 rounded-xl bg-sky-600 px-4 py-3 text-center font-semibold text-white">
              {memberLabel}
            </Link>
            {user && (roleError || role === null) && <Link href="/login" onClick={closeMenu} className="rounded-xl px-4 py-3 font-semibold text-sky-800 underline">登入頁</Link>}
          </nav>
        </div>
      )}
    </header>
  );
}