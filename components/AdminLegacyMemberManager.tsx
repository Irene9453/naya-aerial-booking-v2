"use client";

import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import AdminSection from "@/components/AdminSection";
import { AdminLegacyClaimReview } from "@/components/AdminLegacyClaimReview";

type LegacyCoupon = {
  couponId: string;
  quantity: number;
  expiresOn?: string | null;
  expiresOnByIndex?: Array<string | null>;
};

type CouponOption = {
  id: string;
  name: string;
  discountRate: number;
  isActive: boolean;
};

type LegacyMember = {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;
  points: number;
  rewardPoints: number;
  coupons?: LegacyCoupon[];
  status: "unclaimed" | "claimed";
  claimedBy?: string;
  purchaseHistoryStatus: "unknown" | "never_purchased" | "purchased";
  purchaseHistoryEvidence: string;
};

type StatusFilter = "all" | "unclaimed" | "claimed";

type ApiResult = {
  success?: boolean;
  status?: string; reason?: string; purchasingEnabled?: boolean; emailVerified?: boolean | null; unavailableOfferIds?: string[];
  error?: string;
  created?: number;
  skipped?: number;
  errors?: string[];
  total?: number;
  valid?: number;
  importable?: number;
  duplicateCount?: number;
  existingCount?: number;
  invalidCount?: number;
  coursePointsTotal?: number;
  rewardPointsTotal?: number;
  couponCountTotal?: number;
  preview?: Array<{
    line: number;
    name: string;
    phone: string;
    birthday: string;
    points: number;
    rewardPoints: number;
  }>;

  journeyLegacyClassesTotal?: number;};

async function adminPost(path: string, body: unknown): Promise<ApiResult> {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入管理員帳號。");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: ApiResult = {};
  try { data = text ? JSON.parse(text) : {}; } catch {
    console.error("API 回傳非 JSON：", text);
    throw new Error(`API 執行失敗（HTTP ${response.status}）。`);
  }
  if (!response.ok) throw new Error(data.error ?? "操作失敗。");
  return data;
}

export function AdminLegacyMemberManager() {
  const [members, setMembers] = useState<LegacyMember[]>([]);
  const [checkingEligibilityId, setCheckingEligibilityId] = useState<string | null>(null);
  const [historyMember, setHistoryMember] = useState<LegacyMember | null>(null);
  const [historyStatus, setHistoryStatus] = useState<LegacyMember["purchaseHistoryStatus"]>("unknown");
  const [historyEvidence, setHistoryEvidence] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [editingMember, setEditingMember] = useState<LegacyMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirthdayYear, setEditBirthdayYear] = useState("");
  const [editBirthdayMonth, setEditBirthdayMonth] = useState("");
  const [editBirthdayDay, setEditBirthdayDay] = useState("");
  const [editPoints, setEditPoints] = useState("");
  const [editRewardPoints, setEditRewardPoints] = useState("");
  const [editLegacyCoupons, setEditLegacyCoupons] = useState<LegacyCoupon[]>([]);
  const [couponOptions, setCouponOptions] = useState<CouponOption[]>([]);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [couponLoadError, setCouponLoadError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  const [deletingMember, setDeletingMember] = useState<LegacyMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showBatch, setShowBatch] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [batchPreview, setBatchPreview] = useState<ApiResult | null>(null);

  useEffect(() => {
    const legacyQuery = query(collection(db, "legacyMembers"), orderBy("createdAt", "desc"));
    return onSnapshot(
      legacyQuery,
      (snapshot) => {
        setMembers(snapshot.docs.map((document) => {
          const data = document.data();
          return {
            id: document.id,
            name: String(data.name ?? ""),
            phone: String(data.phone ?? ""),
            phoneNormalized: String(data.phoneNormalized ?? data.phone ?? ""),
            birthdayYear: Number(data.birthdayYear ?? 0),
            birthdayMonth: Number(data.birthdayMonth ?? 0),
            birthdayDay: Number(data.birthdayDay ?? 0),
            points: Number(data.points ?? 0),
            rewardPoints: Number(data.rewardPoints ?? 0),
            coupons: Array.isArray(data.coupons)
              ? data.coupons.map((entry: Record<string, unknown>) => ({
                  couponId: String(entry.couponId ?? ""),
                  quantity: Number(entry.quantity ?? 0),
                  ...(entry.expiresOn !== undefined ? { expiresOn: entry.expiresOn as string | null } : {}),
                  ...(Array.isArray(entry.expiresOnByIndex) ? { expiresOnByIndex: entry.expiresOnByIndex as Array<string | null> } : {}),
                }))
              : [],
            status:
  data.status === "claimed" ||
  Boolean(data.claimedBy) ||
  Boolean(data.claimedAt)
    ? "claimed"
    : "unclaimed",
            claimedBy: data.claimedBy ? String(data.claimedBy) : undefined,
            purchaseHistoryStatus: data.purchaseHistoryStatus === "never_purchased" || data.purchaseHistoryStatus === "purchased" ? data.purchaseHistoryStatus : "unknown",
            purchaseHistoryEvidence: String(data.purchaseHistoryEvidence ?? ""),
          } satisfies LegacyMember;
        }));
        setIsLoading(false);
        setMessage("");
      },
      (error) => {
        console.error("讀取舊會員資料失敗：", error);
        setMessage("無法讀取舊會員資料。");
        setIsLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "coupons"),
      (snapshot) => {
        setCouponOptions(snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            name: String(data.name ?? item.id),
            discountRate: Number(data.discountRate ?? 1),
            isActive: data.isActive === true,
          };
        }));
        setCouponsLoaded(true);
        setCouponLoadError("");
      },
      (error) => {
        console.error("讀取優惠券種類失敗：", error);
        setCouponsLoaded(false);
        setCouponLoadError("無法讀取優惠券種類，請確認權限。");
      }
    );
  }, []);

  const unclaimedCount = useMemo(() => members.filter((m) => m.status === "unclaimed").length, [members]);
  const claimedCount = useMemo(() => members.filter((m) => m.status === "claimed").length, [members]);

  const filteredMembers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return members.filter((member) => {
      const matchesStatus = statusFilter === "all" || member.status === statusFilter;
      const matchesSearch = !keyword || member.name.toLowerCase().includes(keyword) || member.phoneNormalized.includes(keyword) || member.phone.includes(keyword);
      return matchesStatus && matchesSearch;
    });
  }, [members, searchTerm, statusFilter]);

  function formatBirthday(member: LegacyMember) {
    if (!member.birthdayMonth || !member.birthdayDay) return "—";
    const month = String(member.birthdayMonth).padStart(2, "0");
    const day = String(member.birthdayDay).padStart(2, "0");
    return member.birthdayYear ? `${member.birthdayYear}/${month}/${day}` : `${month}/${day}`;
  }

  function openEdit(member: LegacyMember) {
    if (member.status !== "unclaimed") return;
    setEditingMember(member);
    setEditName(member.name);
    setEditPhone(member.phoneNormalized || member.phone);
    setEditBirthdayYear(member.birthdayYear ? String(member.birthdayYear) : "");
    setEditBirthdayMonth(member.birthdayMonth ? String(member.birthdayMonth) : "");
    setEditBirthdayDay(member.birthdayDay ? String(member.birthdayDay) : "");
    setEditPoints(String(member.points));
    setEditRewardPoints(String(member.rewardPoints));
    setEditLegacyCoupons((member.coupons ?? []).map((item) => ({ ...item })));
    setEditMessage("");
  }

  async function saveEdit() {
    if (!editingMember) return;
    if (!couponsLoaded || couponLoadError) {
      setEditMessage("優惠券種類尚未成功載入，暫時無法儲存。");
      return;
    }

    const totalCoupons = editLegacyCoupons.reduce(
      (sum, item) => sum + item.quantity, 0
    );

    if (
      editLegacyCoupons.some(
        (item) =>
          !couponOptions.some((option) => option.id === item.couponId) ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 30
      ) ||
      totalCoupons > 60
    ) {
      setEditMessage("優惠券種類或張數不正確，每種最多 30 張、合計最多 60 張。");
      return;
    }

    setIsSavingEdit(true); setEditMessage("");
    try {
      await adminPost("/api/admin/legacy-members/update", {
        legacyMemberId: editingMember.id,
        name: editName,
        phone: editPhone,
        birthdayYear: editBirthdayYear,
        birthdayMonth: editBirthdayMonth,
        birthdayDay: editBirthdayDay,
        points: editPoints,
        rewardPoints: editRewardPoints,
        coupons: editLegacyCoupons,
      });
      setEditingMember(null);
      setMessage("舊會員資料已更新。");
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "更新失敗。");
    } finally { setIsSavingEdit(false); }
  }

  async function confirmDelete() {
    if (!deletingMember) return;
    setIsDeleting(true); setMessage("");
    try {
      await adminPost("/api/admin/legacy-members/delete", { legacyMemberId: deletingMember.id });
      setDeletingMember(null);
      setMessage("待認領舊會員已刪除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刪除失敗。");
    } finally { setIsDeleting(false); }
  }

  async function previewBatch() {
    if (!batchText.trim()) {
      setBatchMessage("請先貼上舊會員資料。");
      return;
    }

    setIsBatchSaving(true);
    setBatchMessage("");
    setBatchPreview(null);

    try {
      const data = await adminPost(
        "/api/admin/legacy-members/batch-preview",
        { text: batchText }
      );

      setBatchPreview(data);
      setBatchMessage(
        `預覽完成：共 ${data.total ?? 0} 筆，可匯入 ${data.importable ?? 0} 筆，` +
        `同批重複 ${data.duplicateCount ?? 0} 筆，已存在 ${data.existingCount ?? 0} 筆，` +
        `格式錯誤 ${data.invalidCount ?? 0} 筆，優惠券共 ${data.couponCountTotal ?? 0} 張。`
      );
    } catch (error) {
      setBatchPreview(null);
      setBatchMessage(error instanceof Error ? error.message : "預覽失敗。");
    } finally {
      setIsBatchSaving(false);
    }
  }

  async function confirmBatch() {
    if (!batchPreview || !batchPreview.importable) {
      setBatchMessage("沒有可匯入的資料，請先重新預覽。");
      return;
    }

    if (!window.confirm(
      `即將匯入 ${batchPreview.importable} 位會員。` +
      `\n課程點數合計：${batchPreview.coursePointsTotal ?? 0}` +
      `\n紅利點數合計：${batchPreview.rewardPointsTotal ?? 0}` +
      `\n歷史上課堂數合計：${batchPreview.journeyLegacyClassesTotal ?? 0}` +
      "\n優惠券總張數：${batchPreview.couponCountTotal ?? 0}\n確定要正式匯入嗎？"
    )) return;

    setIsBatchSaving(true);
    setBatchMessage("");

    try {
      const data = await adminPost(
        "/api/admin/legacy-members/batch-create",
        { text: batchText }
      );

      const details = data.errors?.length
        ? `\n${data.errors.slice(0, 8).join("\n")}`
        : "";

      setBatchMessage(
        `匯入完成：新增 ${data.created ?? 0} 筆，略過 ${data.skipped ?? 0} 筆。${details}`
      );
      setBatchPreview(null);

      if ((data.created ?? 0) > 0) setBatchText("");
    } catch (error) {
      setBatchMessage(error instanceof Error ? error.message : "批次新增失敗。");
    } finally {
      setIsBatchSaving(false);
    }
  }
 async function checkNewStudentEligibility(member: LegacyMember) {
    setCheckingEligibilityId(member.id); setMessage("");
    try {
      const result = await adminPost("/api/admin/new-student-offers/eligibility", { legacyMemberId: member.id });
      const reasons: Record<string, string> = { member_account_unlinked: "未找到對應會員帳號，請確認註冊手機與舊資料綁定。", phone_registry_mismatch: "手機綁定資料不一致，需要核對。", legacy_purchase_history_pending: "舊系統購課紀錄尚未確認。", legacy_identity_conflict: "舊資料已綁定其他帳號或綁定狀態不一致。", regular_purchase: "有一般課卡購買紀錄。", legacy_purchase: "有舊系統購課紀錄。", eligibility_consumed: "新生優惠資格已結束。", history_incomplete: "舊會員歷史資料核對開關尚未開啟。", not_student: "帳號不是學生身分。", legacy_claim_review: "認領資料仍待核對。" };
      const resultText = result.status !== "eligible" ? reasons[result.reason ?? ""] ?? `資格待確認：${result.reason ?? "未知原因"}` : result.emailVerified === false ? "Email 尚未驗證。" : !result.purchasingEnabled ? "資格符合，但正式購買開關尚未開啟。" : "資格符合，購買功能已開放。";
      setMessage(`${member.name}｜${resultText}${result.unavailableOfferIds?.length ? ` 有 ${result.unavailableOfferIds.length} 項優惠已申請或已購買。` : ""}（僅查詢，未修改資格或建立訂單）`);
    } catch (error) { setMessage((error as Error).message); } finally { setCheckingEligibilityId(null); }
  }
 async function savePurchaseHistory() {
    if (!historyMember) return;
    setHistoryBusy(true); setHistoryMessage("");
    try {
      await adminPost("/api/admin/legacy-members/purchase-history", {
        legacyMemberId: historyMember.id, status: historyStatus, evidence: historyEvidence,
      });
      setHistoryMember(null);
      setMessage("購課紀錄已儲存。會員可至新生優惠重新確認資格，系統仍會核對一般購課紀錄與各項限購。");
    } catch (error) { setHistoryMessage(error instanceof Error ? error.message : "儲存失敗。"); }
    finally { setHistoryBusy(false); }
  }
 return (
  <section className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-8">
    <AdminSection title="舊會員認領審核"><AdminLegacyClaimReview /></AdminSection>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">Legacy Migration</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">舊會員移轉管理</h2>
          <p className="mt-2 text-sm text-slate-500">查看、搜尋與管理舊系統會員的認領狀態。</p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl bg-amber-50 px-4 py-3"><p className="text-xs text-amber-700">待認領</p><p className="mt-1 text-xl font-bold text-amber-700">{unclaimedCount}</p></div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3"><p className="text-xs text-emerald-700">已認領</p><p className="mt-1 text-xl font-bold text-emerald-700">{claimedCount}</p></div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row">
        <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜尋姓名或手機號碼" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
        <div className="flex flex-wrap gap-2">
          {([['all','全部'],['unclaimed','待認領'],['claimed','已認領']] as const).map(([value,label]) => (
            <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-xl px-4 py-3 text-sm font-semibold ${statusFilter === value ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>
          ))}
          <button type="button" onClick={() => { setShowBatch(true); setBatchMessage(""); }} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">批次新增</button>
        </div>
      </div>

      {isLoading ? <p className="mt-6 text-sm text-slate-500">舊會員資料載入中……</p> : filteredMembers.length === 0 ? <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">目前找不到符合的舊會員資料。</p> : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-3 py-3">狀態</th><th className="px-3 py-3">姓名</th><th className="px-3 py-3">手機</th><th className="px-3 py-3">生日</th><th className="px-3 py-3">課程點數</th><th className="px-3 py-3">紅利點數</th><th className="px-3 py-3">購課紀錄</th><th className="px-3 py-3">操作</th></tr></thead>
            <tbody>{filteredMembers.map((member) => (
              <tr key={member.id} className="border-b border-slate-100">
                <td className="px-3 py-4">{member.status === "claimed" ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">已認領</span> : <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">待認領</span>}</td>
                <td className="px-3 py-4 font-semibold text-slate-800">{member.name || "—"}</td><td className="px-3 py-4 text-slate-600">{member.phoneNormalized || member.phone || "—"}</td><td className="px-3 py-4 text-slate-600">{formatBirthday(member)}</td><td className="px-3 py-4 font-semibold text-sky-700">{member.points}</td><td className="px-3 py-4 text-violet-700">{member.rewardPoints}</td>
                <td className="px-3 py-4"><button type="button" onClick={() => {
                  setHistoryMember(member); setHistoryStatus(member.purchaseHistoryStatus); setHistoryEvidence(member.purchaseHistoryEvidence); setHistoryMessage("");
                }} className="rounded-lg border border-sky-300 px-3 py-2 font-semibold text-sky-800">
                  {member.purchaseHistoryStatus === "never_purchased" ? "從未購課" : member.purchaseHistoryStatus === "purchased" ? "曾購課" : "待確認"}｜核對
                </button><button type="button" disabled={checkingEligibilityId !== null} onClick={() => void checkNewStudentEligibility(member)} className="mt-2 block rounded-lg border border-emerald-700 px-3 py-2 font-semibold text-emerald-800">{checkingEligibilityId === member.id ? "檢查中……" : "檢查新生資格"}</button></td>
                <td className="px-3 py-4">{member.status === "unclaimed" ? <div className="flex gap-2"><button type="button" onClick={() => openEdit(member)} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">編輯</button><button type="button" onClick={() => setDeletingMember(member)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">刪除</button></div> : <span className="text-xs text-slate-400">已鎖定</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {message && <p className={`mt-5 text-sm ${message.includes("失敗") || message.includes("無法") ? "text-red-600" : "text-emerald-700"}`}>{message}</p>}

      {historyMember && <div className="fixed inset-0 z-[330] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4">
        <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-slate-900">
          <h3 className="text-xl font-bold">{historyMember.name}｜舊系統購課紀錄</h3>
          <p className="mt-3 text-sm leading-6 text-slate-700">僅註冊、從未購課者可符合新生優惠；點數歸零不代表從未購課。請核對舊系統購課或收款紀錄後再設定。</p>
          <label className="mt-4 block font-semibold">購課狀態<select disabled={historyBusy} value={historyStatus} onChange={event => setHistoryStatus(event.target.value as LegacyMember["purchaseHistoryStatus"])} className="mt-2 w-full rounded-xl border border-slate-300 p-3">
            <option value="unknown">待確認</option><option value="never_purchased">僅註冊，從未購課</option><option value="purchased">曾經購課</option>
          </select></label>
          <label className="mt-4 block font-semibold">核對依據（10～500 字）<textarea disabled={historyBusy} value={historyEvidence} onChange={event => setHistoryEvidence(event.target.value)} maxLength={500} rows={4} className="mt-2 w-full rounded-xl border border-slate-300 p-3" placeholder="例如：已核對舊系統完整交易紀錄，僅有註冊資料，沒有購課或付款紀錄。" /></label>
          {historyMessage && <p role="status" className="mt-3 text-red-700">{historyMessage}</p>}
          <div className="mt-5 flex justify-end gap-3"><button type="button" disabled={historyBusy} onClick={() => setHistoryMember(null)} className="rounded-xl border px-4 py-3">取消</button><button type="button" disabled={historyBusy || historyEvidence.trim().length < 10} onClick={() => void savePurchaseHistory()} className="rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white disabled:bg-slate-300">{historyBusy ? "儲存中……" : "儲存核對結果"}</button></div>
        </div>
      </div>}
      {editingMember && <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-900/60 px-4 py-8"><div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
        <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">Edit Legacy Member</p><h3 className="mt-2 text-2xl font-bold text-slate-900">編輯待認領舊會員</h3></div><button type="button" onClick={() => setEditingMember(null)} disabled={isSavingEdit} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">關閉</button></div>
        <div className="mt-7 grid gap-5 sm:grid-cols-2"><Field label="姓名" value={editName} setValue={setEditName}/><Field label="手機" value={editPhone} setValue={setEditPhone}/></div>
        <p className="mb-2 mt-6 text-sm font-semibold text-slate-700">生日</p><div className="grid grid-cols-3 gap-3"><Field label="年" value={editBirthdayYear} setValue={setEditBirthdayYear} type="number" hideLabel/><Field label="月" value={editBirthdayMonth} setValue={setEditBirthdayMonth} type="number" hideLabel/><Field label="日" value={editBirthdayDay} setValue={setEditBirthdayDay} type="number" hideLabel/></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="課程點數" value={editPoints} setValue={setEditPoints} type="number"/><Field label="紅利點數" value={editRewardPoints} setValue={setEditRewardPoints} type="number"/></div>
        <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
          <h4 className="font-bold text-slate-800">🎟️ 舊會員剩餘優惠券</h4>
          <p className="mt-1 text-sm text-slate-500">
            設定會員尚未使用的優惠券，認領後會一併移轉。
          </p>

          {couponLoadError && (
            <p className="mt-3 text-sm text-red-600">{couponLoadError}</p>
          )}

          {!couponsLoaded && !couponLoadError && (
            <p className="mt-3 text-sm text-slate-500">優惠券載入中……</p>
          )}

          {couponsLoaded && (
            <div className="mt-4 space-y-3">
              {couponOptions
                .filter((option) =>
                  option.isActive ||
                  editLegacyCoupons.some((item) => item.couponId === option.id)
                )
                .map((option) => {
                  const current = editLegacyCoupons.find(
                    (item) => item.couponId === option.id
                  );

                  return (
                    <div key={option.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {option.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {Number((option.discountRate * 10).toFixed(2))} 折
                          {!option.isActive ? "・已停用" : ""}
                        </p>
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <span>張數</span>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          step={1}
                          disabled={isSavingEdit}
                          value={current?.quantity ?? 0}
                          onChange={(event) => {
                            const value = Number(event.target.value);

                            setEditLegacyCoupons((previous) => {
                              const remaining = previous.filter(
                                (item) => item.couponId !== option.id
                              );

                              return value > 0
                                ? [...remaining, {
                                    couponId: option.id,
                                    quantity: value,
                                    ...(current?.expiresOn !== undefined ? { expiresOn: current.expiresOn } : {}),
                                    ...(current?.expiresOnByIndex ? { expiresOnByIndex: Array.from({ length: value }, (_, i) => i < current.expiresOnByIndex!.length ? current.expiresOnByIndex![i] : current.expiresOn ?? "") } : {}),
                                  }]
                                : remaining;
                            });
                          }}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-center"
                        />
                      </label>
                    </div>
                  );
                })}

              {couponOptions.length === 0 && (
                <p className="text-sm text-slate-500">
                  尚未建立優惠券種類，請先至優惠券管理新增。
                </p>
              )}

              {editLegacyCoupons.some(
                (item) => !couponOptions.some(
                  (option) => option.id === item.couponId
                )
              ) && (
                <p className="text-sm text-red-600">
                  此會員含有找不到對應設定的優惠券，請先確認資料。
                </p>
              )}
            </div>
          )}
        </div>

        {editMessage && <p className="mt-5 text-sm text-red-600">{editMessage}</p>}
        <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setEditingMember(null)} disabled={isSavingEdit} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700">取消</button><button type="button" onClick={saveEdit} disabled={isSavingEdit} className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white disabled:opacity-50">{isSavingEdit ? "儲存中……" : "儲存修改"}</button></div>
      </div></div>}

      {deletingMember && <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-900/60 px-4"><div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"><h3 className="text-xl font-bold text-slate-900">刪除待認領舊會員？</h3><p className="mt-3 text-sm leading-6 text-slate-600">即將刪除「{deletingMember.name}」的舊會員資料。只有尚未認領的資料可以刪除，此操作無法復原。</p><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setDeletingMember(null)} disabled={isDeleting} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700">取消</button><button type="button" onClick={confirmDelete} disabled={isDeleting} className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{isDeleting ? "刪除中……" : "確認刪除"}</button></div></div></div>}

      {showBatch && <div className="fixed inset-0 z-[320] flex items-center justify-center overflow-y-auto bg-slate-900/60 px-4 py-8"><div className="w-full max-w-3xl rounded-3xl bg-white p-7 shadow-2xl md:p-9"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">Batch Import</p><h3 className="mt-2 text-2xl font-bold text-slate-900">批次新增舊會員</h3></div><button type="button" onClick={() => setShowBatch(false)} disabled={isBatchSaving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">關閉</button></div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600"><p className="font-semibold text-slate-800">每行一位，欄位用 Tab 或逗號分隔：</p><p>姓名, 手機, 生日, 課程點數, 紅利點數, 歷史上課堂數, 剩餘優惠券</p><p className="mt-2 font-mono text-xs">王小美,0912345678,1995/08/20,10,2,35,紅利 8 折券*2|生日 7 折優惠券*1</p><p className="font-mono text-xs">陳小華　0987654321　1992-03-05　5　0</p><p className="mt-2 text-xs">生日接受 YYYY/MM/DD、YYYY-MM-DD；紅利點數及歷史上課堂數可省略，預設 0。歷史上課堂數請填入好手會員報表的「來店次數」。</p></div>
        <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} rows={12} placeholder="在這裡貼上舊系統會員資料……" className="mt-5 w-full rounded-2xl border border-slate-300 px-4 py-3 font-mono text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"/>
        {batchMessage && <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{batchMessage}</pre>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
  <button type="button" onClick={() => setShowBatch(false)} disabled={isBatchSaving} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700">取消</button>
  <button type="button" onClick={previewBatch} disabled={isBatchSaving} className="rounded-xl border border-violet-300 px-5 py-3 font-semibold text-violet-700 disabled:opacity-50">{isBatchSaving ? "處理中……" : "預覽資料"}</button>
  {batchPreview && (
    <button type="button" onClick={confirmBatch} disabled={isBatchSaving || !batchPreview.importable} className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white disabled:opacity-50">{isBatchSaving ? "匯入中……" : `確認匯入 ${batchPreview.importable ?? 0} 筆`}</button>
  )}
</div>
      </div></div>}
    </section>
  );
}

function Field({ label, value, setValue, type = "text", hideLabel = false }: { label: string; value: string; setValue: (value: string) => void; type?: string; hideLabel?: boolean }) {
  return <div>{!hideLabel && <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>}<input type={type} min={type === "number" ? 0 : undefined} placeholder={hideLabel ? label : undefined} value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"/></div>;
}
