"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { NEW_STUDENT_OFFERS, type NewStudentOfferId } from "@/lib/newStudentOffers";

type Eligibility = { status: string; reason: string; purchasingEnabled?: boolean };
const REASONS: Record<string, string> = {
  email_unverified: "請先完成 Email 驗證，再重新確認資格。",
  history_incomplete: "舊會員資料尚未完成核對，優惠資格待確認；其他會員功能不受影響。",
  phone_registry_mismatch: "手機綁定資料需要確認，請聯絡老師。",
  legacy_claim_review: "舊會員認領紀錄需要確認，請聯絡老師確認優惠資格。",
  legacy_member: "此帳號有舊會員資料或認領紀錄，不適用新生優惠。",
  regular_purchase: "已有一般課卡購買紀錄，不適用新生優惠。",
  eligibility_consumed: "此帳號的新生優惠資格已結束。",
  not_student: "此優惠僅供符合資格的學生會員使用。",
};

export default function NewStudentOffers() {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<NewStudentOfferId | null>(null);
  const paymentMethod = "transfer";
  const [lastFive, setLastFive] = useState("");

  const checkEligibility = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) { setEligibility(null); return; }
    setChecking(true);
    setEligibility(null);
    setMessage("");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/new-student-offers/eligibility", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (auth.currentUser?.uid !== user.uid) return;
      if (result.status) setEligibility(result);
      if (!response.ok && !result.status) throw new Error(result.error || "無法確認資格");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法確認資格，請稍後重試。");
    } finally { setChecking(false); }
  }, []);

  useEffect(() => onAuthStateChanged(auth, () => {
    setEligibility(null);
    void checkEligibility();
  }), [checkEligibility]);

  async function purchase(offerId: NewStudentOfferId) {
    const user = auth.currentUser;
    if (!user || eligibility?.status !== "eligible" || !eligibility.purchasingEnabled || busy) return;
    if (paymentMethod === "transfer" && !/^\d{5}$/.test(lastFive)) {
      setMessage("請填寫轉出帳號末五碼。"); return;
    }
    setBusy(offerId);
    setMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/new-student-offers/purchase", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, paymentMethod, transferLastFive: lastFive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "送出失敗");
      setMessage(`${NEW_STUDENT_OFFERS[offerId].name}：申請已送出，請完成付款並等待老師確認收款。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "送出失敗，請稍後再試。");
    } finally { setBusy(null); }
  }

  const enabled = eligibility?.status === "eligible" && eligibility.purchasingEnabled;
  // Wait for the server decision so existing members never see the offer flash.
  if (!eligibility || eligibility.status === "ineligible") return null;

  return (
    <section className="mt-10 rounded-3xl border border-amber-200 bg-amber-50/50 p-6 md:p-8">
      <h2 className="text-2xl font-bold text-slate-900">新生限定優惠</h2>
      <p className="mt-2 text-sm text-slate-600">每位符合資格的新生每項限購一次，不可合併其他優惠。請於上課前完成付款，老師確認收款後才會發放點數或體驗券。</p>
      <p className="mt-3 text-sm" role="status">
        {checking ? "正在確認新生優惠資格……" : eligibility?.status === "eligible"
          ? eligibility.purchasingEnabled ? "符合新生優惠資格。" : "符合新生優惠資格，購買功能尚未開放。"
          : REASONS[eligibility?.reason ?? ""] ?? "請登入後確認新生優惠資格。"}
      </p>
      <button type="button" disabled={checking || busy !== null} onClick={() => void checkEligibility()}
        className="mt-3 rounded-xl border border-amber-300 px-4 py-2 disabled:opacity-50">重新確認資格</button>
      {enabled && (
        <div className="mt-4 flex flex-wrap gap-4">
          <div className="w-full rounded-xl border border-amber-200 bg-white p-4 text-sm">
            <p className="font-semibold">付款方式：銀行轉帳</p>
            <p className="mt-2">銀行：803 聯邦銀行</p>
            <p className="mt-1">收款帳號：<span className="select-all font-mono">888501184231</span></p>
            <p className="mt-2 text-slate-600">請依所選優惠金額完成轉帳，再填寫轉出帳號末五碼並申請購買。老師確認收款後才會發放點數或體驗券。</p>
          </div>
          {paymentMethod === "transfer" && <label>轉出帳號末五碼
            <input value={lastFive} onChange={e => setLastFive(e.target.value.replace(/\D/g, "").slice(0, 5))}
              disabled={busy !== null} inputMode="numeric" maxLength={5} className="ml-2 w-24 rounded border p-2" />
          </label>}
        </div>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {(Object.keys(NEW_STUDENT_OFFERS) as NewStudentOfferId[]).map(id => {
          const offer = NEW_STUDENT_OFFERS[id];
          return <article key={id} className="rounded-2xl border bg-white p-5">
            <h3 className="font-bold">{offer.name}</h3>
            <p className="mt-3 text-sm text-slate-400 line-through">原價 NT$ {offer.regularPrice.toLocaleString()}</p>
            <p className="text-2xl font-bold text-sky-700">NT$ {offer.price.toLocaleString()}</p>
            <p className="mt-3 text-sm">{offer.points ? `${offer.points} 點` : "單堂體驗券 1 張"}</p>
            <button type="button" disabled={!enabled || checking || busy !== null} onClick={() => void purchase(id)}
              className="mt-5 w-full rounded-xl bg-sky-700 px-4 py-3 text-white disabled:bg-slate-200 disabled:text-slate-500">
              {busy === id ? "送出中……" : "申請購買"}
            </button>
          </article>;
        })}
      </div>
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    </section>
  );
}
