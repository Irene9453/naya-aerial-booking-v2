"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import type { LegacyCouponReport } from "@/lib/legacyCouponReconciliation";

const labels: Record<LegacyCouponReport["status"], string> = {
  no_coupons: "匯入未記錄券", unclaimed: "待認領", complete: "移轉完整", missing: "缺少移轉券", needs_review: "需人工核對",
};

export default function AdminLegacyCouponAudit() {
  const [rows, setRows] = useState<LegacyCouponReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function post(body: Record<string, unknown>) {
    const user = auth.currentUser;
    if (!user) throw Error("請先登入管理員。");
    const token = await user.getIdToken();
    const response = await fetch("/api/admin/legacy-members/coupons", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? "優惠券核對失敗。");
    return result;
  }
  async function audit(append = false) {
    setBusy(true); setMessage("");
    try {
      const result = await post({ action: "audit", ...(append && cursor ? { cursor } : {}) });
      setRows(current => append ? [...current, ...result.results] : result.results);
      setCursor(result.nextCursor); setLoaded(true);
      setMessage(result.nextCursor ? "本批核對完成，尚有下一批。這次核對沒有補發任何優惠券。" : "核對已完成，這次核對沒有補發任何優惠券。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "核對失敗。"); }
    finally { setBusy(false); }
  }
  async function repair(row: LegacyCouponReport) {
    if (!confirm(`確定為「${row.name}」補齊 ${row.missing} 張舊會員優惠券？只補缺少項目，不更動點數或已使用的券。`)) return;
    setBusy(true); setMessage("");
    try {
      const result = await post({ action: "repair", legacyMemberId: row.legacyMemberId });
      const updated = await post({ action: "audit", legacyMemberId: row.legacyMemberId });
      setRows(current => current.map(item => item.legacyMemberId === row.legacyMemberId ? updated.results[0] : item));
      setMessage(result.result.created > 0 ? `已為 ${row.name} 補齊 ${result.result.created} 張券，並留下補發紀錄。` : `未新增優惠券：${result.result.detail}`);
    } catch (error) { setMessage(`${error instanceof Error ? error.message : "補發中斷。"} 請重新核對；已補齊的券不會重複發放。`); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 rounded-3xl bg-white p-5 text-slate-900 shadow-sm md:p-8">
    <h2 className="text-2xl font-bold">舊會員優惠券核對</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">匯入的優惠券會先保留在舊會員資料，完成認領後才出現在會員帳戶。這裡可檢查已認領會員是否漏轉優惠券；核對本身不發券。</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => void audit()} className="rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white disabled:bg-slate-300">{busy ? "處理中……" : loaded ? "重新核對" : "開始核對（每批 20 筆）"}</button>
      {cursor && <button type="button" disabled={busy} onClick={() => void audit(true)} className="rounded-xl border border-sky-700 px-4 py-3 font-semibold text-sky-800">核對下一批</button>}
    </div>
    {message && <p role="status" className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-800">{message}</p>}
    {loaded && <p className="mt-4 text-sm text-slate-700">已核對 {rows.length} 筆；缺券 {rows.filter(row => row.status === "missing").length} 位、待認領 {rows.filter(row => row.status === "unclaimed").length} 位、需人工核對 {rows.filter(row => row.status === "needs_review").length} 位。</p>}
    <div className="mt-4 space-y-3">
      {rows.map(row => <article key={row.legacyMemberId} className="rounded-xl border border-slate-300 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{row.name}</h3><span className={row.status === "missing" || row.status === "needs_review" ? "font-semibold text-amber-800" : "font-semibold text-slate-700"}>{labels[row.status]}</span></div>
        <p className="mt-2 text-sm">匯入 {row.expected} 張／已移轉 {row.existing} 張／其中可用 {row.available} 張</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{row.detail}</p>
        {row.status === "missing" && <button type="button" disabled={busy} onClick={() => void repair(row)} className="mt-3 rounded-xl border border-sky-700 px-4 py-2 font-semibold text-sky-800">補齊缺少的 {row.missing} 張券</button>}
      </article>)}
      {loaded && rows.length === 0 && <p className="text-slate-700">沒有舊會員資料。</p>}
    </div>
  </section>;
}
