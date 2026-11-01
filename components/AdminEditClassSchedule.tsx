"use client";

import { useState, type FormEvent } from "react";
import { auth } from "@/lib/firebase";
import { classScheduleDates, oneHourLater } from "@/lib/classScheduleDefaults";

type Props = { classId: string; startTimeMillis: number | null; endTimeMillis: number | null; status: string };
function taipeiFields(value: number | null) {
  if (value === null) return { date: "", time: "" };
  const local = new Date(value + 8 * 3600000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
export default function AdminEditClassSchedule({ classId, startTimeMillis, endTimeMillis, status }: Props) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [nextDay, setNextDay] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [original, setOriginal] = useState({ start: startTimeMillis, end: endTimeMillis });
  const [operationId, setOperationId] = useState("");
  function open() {
    const startFields = taipeiFields(startTimeMillis), endFields = taipeiFields(endTimeMillis);
    const suggested = oneHourLater(startFields.time);
    setDate(startFields.date); setStart(startFields.time); setEnd(endFields.time || suggested.endTime);
    setNextDay(endTimeMillis === null ? suggested.nextDay : endFields.date > startFields.date);
    setOriginal({ start: startTimeMillis, end: endTimeMillis });
    setReason(""); setMessage(""); setOperationId(crypto.randomUUID()); setEditing(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const { startDate, endDate } = classScheduleDates(date, start, end, nextDay);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate || endDate.getTime() - startDate.getTime() > 86400000 || reason.trim().length < 2) {
      setMessage("請確認時間先後、是否跨日，並填寫修改原因。"); return;
    }
    if (!auth.currentUser) { setMessage("登入已失效，請重新登入。"); return; }
    if (!window.confirm("確定修改時間？學生的預約與候補時間會同步更新，並收到站內通知。")) return;
    setBusy(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/admin/classes/schedule", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classId, startTimeMillis: startDate.getTime(), endTimeMillis: endDate.getTime(), expectedStartTimeMillis: original.start, expectedEndTimeMillis: original.end, reason, operationId }) });
      const data = await response.json().catch(() => ({ error: `伺服器回應異常（HTTP ${response.status}）。` }));
      if (!response.ok || data.success !== true) throw Error(data.error || "修改時間失敗。");
      setEditing(false); setMessage(`已修改時間，已通知 ${data.notifiedStudents} 位學生。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "修改時間失敗。"); }
    finally { setBusy(false); }
  }
  return <div className={editing ? "w-full min-w-0" : ""}>
    {!editing ? <button type="button" disabled={status === "cancelled" || status === "canceled"} onClick={open}
      className="rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-40">修改時間</button> :
      <form onSubmit={save} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
        <p className="mb-3 text-sm text-slate-700">時間以台灣時間為準；可調整已開課課程，出席及點數紀錄會保留。</p>
        <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm">上課日期<input aria-label="修改上課日期" type="date" required value={date} onChange={e => setDate(e.target.value)} className="mt-1 block min-w-0 w-full rounded-lg border border-slate-300 bg-white p-2" /></label>
          <label className="min-w-0 text-sm">開始時間<input aria-label="修改開始時間" type="time" required value={start} onChange={e => { const value = e.target.value; const suggested = oneHourLater(value); setStart(value); setEnd(suggested.endTime); setNextDay(suggested.nextDay); }} className="mt-1 block min-w-0 w-full rounded-lg border border-slate-300 bg-white p-2" /></label>
          <label className="min-w-0 text-sm">結束時間<input aria-label="修改結束時間" type="time" required value={end} onChange={e => setEnd(e.target.value)} className="mt-1 block min-w-0 w-full rounded-lg border border-slate-300 bg-white p-2" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nextDay} onChange={e => setNextDay(e.target.checked)} />結束於隔天</label>
          <label className="text-sm sm:col-span-2">修改原因<input required minLength={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2" placeholder="例如：老師調整上課時間" /></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white">{busy ? "儲存中…" : "儲存時間"}</button><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">關閉</button></div>
        </fieldset>
      </form>}
    {message && <p role="status" className="mt-2 text-sm text-slate-700">{message}</p>}
  </div>;
}
