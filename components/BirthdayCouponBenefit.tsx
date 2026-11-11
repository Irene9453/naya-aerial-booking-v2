"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Benefit = { year: number; month: number; available: boolean };
const taipeiPart = (part: "year" | "month") => Number(
  new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", [part]: "numeric" }).format(new Date())
);

/**
 * Birthday benefit is virtual until redemption.
 * This deliberately does NOT create a userCoupons record or change the checkout logic.
 * Ownership, current Taipei month, and annual use are checked again by the purchase API.
 */
export default function BirthdayCouponBenefit({ userId }: { userId: string }) {
  const [benefit, setBenefit] = useState<Benefit | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [usage, setUsage] = useState<"loading" | "available" | "used" | "error">("loading");
  const [profileError, setProfileError] = useState(false);
  useEffect(() => {
    if (!userId) return;
    const year = taipeiPart("year");
    const currentMonth = taipeiPart("month");
    setBenefit(null);
    setMonth(null);
    setUsage("loading");
    setProfileError(false);
    const stopProfile = onSnapshot(doc(db, "users", userId), snapshot => {
      if (!snapshot.exists()) { setProfileError(true); return; }
      const m = Number(snapshot.data().birthdayMonth);
      setMonth(Number.isInteger(m) && m >= 1 && m <= 12 ? m : null);
      setProfileError(false);
    }, () => setProfileError(true));
    const stopUsage = onSnapshot(doc(db, "birthdayCouponUsage", `${userId}_${year}`),
      snapshot => setUsage(!snapshot.exists() || snapshot.data()?.status === "released" ? "available" : "used"),
      () => setUsage("error"));
    setBenefit({ year, month: currentMonth, available: true });
    return () => { stopProfile(); stopUsage(); };
  }, [userId]);

  if (!benefit || !month || month !== benefit.month || usage !== "available" || profileError) return null;

  return <article className="rounded-2xl border-2 border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50 p-5 text-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-xs font-bold tracking-wide text-rose-700">🎂 本月專屬生日禮</p>
        <h3 className="mt-2 text-lg font-bold">生日 7 折優惠</h3>
      </div>
      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">本月可使用</span>
    </div>
    <p className="mt-3 text-3xl font-extrabold text-rose-700">7 折</p>
    <p className="mt-2 text-sm leading-6 text-slate-700">
      生日當月購買課卡享 7 折，每年限使用一次，優惠不與其他折扣合併。
      有效期限至 {benefit.year} 年 {benefit.month} 月最後一天（台灣時間）。
    </p>
    <Link href="/buy-packages" className="mt-4 inline-block rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800">
      使用生日優惠購買課卡 →
    </Link>
  </article>;
}
