"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);

  const [role, setRole] = useState<
    "student" | "admin" | null
  >(null);

  const [isLoading, setIsLoading] =
    useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        setUser(firebaseUser);

        if (!firebaseUser) {
          setRole(null);
          setIsLoading(false);
          return;
        }

        try {
          const userSnapshot = await getDoc(
            doc(
              db,
              "users",
              firebaseUser.uid
            )
          );

          if (userSnapshot.exists()) {
            const userData =
              userSnapshot.data();

            setRole(
              userData.role === "admin"
                ? "admin"
                : "student"
            );
          } else {
            setRole("student");
          }
        } catch (error) {
          console.error(
            "讀取會員身分失敗：",
            error
          );

          setRole("student");
        } finally {
          setIsLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-6 px-6">
        <Link
          href="/"
          className="shrink-0"
        >
          <Image
            src="/images/logo-3.png"
            alt="Naya Aerial"
            width={280}
            height={90}
            priority
            className="h-20 w-auto"
          />
        </Link>

        <nav className="flex items-center gap-4 text-sm sm:gap-6 sm:text-base">
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

          {/* Firebase 還在確認登入狀態 */}
          {isLoading ? (
            <span className="text-slate-400">
              會員
            </span>
          ) : user ? (
            /* 已登入 */
            role === "admin" ? (
              <Link
                href="/admin"
                className="rounded-full bg-sky-600 px-4 py-2 font-semibold text-white transition hover:bg-sky-700"
              >
                管理後台
              </Link>
            ) : (
              <Link
                href="/member"
                className="rounded-full bg-sky-600 px-4 py-2 font-semibold text-white transition hover:bg-sky-700"
              >
                會員中心
              </Link>
            )
          ) : (
            /* 未登入 */
            <Link
              href="/login"
              className="rounded-full bg-sky-600 px-4 py-2 font-semibold text-white transition hover:bg-sky-700"
            >
              登入
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}