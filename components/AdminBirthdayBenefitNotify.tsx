"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";

type CampaignResult = {
  success?: boolean;
  year?: number;
  month?: number;
  birthdayMembers?: number;
  notified?: number;
  alreadyNotified?: number;
  notEligible?: number;
  failed?: number;
  error?: string;
};

export default function AdminBirthdayBenefitNotify() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [error, setError] = useState("");

  async function handleNotify() {
    if (busy) return;
    const approved = window.confirm(
      "確定要通知本月尚未使用生日 7 折優惠的學生嗎？系統將在會員中心新增通知，同一年不會重複通知。"
    );
    if (!approved) return;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("請先登入管理員帳號。");
      const response = await fetch("/api/admin/birthday-benefit/notify", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = await response.json() as CampaignResult;
      if (!response.ok && response.status !== 207) throw new Error(data.error || "通知失敗。");
      setResult(data);
      if (data.failed) setError(data.error || "部分通知失敗，請重試。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "通知失敗，請稍後重試。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4 p-5">
    <p className="text-sm leading-6 text-slate-700">
      生日當月尚未使用本年度優惠的學生，會在「會員中心 → 最新通知」收到生日 7 折優惠提醒，
      並可到「我的紅利與優惠券」查看及使用。
      通知只寫入站內通知，不會發送 Email、LINE 或手機推播。
    </p>
    <p className="text-sm leading-6 text-amber-800">
      一年每位學生只通知一次；再次執行只補送尚未通知的本月壽星，並不額外發放優惠券或變更點數。
    </p>
    <button type="button" disabled={busy} onClick={() => void handleNotify()}
      className="rounded-xl bg-rose-700 px-5 py-3 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-60">
      {busy ? "正在核對資格與發送通知……" : "🎂 通知本月符合資格壽星"}
    </button>
    {result && <div role="status" className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm leading-7 text-slate-800">
      <p className="font-bold">{result.year} 年 {result.month} 月生日優惠通知結果</p>
      <p>本月生日會員：{result.birthdayMembers ?? 0} 位</p>
      <p>本次新增通知：{result.notified ?? 0} 位</p>
      <p>已通知過：{result.alreadyNotified ?? 0} 位</p>
      <p>本月已無資格：{result.notEligible ?? 0} 位</p>
      <p>失敗：{result.failed ?? 0} 位</p>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
