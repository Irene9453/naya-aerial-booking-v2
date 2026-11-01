"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { couponValidityLabel } from "@/lib/couponValidity";
export default function AdminCouponValidityManager() {
  const [targets, setTargets] = useState<Array<{ id: string; name: string; kind: string; phone: string }>>([]);
  const [target, setTarget] = useState(""); const [search, setSearch] = useState("");
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [mode, setMode] = useState("unknown"), [date, setDate] = useState(""), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    const stops = ["users", "legacyMembers"].map(name => onSnapshot(collection(db, name), snap => {
      const kind = name === "users" ? "user" : "legacy";
      setTargets(old => [...old.filter(item => item.kind !== kind), ...snap.docs.filter(doc => name !== "users" || doc.data().role === "student").map(doc => ({ id: doc.id, kind, name: String(doc.data().name ?? "未填姓名"), phone: String(doc.data().phoneNormalized ?? doc.data().phone ?? "") }))]);
    }, () => setMessage("會員名單讀取失敗。")));
    return () => stops.forEach(stop => stop());
  }, []);
  async function post(body: Record<string, unknown>) {
    const user = auth.currentUser; if (!user) throw Error("請先登入管理員。");
    const r = await fetch("/api/admin/coupons/validity", { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json(); if (!r.ok) throw Error(data.error ?? "操作失敗。"); return data;
  }
  async function load() {
    const selected = targets.find(item => `${item.kind}:${item.id}` === target); if (!selected) return;
    setBusy(true); setMessage("");
    try { const result = await post({ action: "list", kind: selected.kind, targetId: selected.id }); setItems(result.items); }
    catch (error) { setItems([]); setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    if (!editing) return; setBusy(true); setMessage("");
    try { await post({ action: "set", ...editing, expiryMode: mode, expiresOn: date, reason }); setEditing(null); await load(); setMessage("期限已儲存；已使用的券不會重新發放，待核款訂單的保留優惠不變。"); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <section className="mt-8 rounded-3xl bg-white p-5 text-slate-900 md:p-8"><h2 className="text-2xl font-bold">優惠券期限管理</h2>
    <p className="mt-2 text-sm leading-6 text-slate-700">補登舊券原期限、確認無期限或展延既有券。選「舊資料」可處理尚未認領的券；同一種券每張可設定不同日期。</p>
    <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜尋會員姓名或手機" className="mt-4 w-full rounded-xl border p-3" />
    <select disabled={busy} value={target} onChange={event => { setTarget(event.target.value); setItems([]); }} className="mt-3 w-full rounded-xl border p-3"><option value="">選擇會員</option>{targets.filter(item => `${item.name} ${item.phone}`.includes(search)).map(item => <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{item.kind === "legacy" ? "舊資料" : "會員帳戶"}｜{item.name}｜{item.phone}</option>)}</select>
    <button type="button" disabled={busy || !target} onClick={() => void load()} className="mt-3 rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white disabled:bg-slate-300">{busy ? "處理中……" : "查詢優惠券"}</button>
    {message && <p role="status" className="mt-3 rounded-xl bg-slate-100 p-3 text-slate-800">{message}</p>}
    <div className="mt-4 space-y-3">{items.map(item => <article key={String(item.id)} className="rounded-xl border p-4"><p className="font-bold">{String(item.name ?? "優惠券")} · {String(item.status)}</p><p className="mt-1 text-sm text-slate-700">{couponValidityLabel(item)}</p><button type="button" disabled={busy || item.status === "reserved"} onClick={() => { setEditing(item); setMode(String(item.expiryMode ?? (String(item.source ?? "").startsWith("legacy") || item.kind === "legacy" ? "unknown" : "unlimited"))); setDate(String(item.expiresOn ?? "")); setReason(""); }} className="mt-2 rounded-xl border border-sky-700 px-4 py-2 font-semibold text-sky-800">{item.status === "reserved" ? "待核款訂單保留中" : "設定期限"}</button></article>)}</div>
    {editing && <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6"><h3 className="text-xl font-bold">設定「{String(editing.name ?? "優惠券")}」期限</h3><label className="mt-4 block">期限方式<select disabled={busy} value={mode} onChange={event => setMode(event.target.value)} className="mt-1 w-full rounded-xl border p-3"><option value="unknown">待核對</option><option value="unlimited">確認無期限</option><option value="date">指定到期日</option></select></label>{mode === "date" && <label className="mt-3 block">有效至當日 23:59（台灣時間）<input type="date" disabled={busy} value={date} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>}<label className="mt-3 block">設定／展延原因<textarea disabled={busy} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-1 w-full rounded-xl border p-3" /></label><div className="mt-4 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-xl border px-4 py-2">取消</button><button type="button" disabled={busy || reason.trim().length < 2 || (mode === "date" && !date)} onClick={() => void save()} className="rounded-xl bg-sky-700 px-4 py-2 text-white disabled:bg-slate-300">儲存期限</button></div></div></div>}
  </section>;
}
