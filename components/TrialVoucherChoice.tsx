"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type TrialVoucherOption = { id: string; kind: "yoga" | "aerial" };

type Props = {
  userId: string;
  courseName: string;
  value: string | null;
  onChange: (voucherId: string | null) => void;
  disabled?: boolean;
};

function eligibleKind(courseName: string): "yoga" | "aerial" | null {
  const name = courseName.trim();
  // Deliberately fail closed on ambiguous class names.
  if (/舞綢|空環/.test(name)) return "aerial";
  if (/空中瑜[伽珈]|空瑜|低空/.test(name)) return "yoga";
  return null;
}

export default function TrialVoucherChoice({ userId, courseName, value, onChange, disabled = false }: Props) {
  const [vouchers, setVouchers] = useState<TrialVoucherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const kind = eligibleKind(courseName);

  useEffect(() => {
    if (!userId || !kind) return;
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

  if (!kind || loading || failed || vouchers.length === 0) return null;
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
