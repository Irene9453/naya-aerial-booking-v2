"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import BirthdayCouponBenefit from "@/components/BirthdayCouponBenefit";
import { couponValidityLabel, couponDeadline } from "@/lib/couponValidity";
export default function MyCoupons({ userId }: { userId: string }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    setItems([]); setError("");
    if (!userId) return;
    return onSnapshot(query(collection(db, "userCoupons"), where("userId", "==", userId)), snapshot => {
      setItems(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))); setError("");
    }, () => setError("優惠券讀取失敗，請稍後再試。"));
  }, [userId]);
  return <details className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900"><summary className="cursor-pointer font-bold">我的優惠券（{items.length} 張）</summary>
    {error && <p className="mt-3 text-red-700">{error}</p>}
    <div className="mt-4 space-y-3"><BirthdayCouponBenefit userId={userId} />{items.map(item => {
      const deadline = couponDeadline(item); const expired = deadline !== undefined && deadline !== null && deadline <= Date.now();
      const status = item.status === "used" ? "已使用" : item.status === "reserved" ? "購買申請保留中" : expired || item.status === "expired" ? "已到期" : deadline === undefined ? "期限待核對" : item.status === "available" ? "可使用" : String(item.status);
      return <article key={String(item.id)} className="rounded-xl border p-4"><p className="font-semibold">{String(item.name ?? "優惠券")} · {status}</p><p className="mt-1 text-sm text-slate-700">{couponValidityLabel(item)}</p></article>;
    })}{!items.length && !error && <p className="text-sm text-slate-600">其他已領取優惠券：無。生日優惠請查看上方（若本月符合資格才會顯示）。</p>}</div>
  </details>;
}
