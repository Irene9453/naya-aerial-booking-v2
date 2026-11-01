"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Member = { id: string; name: string; phone: string; email: string; role: string };
type Coupon = { expiryMode?: string; expiryDate?: string; validDays?: number; id: string; name: string; isActive: boolean; discountRate: number };
type Result = { userId: string; status: "created" | "already_done" | "failed"; error?: string };

export default function AdminCouponGiftManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [couponId, setCouponId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  useEffect(() => {
    const stopMembers = onSnapshot(collection(db, "users"), snap => {
      setMembers(snap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? ""),
        phone: String(d.data().phone ?? ""), email: String(d.data().email ?? ""),
        role: String(d.data().role ?? "student") })).filter(m => m.role === "student"));
    }, () => setMessage("會員讀取失敗。"));
    const stopCoupons = onSnapshot(collection(db, "coupons"), snap => {
      setCoupons(snap.docs.map(d => ({ expiryMode: String(d.data().expiryMode ?? "unlimited"), expiryDate: String(d.data().expiryDate ?? ""), validDays: Number(d.data().validDays ?? 0), id: d.id, name: String(d.data().name ?? ""),
        isActive: d.data().isActive === true, discountRate: Number(d.data().discountRate ?? 1) })));
    }, () => setMessage("優惠券讀取失敗。"));
    return () => { stopMembers(); stopCoupons(); };
  }, []);
  const filtered = useMemo(() => members.filter(m =>
    `${m.name} ${m.phone} ${m.email}`.toLowerCase().includes(search.trim().toLowerCase())), [members, search]);
  const selectedSet = new Set(selected);
  const activeCoupons = coupons.filter(c => c.isActive);
  const toggle = (id: string) => setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  async function gift() {
    if (!couponId || selected.length === 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || reason.trim().length < 2) {
      return setMessage("請選優惠券、會員、每人 1～10 張及至少 2 字原因。");
    }
    const coupon = coupons.find(c => c.id === couponId);
    if (!coupon || !confirm(`確定發送「${coupon.name}」給 ${selected.length} 位會員，每人 ${quantity} 張（共 ${selected.length * quantity} 張）？`)) return;
    const user = auth.currentUser;
    if (!user) return setMessage("請先登入管理員。");
    setBusy(true); setMessage(""); setFailures([]);
    const signature = JSON.stringify({ couponId, quantity, reason: reason.trim(), userIds: [...selected].sort() });
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID().replace(/-/g, "") };
    const operationId = operation.current.id;
    const results: Result[] = [];
    try {
      const token = await user.getIdToken();
      for (let i = 0; i < selected.length; i += 100) {
        const batch = selected.slice(i, i + 100);
        const response = await fetch("/api/admin/coupons/gift", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ operationId, couponId, userIds: batch, quantity, reason: reason.trim() }),
        });
        const data: { error?: string; results?: Result[] } = await response.json();
        if (!response.ok || !data.results) throw new Error(data.error ?? "贈券 API 失敗。");
        results.push(...data.results);
      }
      const created = results.filter(r => r.status === "created").length;
      const repeated = results.filter(r => r.status === "already_done").length;
      const failed = results.filter(r => r.status === "failed");
      setFailures(failed.map(r => `${members.find(m => m.id === r.userId)?.name ?? r.userId}：${r.error ?? "失敗"}`));
      setMessage(`已成功發放給 ${created} 位會員（${created * quantity} 張）；重複略過 ${repeated} 位；失敗 ${failed.length} 位。操作編號：${operationId}`);
      if (failed.length === 0) { setSelected([]); operation.current = null; }
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "發放中斷"}。可保持此頁與相同內容再按一次重試，已完成的會員會自動略過。操作編號：${operationId}`);
    } finally { setBusy(false); }
  }
  return <section className="mt-8 rounded-3xl bg-white p-7 shadow-sm">
    <h2 className="text-2xl font-bold">🎁 管理員贈券</h2>
    <p className="mt-2 text-sm text-slate-600">可發給單人或多位會員。確認後會實際發券，每次發放均保留原因與紀錄。</p>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <label>優惠券<select disabled={busy} className="mt-1 w-full rounded-xl border p-3" value={couponId} onChange={e => setCouponId(e.target.value)}>
        <option value="">請選擇</option>{activeCoupons.map(c => <option key={c.id} value={c.id}>{c.name}（{Number((c.discountRate * 10).toFixed(2))} 折）</option>)}
      </select></label>
      <label>每人張數（1～10）<input disabled={busy} type="number" min={1} max={10} className="mt-1 w-full rounded-xl border p-3" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
      <label className="md:col-span-2">贈送原因<textarea maxLength={200} disabled={busy} className="mt-1 w-full rounded-xl border p-3" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="例如：開幕感謝禮" /></label>
    </div>
    {couponId && <p className="mt-3 text-sm text-slate-700">新領券期限：{(() => { const coupon = coupons.find(item => item.id === couponId); return coupon?.expiryMode === "date" ? `至 ${coupon.expiryDate} 當日 23:59` : coupon?.expiryMode === "days" ? `領取當日起 ${coupon.validDays} 天（含當日）` : "無期限"; })()}</p>}
    <input disabled={busy} className="mt-5 w-full rounded-xl border p-3" placeholder="搜尋姓名、電話或 Email" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={busy} className="rounded-xl border px-3 py-2" onClick={() => setSelected(old => [...new Set([...old, ...filtered.map(m => m.id)])])}>全選搜尋結果（{filtered.length}）</button>
      <button disabled={busy} className="rounded-xl border px-3 py-2" onClick={() => setSelected(members.map(m => m.id))}>全選所有會員（{members.length}）</button>
      <button disabled={busy} className="rounded-xl border px-3 py-2" onClick={() => setSelected([])}>清除選擇</button>
      <span className="self-center text-sm font-semibold">已選 {selected.length} 人</span>
    </div>
    <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border p-3">
      {filtered.map(m => <label key={m.id} className="flex cursor-pointer gap-3 border-b p-2 text-sm last:border-b-0">
        <input disabled={busy} type="checkbox" checked={selectedSet.has(m.id)} onChange={() => toggle(m.id)} />
        <span>{m.name || "未填姓名"}　{m.phone}　<span className="text-slate-600">{m.email}</span></span>
      </label>)}
      {filtered.length === 0 && <p className="p-3 text-slate-600">沒有符合的會員。</p>}
    </div>
    <button disabled={busy || selected.length === 0 || !couponId} onClick={gift} className="mt-5 rounded-xl bg-sky-600 px-6 py-3 font-bold text-white disabled:opacity-50">{busy ? "發放中……" : `確認贈券（${selected.length * quantity} 張）`}</button>
    {message && <p className="mt-4 break-words rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}
    {failures.length > 0 && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{failures.map((x, i) => <p key={i}>{x}</p>)}</div>}
  </section>;
}