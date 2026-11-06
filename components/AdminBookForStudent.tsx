"use client";
import { useMemo, useState } from "react";
import type { Timestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase";
type Student = { id: string; name: string; nickname?: string; email: string; points: number; role: string };
type Class = { id: string; courseName: string; location?: string; startTime: Timestamp | null; pointsRequired: number; capacity: number; bookedCount: number; status: string };
type Payment = "points" | "trial_voucher";
function getOffer(name: string): "trial_yoga" | "trial_aerial" | null {
  const title = name.replace(/\s/g, "");
  if (/低空|環綢|特別課|特殊課|混合|雙人|私人|包班/.test(title)) return null;
  if (/空中瑜[伽珈]|空瑜/.test(title) && !/舞綢|空環/.test(title)) return "trial_yoga";
  if (/舞綢|空環/.test(title) && !/空中瑜[伽珈]|空瑜/.test(title)) return "trial_aerial";
  return null;
}
const format = (time: Timestamp | null) => time?.toDate().toLocaleString("zh-TW", {
  timeZone: "Asia/Taipei", month: "numeric", day: "numeric",
  weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
}) ?? "時間未設定";

export default function AdminBookForStudent({ students, classes }: { students: Student[]; classes: Class[] }) {
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classId, setClassId] = useState("");
  const [payment, setPayment] = useState<Payment>("points");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useState("");
  const selectedStudent = students.find(s => s.id === studentId);
  const selectedClass = classes.find(c => c.id === classId);
  const matches = useMemo(() => students.filter(s => s.role === "student" &&
    (!search.trim() || [s.name, s.nickname, s.email, s.id].some(v =>
      String(v ?? "").toLowerCase().includes(search.trim().toLowerCase())))).slice(0, 40), [students, search]);
  const available = useMemo(() => classes.filter(c => c.status === "open" &&
    (c.startTime?.toMillis() ?? 0) > Date.now() && c.capacity > c.bookedCount &&
    c.capacity > 0).sort((a,b) => (a.startTime?.toMillis() ?? 0) - (b.startTime?.toMillis() ?? 0)), [classes]);
  const offer = selectedClass ? getOffer(selectedClass.courseName) : null;
  const paymentSummary = payment === "points"
    ? `${selectedClass?.pointsRequired ?? "—"} 點`
    : offer === "trial_yoga" ? "空瑜體驗券 1 張" : "舞綢／空環體驗券 1 張";
  function changed() { setCompleted(false); setMessage(""); }

  async function book() {
    if (busy || completed || !selectedStudent || !selectedClass) return;
    setBusy(true); setMessage("");
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw Error("請重新登入管理員帳號。");
      const response = await fetch("/api/admin/bookings/book", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
        body: JSON.stringify({
          studentId, classId, paymentType: payment,
          ...(payment === "trial_voucher" && offer
            ? { trialVoucherId: `new_student_${studentId}_${offer}` } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw Error(result.error ?? "代約失敗");
      setCompleted(true);
      setMessage(`已替 ${selectedStudent.name || selectedStudent.email} 預約成功。${payment === "points" ? `剩餘 ${result.remainingPoints} 點。` : "體驗券已使用。"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "預約失敗，請稍後重試。"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4 p-4 sm:p-5">
    <p className="text-sm leading-6 text-slate-600">
      選擇學生及課程，由老師代為預約。系統會檢查剩餘名額、學生點數或體驗券及重複預約，並將預約登記在學生帳號。
    </p>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block text-sm font-semibold text-slate-700">搜尋學生
        <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"
          placeholder="姓名、暱稱、Email" value={search} onChange={e => setSearch(e.target.value)} />
      </label>
      <label className="block text-sm font-semibold text-slate-700">預約對象
        <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"
          value={studentId} onChange={e => { setStudentId(e.target.value); changed(); }}>
          <option value="">請選擇學生</option>
          {studentId && !matches.some(s => s.id === studentId) &&
            <option value={studentId}>{selectedStudent?.name || selectedStudent?.email || studentId}</option>}
          {matches.map(s => <option key={s.id} value={s.id}>{s.name || s.nickname || "未命名"} · {s.email || s.id}（{s.points} 點）</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold text-slate-700">選擇課程
        <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"
          value={classId} onChange={e => { setClassId(e.target.value); changed(); }}>
          <option value="">請選擇課程</option>
          {available.map(c => <option key={c.id} value={c.id}>{format(c.startTime)}｜{c.courseName}｜{c.bookedCount}/{c.capacity}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold text-slate-700">預約扣款方式
        <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"
          value={payment} onChange={e => { setPayment(e.target.value as Payment); changed(); }}>
          <option value="points">使用學生點數</option>
          <option value="trial_voucher" disabled={!offer}>使用符合課程的體驗券</option>
        </select>
      </label>
    </div>
    {selectedClass && <p className="rounded-xl bg-sky-50 p-3 text-sm text-slate-700">
      {selectedClass.courseName}｜{format(selectedClass.startTime)}｜{selectedClass.location || "地點未指定"}
      <br />使用：{paymentSummary}{selectedStudent && payment === "points" ? `｜學生目前 ${selectedStudent.points} 點` : ""}
    </p>}
    <p className="text-xs leading-5 text-amber-800">
      代約成功後將直接扣除所選學生的點數或體驗券並加入預約名單；若已滿班、重複約課、餘額不足或券不可用，系統會拒絕操作。
    </p>
    <button type="button" disabled={busy || completed || !selectedStudent || !selectedClass || (payment === "trial_voucher" && !offer)}
      onClick={() => {
        if (!selectedStudent || !selectedClass) return;
        if (window.confirm(`確認替「${selectedStudent.name || selectedStudent.email}」預約「${selectedClass.courseName}」？\\n時間：${format(selectedClass.startTime)}\\n扣款：${paymentSummary}`)) void book();
      }}
      className="rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white disabled:bg-slate-300">
      {busy ? "處理中……" : completed ? "預約完成" : "確認替學生預約"}
    </button>
    {message && <p role="status" className="text-sm font-semibold text-slate-700">{message}</p>}
  </div>;
}
