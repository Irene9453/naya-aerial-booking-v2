"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { AERIAL_MILESTONES } from "@/lib/aerialJourney";

type StudentJourneyModalProps = {
  student: { id: string; name: string; journeyLegacyClasses?: number };
  onClose: () => void;
};

type JourneySummary = {
  success: boolean;
  userId: string;
  legacyClasses: number;
  systemClasses: number;
  completedClasses: number;
};

export default function StudentJourneyModal({ student, onClose }: StudentJourneyModalProps) {
  const [legacyClasses, setLegacyClasses] = useState(String(student.journeyLegacyClasses ?? 0));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [summary, setSummary] = useState<JourneySummary | null>(null);

  const loadSummary = useCallback(async (): Promise<JourneySummary> => {
    const user = auth.currentUser;
    if (!user) throw new Error("請先登入管理員帳號。");
    const token = await user.getIdToken();
    const response = await fetch(
      `/api/admin/journey/summary?userId=${encodeURIComponent(student.id)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error ?? "無法取得空中旅程資料。");
    }
    return result as JourneySummary;
  }, [student.id]);

 useEffect(() => {
  let cancelled = false;
    void loadSummary()
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setLegacyClasses(String(data.legacyClasses));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "讀取空中旅程資料失敗。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadSummary]);

  async function handleSave() {
    if (saving || success || loading || !summary) return;
    const value = Number(legacyClasses);
    if (legacyClasses.trim() === "" || !Number.isSafeInteger(value) || value < 0 || value > 100000) {
      setMessage("請輸入 0～100000 的整數堂數。");
      return;
    }
    if (!reason.trim()) {
      setMessage("請填寫補登或修改原因。");
      return;
    }
    if (reason.trim().length > 500) {
      setMessage("補登原因不能超過 500 字。");
      return;
    }
    if (!window.confirm(`確定將 ${student.name} 的歷史補登堂數設定為 ${value} 堂嗎？\n\n請確認這些堂數沒有包含系統已記錄的出席課程。`)) return;

    setSaving(true);
    setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("請先登入管理員帳號。");
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/journey/legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: student.id, legacyClasses: value, reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error ?? "更新歷史堂數失敗。");
      setSuccess(true);
      setMessage("歷史堂數已儲存成功，正在更新統計……");
      try {
        const updated = await loadSummary();
        setSummary(updated);
        setLegacyClasses(String(updated.legacyClasses));
        setMessage("歷史堂數已更新，累積堂數與徽章已重新計算！");
      } catch {
        setMessage("歷史堂數已儲存，但統計讀取失敗。請關閉後重新開啟確認。");
      }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  const completedClasses = summary?.completedClasses ?? 0;
  const unlockedMilestones = AERIAL_MILESTONES.filter((milestone) => completedClasses >= milestone.classes);
  const nextMilestone = AERIAL_MILESTONES.find((milestone) => completedClasses < milestone.classes);
  const previousThreshold = unlockedMilestones.length > 0
    ? unlockedMilestones[unlockedMilestones.length - 1].classes : 0;
  const progress = nextMilestone
    ? Math.min(100, Math.max(0, ((completedClasses - previousThreshold) /
        (nextMilestone.classes - previousThreshold)) * 100)) : 100;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">MY AERIAL JOURNEY</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">{student.name || "學生"}的空中旅程</h2>

        {loading ? (
          <p className="mt-8 text-center text-slate-500">正在讀取空中旅程資料……</p>
        ) : summary ? (
          <>
            <div className="mt-6 rounded-2xl bg-gradient-to-br from-sky-50 to-white p-5 ring-1 ring-sky-100">
              <p className="text-sm font-semibold text-sky-700">累積完成堂數</p>
              <p className="mt-2 text-4xl font-bold text-slate-900">
                {completedClasses}<span className="ml-2 text-base font-normal text-slate-500">堂</span>
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white p-4">
                  <p className="text-xs text-slate-500">歷史補登</p>
                  <p className="mt-1 text-xl font-bold text-slate-800">{summary.legacyClasses} 堂</p>
                </div>
                <div className="rounded-xl bg-white p-4">
                  <p className="text-xs text-slate-500">系統實際出席</p>
                  <p className="mt-1 text-xl font-bold text-slate-800">{summary.systemClasses} 堂</p>
                </div>
              </div>
              {nextMilestone ? (
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-700">下一站：{nextMilestone.emoji} {nextMilestone.name}</span>
                    <span className="text-slate-500">還差 {nextMilestone.classes - completedClasses} 堂</span>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-sky-100">
                    <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm font-semibold text-sky-700">🌌 已解鎖全部里程碑！你的空中旅程仍會繼續累積。</p>
              )}
            </div>
            <div className="mt-7">
              <h3 className="text-lg font-bold text-slate-900">我的里程碑徽章</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {AERIAL_MILESTONES.map((milestone) => {
                  const unlocked = completedClasses >= milestone.classes;
                  return (
                    <div key={milestone.classes} className={`rounded-2xl border p-4 text-center ${unlocked ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50 opacity-60"}`}>
                      <div className="text-3xl">{unlocked ? milestone.emoji : "🔒"}</div>
                      <p className="mt-2 text-sm font-bold text-slate-800">{milestone.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{milestone.classes} 堂</p>
                      {milestone.certificate && <p className="mt-2 text-xs font-semibold text-violet-600">🎓 證書</p>}
                      {milestone.reward === "gift" && <p className="mt-1 text-xs font-semibold text-rose-600">🎁 精美小贈品</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        <div className="mt-8 border-t border-slate-200 pt-6">
          <h3 className="text-lg font-bold text-slate-900">歷史堂數補登</h3>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            只填寫尚未記錄在目前預約系統中的實際完成堂數。已經有點名「已到」的課程會由系統自動計算，請不要重複補登。
          </p>
          <div className="mt-5">
            <label htmlFor="journey-legacy" className="mb-2 block text-sm font-semibold text-slate-700">歷史補登堂數</label>
            <input id="journey-legacy" type="number" min={0} max={100000} step={1} value={legacyClasses}
              onChange={(event) => setLegacyClasses(event.target.value)} disabled={saving || success || loading || !summary}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 disabled:bg-slate-100" />
            <p className="mt-2 text-xs text-slate-500">此欄為補登後的歷史堂數總額，不是本次新增堂數。</p>
          </div>
          <div className="mt-5">
            <label htmlFor="journey-reason" className="mb-2 block text-sm font-semibold text-slate-700">補登／修改原因</label>
            <textarea id="journey-reason" value={reason} onChange={(event) => setReason(event.target.value)}
              disabled={saving || success || loading || !summary} maxLength={500} rows={3}
              placeholder="例如：依舊系統上課紀錄補登"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500 disabled:bg-slate-100" />
          </div>
        </div>
        {message && (
          <p className={`mt-5 rounded-xl px-4 py-3 text-sm ${success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{message}</p>
        )}
        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-50">
            {success ? "完成" : "取消"}
          </button>
          {!success && (
            <button type="button" onClick={handleSave} disabled={saving || loading || !summary}
              className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
              {saving ? "儲存中……" : "儲存歷史堂數"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
