"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getTrialClassKind } from "@/lib/trialVoucherBooking";

export type TrialVoucherOption = { id: string; kind: "yoga" | "aerial" };

type Props = {
  userId: string;
  courseName: string;
  courseCategory?: string;
  value: string | null;
  onChange: (voucherId: string | null) => void;
  disabled?: boolean;
};

export default function TrialVoucherChoice({ userId, courseName, courseCategory, value, onChange, disabled = false }: Props) {
  const [vouchers, setVouchers] = useState<TrialVoucherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const kind = courseCategory === "special" ? null : getTrialClassKind(courseName);

  useEffect(() => {
    if (!userId || !kind) {
      setVouchers([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const q = query(collection(db, "trialVouchers"), where("userId", "==", userId));
    // Do not put arbitrary userId in a public URL. Firestore rules must enforce owner-only reads.
    return onSnapshot(q, (snap) => {
      const options = snap.docs.filter((doc) => {
        const data = doc.data();
        return data.userId === userId && data.kind === kind && data.status === "available" && data.quantity === 1;
      }).map((doc) => ({ id: doc.id, kind })) as TrialVoucherOption[];
      setVouchers(options);
      setLoading(false);
      setFailed(false);
    }, () => {
      setVouchers([]);
      setLoading(false);
      setFailed(true);
    });
  }, [userId, kind]);

  // If voucher becomes invalid, parent should clear the selection; the backend always rechecks.
  useEffect(() => {
    if (value && !loading && !vouchers.some((v) => v.id === value)) onChange(null);
  }, [value, loading, vouchers, onChange]);

  if (!kind || loading) return null;
  if (failed) return (
    <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      無法讀取體驗券，請重新整理後再試；若持續發生，請聯繫老師，勿直接改用一般點數預約。
    </p>
  );
  if (vouchers.length === 0) return null;
  return (
    <fieldset className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-slate-800">預約扣款方式</legend>
      <label className="flex items-center gap-2 py-1 text-sm text-slate-800">
        <input type="radio" name={`trial-voucher-${userId}-${courseName}`} checked={value === null} onChange={() => onChange(null)} />
        使用一般點數
      </label>
      {vouchers.map((voucher) => (
        <label key={voucher.id} className="flex items-center gap-2 py-1 text-sm text-slate-800">
          <input type="radio" name={`trial-voucher-${userId}-${courseName}`} checked={value === voucher.id} onChange={() => onChange(voucher.id)} />
          使用{voucher.kind === "yoga" ? "空瑜" : "舞綢／空環"}體驗券（1 張）
        </label>
      ))}
    </fieldset>
  );
}
