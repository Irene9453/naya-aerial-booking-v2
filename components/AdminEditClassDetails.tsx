"use client";

import { useEffect, useState } from "react";
import type { Timestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase";

type Props = {
  classId: string;
  courseName: string;
  startTime: Timestamp | null;
  bookedCount: number;
};
function taipeiLocalValue(time: Timestamp | null) {
  if (!time) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23",
  }).formatToParts(time.toDate());
  const get = (key: string) => parts.find(x => x.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function parseTaipeiDateTime(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  // Taiwan has no current DST; date-time-local is explicitly interpreted as UTC+08:00.
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime())) return null;
  if (taipeiLocalValue({ toDate: () => date } as Timestamp) !== value) return null;
  return date.toISOString();
}
function operationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `edit_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function AdminEditClassDetails({ classId, courseName, startTime, bookedCount }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(courseName);
  const [time, setTime] = useState(taipeiLocalValue(startTime));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [nonce, setNonce] = useState(operationId);

  useEffect(() => {
    if (!open) {
      setName(courseName);
      setTime(taipeiLocalValue(startTime));
      setDone(false);
      setMessage("");
      setNonce(operationId());
    }
  }, [courseName, startTime, open]);

  const changed = name.trim() !== courseName || time !== taipeiLocalValue(startTime);
  const iso = parseTaipeiDateTime(time);

  async function save() {
    if (!iso || busy || done) return;
    setBusy(true);
    setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw Error("請重新登入管理員。");
      const response = await fetch("/api/admin/classes/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ classId, courseName: name.trim(), startTimeIso: iso, operationId: nonce }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw Error(result.error || "修改失敗。");
      setDone(true);
      setMessage(result.noChange ? "課程沒有變更。" : `已修改成功，系統已通知 ${result.notified ?? 0} 位目前預約的學生。`);
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修改失敗，請稍後重試。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-3">
    {!open ? <button type="button" className="rounded-lg border border-sky-300 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50"
      onClick={() => { setMessage(""); setOpen(true); setDone(false); }}>
      ✏️ 修改課名／時間
    </button> : <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <p className="text-sm font-bold text-sky-900">編輯已建立課程</p>
      <label className="block text-sm font-semibold text-slate-700">課程名稱
        <input className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"
          value={name} maxLength={100} disabled={busy}
          onChange={event => { setName(event.target.value); setDone(false); setNonce(operationId()); }} />
      </label>
      <label className="block text-sm font-semibold text-slate-700">開始時間（台灣時間）
        <input type="datetime-local" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"
          value={time} disabled={busy}
          onChange={event => { setTime(event.target.value); setDone(false); setNonce(operationId()); }} />
      </label>
      <p className="text-xs leading-5 text-amber-800">
        課程時間與名稱修改後，系統會同步更新已預約學生的預約紀錄，並發送站內通知。
        若原課程有結束時間，會保留原本的上課時長。已取消或已開始的課程不可修改。
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !changed || !iso || name.trim().length < 2}
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          onClick={() => {
            if (!iso) return;
            if (window.confirm(`確定修改這堂課？\\n${courseName} → ${name.trim()}\\n預約中：${bookedCount} 人（以系統最新預約名單為準）\\n開始時間：${time}（台灣時間）\\n學生會收到站內異動通知。`)) void save();
          }}>
          {busy ? "儲存中……" : "確認修改並通知"}
        </button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setMessage(""); }}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">取消</button>
      </div>
    </div>}
    {message && <p role="status" className="mt-2 text-sm font-semibold text-sky-800">{message}</p>}
  </div>;
}
