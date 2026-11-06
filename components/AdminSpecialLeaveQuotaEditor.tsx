"use client";
import { useMemo, useState } from "react";
import { auth } from "@/lib/firebase";

type Student = { id: string; name: string; nickname?: string; email: string; role: string };
const period = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return `${year}-H${month <= 6 ? 1 : 2}`;
};
const newId = () => crypto.randomUUID();

export default function AdminSpecialLeaveQuotaEditor({ students }: { students: Student[] }) {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [periodKey, setPeriodKey] = useState(period);
  const [action, setAction] = useState<"restore" | "mark_used">("restore");
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState(newId);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");

  const matches = useMemo(() => students.filter((student) => student.role === "student" &&
    (!query || [student.name, student.nickname, student.email, student.id]
      .some((value) => value?.toLowerCase().includes(query.trim().toLowerCase())))).slice(0, 40), [students, query]);

  function reset() { setOperationId(newId()); setSuccess(false); setMessage(""); }
  async function save() {
    if (busy || success || !userId || reason.trim().length < 2) return;
    const user = auth.currentUser;
    if (!user) { setMessage("請重新登入管理員。"); return; }
    setBusy(true); setMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/special-leave/quota", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId, periodKey, action, reason: reason.trim(), operationId }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw Error(result.error || "調整失敗");
      setSuccess(true);
      setMessage(result.alreadyDone ? "先前已完成相同操作，沒有重複修改。" : "特殊請假額度已調整，學生會員中心將即時更新。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失敗"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 sm:p-5">
      <h3 className="font-bold text-slate-900">手動調整特殊請假額度</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        每半年原則上 1 次。可恢復一次可用額度，或標記本期已使用。
        此操作只調整額度，不會取消預約、再次退點或刪除既有請假紀錄。
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">搜尋學生
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名、Email 或 UID"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" />
        </label>
        <label className="text-sm font-semibold text-slate-700">選擇學生
          <select value={userId} onChange={(event) => { setUserId(event.target.value); reset(); }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
            <option value="">請選擇</option>
            {userId && !matches.some((student) => student.id === userId) && (
              <option value={userId}>{students.find((student) => student.id === userId)?.name || userId}</option>
            )}
            {matches.map((student) => <option value={student.id} key={student.id}>{student.name || student.nickname || "未命名"} · {student.email || student.id}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">半年期間
          <select value={periodKey} onChange={(event) => { setPeriodKey(event.target.value); reset(); }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
            {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).flatMap((year) =>
              [1, 2].map((half) => <option key={`${year}-H${half}`} value={`${year}-H${half}`}>{year} 年{half === 1 ? "上半年" : "下半年"}</option>))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">操作
          <select value={action} onChange={(event) => { setAction(event.target.value as "restore" | "mark_used"); reset(); }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
            <option value="restore">恢復 1 次額度</option>
            <option value="mark_used">標記本期已使用（0 次）</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">調整原因（必填）
          <textarea rows={2} maxLength={200} value={reason} onChange={(event) => { setReason(event.target.value); reset(); }}
            placeholder="例如：老師核准恢復本期一次特殊請假額度"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" />
        </label>
      </div>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        恢復額度後，學生仍須符合特殊請假的課程與時間條件。每次操作保留原因與歷史紀錄；請勿將調整額度當成退費工具。
      </p>
      <button type="button" disabled={busy || success || !userId || reason.trim().length < 2}
        onClick={() => {
          const member = students.find((student) => student.id === userId);
          if (window.confirm(`確認調整「${member?.name || userId}」的 ${periodKey} 額度為「${action === "restore" ? "可使用 1 次" : "已使用"}」？\\n原因：${reason.trim()}`)) void save();
        }}
        className="mt-4 rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">
        {busy ? "處理中……" : success ? "已完成" : "確認調整"}
      </button>
      {message && <p className="mt-3 text-sm font-semibold text-slate-700" role="status">{message}</p>}
    </div>
  );
}
