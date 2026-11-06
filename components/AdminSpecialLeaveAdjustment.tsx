"use client";

import { useMemo, useState } from "react";
import { auth } from "@/lib/firebase";

type Student = {
  id: string; name: string; nickname?: string; email: string; role: string;
  specialLeaveOverrides?: Record<string, { status?: string }>;
};

function taipeiPeriod() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric" })
    .formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, half: month <= 6 ? 1 : 2 };
}

function nextOperationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `leave_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function AdminSpecialLeaveAdjustment({ students }: { students: Student[] }) {
  const current = taipeiPeriod();
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [year, setYear] = useState(current.year);
  const [half, setHalf] = useState(current.half);
  const [action, setAction] = useState<"restore" | "mark_used">("restore");
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState(nextOperationId);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");

  const student = students.find((item) => item.id === userId);
  const matched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((item) => item.role === "student" &&
      (!needle || [item.name, item.nickname, item.email, item.id].some((v) => v?.toLowerCase().includes(needle)))
    ).slice(0, 50);
  }, [students, search]);

  function changed() {
    setOperationId(nextOperationId());
    setFinished(false);
    setMessage("");
  }

  async function submit() {
    if (busy || finished || !student || reason.trim().length < 2) return;
    const user = auth.currentUser;
    if (!user) { setMessage("請重新登入管理員帳號。"); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/special-leave/quota", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, year, half, action, reason: reason.trim(), operationId }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.error || "調整失敗。");
      setFinished(true);
      setMessage(result.alreadyDone ? "此筆調整已完成，系統沒有重複修改。" : "調整完成，會員額度已同步更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "額度調整失敗。");
    } finally { setBusy(false); }
  }

  const periodKey = `${year}-H${half}`;
  const existing = student?.specialLeaveOverrides?.[periodKey]?.status;
  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">手動調整特殊請假額度</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          每半年預設 1 次。可恢復本期可用額度，或將本期額度標記為已使用。
          不會撤銷預約、修改歷史請假紀錄、扣點或重複退點。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          搜尋學生
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal"
            placeholder="姓名、Email 或 UID" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          調整對象
          <select className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal" value={userId}
            onChange={(e) => { setUserId(e.target.value); changed(); }}>
            <option value="">請選擇學生</option>
            {student && !matched.some((item) => item.id === userId) && <option value={userId}>{student.name} · {student.email}</option>}
            {matched.map((item) => <option key={item.id} value={item.id}>{item.name || item.nickname || "未命名"} · {item.email || item.id}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          年份
          <input type="number" min={2020} max={2100} value={year}
            className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal"
            onChange={(e) => { setYear(Number(e.target.value)); changed(); }} />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          期間
          <select value={half} className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal"
            onChange={(e) => { setHalf(Number(e.target.value)); changed(); }}>
            <option value={1}>上半年（1–6 月）</option>
            <option value={2}>下半年（7–12 月）</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
          調整方式
          <select value={action} className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal"
            onChange={(e) => { setAction(e.target.value as "restore" | "mark_used"); changed(); }}>
            <option value="restore">恢復 1 次特殊請假額度</option>
            <option value="mark_used">設為本期已使用（0 次）</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
          調整原因（必填）
          <textarea rows={2} maxLength={200} value={reason}
            className="mt-1 block w-full rounded-xl border border-slate-300 p-3 font-normal"
            placeholder="例如：誤使用特殊請假，經老師核對後恢復額度"
            onChange={(e) => { setReason(e.target.value); changed(); }} />
        </label>
      </div>
      {student && <p className="mt-3 text-xs text-slate-600">
        目前手動設定：{existing === "available" ? "恢復可用" : existing === "blocked" ? "已使用" :
          existing === "consumed" ? "已消耗恢復額度" : "無手動設定（依原請假紀錄判定）"}
      </p>}
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">
        {action === "restore"
          ? "恢復額度只提供一次額外的特殊請假資格；原有請假及退款紀錄不會刪除，不能重複核准同一筆請假。"
          : "設為已使用會限制學生本期再次使用特殊請假，但不會取消既有預約或向學生扣點。"}
      </p>
      <button type="button" disabled={busy || finished || !userId || reason.trim().length < 2 || year < 2020 || year > 2100}
        className="mt-4 rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        onClick={() => {
          if (window.confirm(`確定要對「${student?.name || student?.email || userId}」${year} 年${half === 1 ? "上半年" : "下半年"}${action === "restore" ? "恢復 1 次額度" : "設為已使用"}？\\n原因：${reason.trim()}`)) void submit();
        }}>
        {busy ? "儲存中……" : finished ? "已完成調整" : "確認調整額度"}
      </button>
      {message && <p role="status" className={`mt-3 text-sm ${finished ? "text-emerald-700" : "text-red-700"}`}>{message}</p>}
    </div>
  );
}
