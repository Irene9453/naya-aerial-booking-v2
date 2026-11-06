"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

type TrialKind = "yoga" | "aerial";
type VoucherState = "loading" | "available" | "unavailable" | "error";
const TRIALS: { kind: TrialKind; offerId: string; label: string }[] = [
  { kind: "yoga", offerId: "trial_yoga", label: "空瑜體驗券" },
  { kind: "aerial", offerId: "trial_aerial", label: "舞綢／空環體驗券" },
];

/** Reads the same deterministic, owner-protected documents as TrialVoucherChoice. */
export default function MemberTrialVouchers({ userId, issuedOffers }: { userId: string; issuedOffers: { trial_yoga?: boolean; trial_aerial?: boolean } }) {
  const [states, setStates] = useState<Record<TrialKind, VoucherState>>({
    yoga: "loading",
    aerial: "loading",
  });

  const yogaIssued = issuedOffers.trial_yoga === true;
  const aerialIssued = issuedOffers.trial_aerial === true;

  useEffect(() => {
    if (!userId) return;
    // Missing documents cannot pass owner-only Firestore get rules. Only read issued offers.
    setStates({ yoga: yogaIssued ? "loading" : "unavailable", aerial: aerialIssued ? "loading" : "unavailable" });

    const unsubscribers = TRIALS.filter(({ kind }) => kind === "yoga" ? yogaIssued : aerialIssued).map(({ kind, offerId }) => {
      const voucherId = `new_student_${userId}_${offerId}`;
      return onSnapshot(
        doc(db, "trialVouchers", voucherId),
        (snapshot) => {
          const data = snapshot.data();
          const available =
            snapshot.exists() &&
            data?.userId === userId &&
            data.offerId === offerId &&
            data.kind === kind &&
            data.status === "available" &&
            data.quantity === 1 &&
            data.bookingId == null;
          setStates((old) => ({ ...old, [kind]: available ? "available" : "unavailable" }));
        },
        () => setStates((old) => ({ ...old, [kind]: "error" }))
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [userId, yogaIssued, aerialIssued]);

  const loading = TRIALS.some(({ kind }) => states[kind] === "loading");
  const failed = TRIALS.some(({ kind }) => states[kind] === "error");
  const available = TRIALS.filter(({ kind }) => (kind === "yoga" ? yogaIssued : aerialIssued) && states[kind] === "available");

  // Never reserve a permanent voucher area in the member card.
  // Show the area only for usable vouchers, or a real read error that needs attention.
  if ((!yogaIssued && !aerialIssued) || loading || (!failed && available.length === 0)) return null;

  return (
    <div className="mt-5 border-t border-sky-100 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">我的體驗券</p>
        {!failed && (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
            可使用 {available.length} 張
          </span>
        )}
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-amber-700">部分體驗券無法讀取，請重新整理後再試。</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {available.map(({ kind, label }) => (
            <li key={kind} className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{label}</span>
              <span className="font-semibold text-violet-700">1 張</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs leading-5 text-slate-500">體驗券可用於符合資格的課程，預約時選擇使用，不扣一般點數。</p>
    </div>
  );
}
