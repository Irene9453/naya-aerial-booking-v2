"use client";

import { useMemo, useState } from "react";
import { auth } from "@/lib/firebase";

type Student = { id: string; name: string; nickname?: string; email: string; role: string };
type Offer = "trial_yoga" | "trial_aerial";
const OFFERS: { id: Offer; label: string }[] = [
  { id: "trial_yoga", label: "空瑜體驗券" },
  { id: "trial_aerial", label: "舞綢／空環體驗券" },
];
function operationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `trial_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function AdminTrialVoucherManager({ students }: { students: Student[] }) {
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState<"grant" | "exchange">("exchange");
  const [offerId, setOfferId] = useState<Offer>("trial_yoga");
  const [previousOfferId, setPreviousOfferId] = useState<Offer>("trial_aerial");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [completed, setCompleted] = useState(false);
  const [nonce, setNonce] = useState(operationId);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s) => s.role === "student" &&
      (!term || [s.name, s.nickname, s.email, s.id].some((value) => value?.toLowerCase().includes(term)))
    ).slice(0, 35);
  }, [students, search]);

  function changeForm() {
    setCompleted(false);
    setFeedback("");
    setNonce(operationId());
  }

  async function submit() {
    if (busy || completed) return;
    if (!userId || reason.trim().length < 2 || (action === "exchange" && offerId === previousOfferId)) {
      setFeedback("請選擇學生、正確券種並填寫至少 2 字原因；換券須選擇不同券種。");
      return;
    }
    const user = auth.currentUser;
    if (!user) { setFeedback("登入已失效，請重新登入管理員帳號。"); return; }
    setBusy(true);
    setFeedback("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/trial-vouchers", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, action, offerId,
          ...(action === "exchange" ? { previousOfferId } : {}),
          reason: reason.trim(), operationId: nonce,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw Error(result.error || "操作失敗");
      setCompleted(true);
      setFeedback(result.alreadyDone ? "此操作先前已完成，沒有重複發券。" : "體驗券操作完成！學生會員中心將即時更新。");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "操作失敗，請稍後重試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <p className="text-sm leading-6 text-slate-600">
        可手動發放單張體驗券，或在學生買錯券時將「尚未使用、未預約」的原券換成正確券種。
        每種體驗券每位學生只允許一張，不覆寫已使用或已存在的體驗券。
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          尋找學生
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="輸入姓名、暱稱、Email 或 UID"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          發放對象
          <select value={userId} onChange={(e) => { setUserId(e.target.value); changeForm(); }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal">
            <option value="">請選擇學生</option>
            {userId && !matches.some((s) => s.id === userId) && (
              <option value={userId}>{students.find((s) => s.id === userId)?.name || userId}</option>
            )}
            {matches.map((s) => (
              <option key={s.id} value={s.id}>{s.name || s.nickname || "未命名"} · {s.email || s.id}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          操作類型
          <select value={action} onChange={(e) => { setAction(e.target.value as "grant" | "exchange"); changeForm(); }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal">
            <option value="exchange">換券（買錯券）</option>
            <option value="grant">直接發放體驗券</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          {action === "exchange" ? "要換成的正確體驗券" : "要發放的體驗券"}
          <select value={offerId} onChange={(e) => { setOfferId(e.target.value as Offer); changeForm(); }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal">
            {OFFERS.map((offer) => <option key={offer.id} value={offer.id}>{offer.label}</option>)}
          </select>
        </label>
        {action === "exchange" && (
          <label className="block text-sm font-semibold text-slate-700">
            學生原本買錯的體驗券
            <select value={previousOfferId} onChange={(e) => { setPreviousOfferId(e.target.value as Offer); changeForm(); }}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal">
              {OFFERS.map((offer) => <option key={offer.id} value={offer.id}>{offer.label}</option>)}
            </select>
          </label>
        )}
        <label className={`block text-sm font-semibold text-slate-700 ${action === "grant" ? "md:col-span-2" : ""}`}>
          操作原因（必填，留下稽核紀錄）
          <textarea rows={2} maxLength={200} value={reason} onChange={(e) => { setReason(e.target.value); changeForm(); }}
            placeholder="例如：學生誤購舞綢體驗券，經老師核對後改為空瑜體驗券"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal" />
        </label>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        {action === "exchange"
          ? "確認後會作廢原本可用的體驗券，並發放正確券種。已使用、預約中或重複券不會被覆寫；操作不可直接復原。"
          : "確認後會新增一張體驗券。若學生曾持有該券種（包括已使用），系統會拒絕重複發放。"}
      </div>
      <button type="button" disabled={busy || completed || !userId || reason.trim().length < 2 || (action === "exchange" && offerId === previousOfferId)}
        onClick={() => {
          const selected = students.find((s) => s.id === userId);
          const description = action === "exchange"
            ? `作廢「${OFFERS.find((o) => o.id === previousOfferId)?.label}」並發放「${OFFERS.find((o) => o.id === offerId)?.label}」`
            : `發放「${OFFERS.find((o) => o.id === offerId)?.label}」`;
          if (window.confirm(`確認對「${selected?.name || selected?.email || userId}」${description}？\\n操作原因：${reason.trim()}`)) void submit();
        }}
        className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300">
        {busy ? "處理中……" : completed ? "已完成操作" : action === "exchange" ? "確認換券" : "確認發放體驗券"}
      </button>
      {feedback && <p role="status" className={`text-sm font-semibold ${completed ? "text-emerald-700" : "text-amber-800"}`}>{feedback}</p>}
    </div>
  );
}
