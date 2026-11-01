import { FieldValue, type Firestore, type Transaction, type DocumentReference, type DocumentSnapshot } from "firebase-admin/firestore";
import { parseLegacyCoupons } from "@/lib/legacyCouponTransfer";
import { couponTemplateFields } from "@/lib/couponTemplate";

import { legacyCouponValidity, couponIsUsable } from "@/lib/couponValidity";

export type LegacyCouponReport = {
  legacyMemberId: string; name: string; userId: string | null;
  expected: number; existing: number; available: number; missing: number;
  status: "no_coupons" | "unclaimed" | "complete" | "missing" | "needs_review";
  detail: string;
};

// Read phase shared by the audit and repair. Never changes used or reserved coupons.
export async function planLegacyCouponReconciliation(tx: Transaction, db: Firestore, legacyMemberId: string, legacySnapshot?: DocumentSnapshot) {
  const legacyRef = db.collection("legacyMembers").doc(legacyMemberId);
  const snapshot = legacySnapshot ?? await tx.get(legacyRef);
  if (!snapshot.exists) throw Error("找不到舊會員資料。");
  const legacy = snapshot.data()!;
  const report: LegacyCouponReport = { legacyMemberId, name: String(legacy.name ?? "未填姓名"), userId: null,
    expected: 0, existing: 0, available: 0, missing: 0, status: "needs_review", detail: "" };
  const items: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [];
  const stop = (status: LegacyCouponReport["status"], detail: string) => {
    report.status = status; report.detail = detail;
    return { report, write: (_adminId: string) => 0 };
  };
  let coupons;
  try { coupons = parseLegacyCoupons(legacy.coupons); }
  catch { return stop("needs_review", "匯入的優惠券欄位格式異常，請先核對原始資料。"); }
  report.expected = coupons.reduce((sum, item) => sum + item.quantity, 0);
  if (!report.expected) return stop("no_coupons", "這筆舊會員資料未記錄優惠券，需與原始匯入檔核對。");
  if (legacy.status === "unclaimed" && !legacy.claimedBy) return stop("unclaimed", "優惠券仍保留在舊資料，待完成會員認領後移轉。");
  const uid = legacy.claimedBy;
  if (legacy.status !== "claimed" || typeof uid !== "string" || !uid || uid.includes("/")) {
    return stop("needs_review", "認領狀態與綁定會員不一致，不自動補發。");
  }
  report.userId = uid;
  const member = await tx.get(db.collection("users").doc(uid));
  if (!member.exists || member.data()?.role !== "student" || member.data()?.legacyMemberId !== legacyMemberId) {
    return stop("needs_review", "會員帳號與舊資料沒有雙向對應，不自動補發。");
  }
  const [owned, linked] = await Promise.all([
    tx.get(db.collection("userCoupons").where("userId", "==", uid)),
    tx.get(db.collection("userCoupons").where("legacyMemberId", "==", legacyMemberId)),
  ]);
  const expectedIds = new Set(coupons.flatMap(coupon => Array.from({ length: coupon.quantity }, (_, i) =>
    `legacy_${legacyMemberId}_${coupon.couponId}_${i + 1}`)));
  const couponIds = new Set(coupons.map(coupon => coupon.couponId));
  const existingSnapshots = new Map([...owned.docs, ...linked.docs].map(doc => [doc.id, doc]));
  for (const doc of existingSnapshots.values()) {
    const data = doc.data();
    const legacySource = String(data.source ?? "").startsWith("legacy") || doc.id.startsWith("legacy_");
    if ((data.legacyMemberId === legacyMemberId || (legacySource && couponIds.has(data.couponId))) &&
        (!expectedIds.has(doc.id) || data.userId !== uid)) {
      return stop("needs_review", "找到非標準編號或不同歸屬的舊優惠券，請人工核對，避免重複補發。");
    }
  }
  for (const coupon of coupons) {
    let template: DocumentSnapshot | undefined;
    for (let i = 1; i <= coupon.quantity; i++) {
      const ref = db.collection("userCoupons").doc(`legacy_${legacyMemberId}_${coupon.couponId}_${i}`);
      const current = existingSnapshots.get(ref.id) ?? await tx.get(ref);
      if (current.exists) {
        const data = current.data()!;
        if (data.userId !== uid || data.couponId !== coupon.couponId || data.legacyMemberId !== legacyMemberId ||
            !["available", "used", "reserved", "expired", "cancelled", "locked"].includes(String(data.status))) {
          return stop("needs_review", "既有移轉券的歸屬或狀態異常，不自動補發。");
        }
        report.existing++;
        if (couponIsUsable(data)) report.available++;
        continue;
      }
      template ??= await tx.get(db.collection("coupons").doc(coupon.couponId));
      let fields;
      try { if (!template.exists) throw Error(); fields = couponTemplateFields(template.data()!); }
      catch { return stop("needs_review", "缺少可核對的優惠券商品或折扣設定，請先確認。"); }
      items.push({ ref, data: { userId: uid, couponId: coupon.couponId, ...fields, ...legacyCouponValidity(coupon, i),
        status: "available", rewardCost: 0, source: "legacy_claim", legacyMemberId,
        issuedAt: FieldValue.serverTimestamp(), usedAt: null, purchaseRequestId: null } });
    }
  }
  report.missing = items.length;
  if (!items.length) return stop("complete", "所有匯入券都有移轉紀錄；已使用或鎖定的券不會重新發放。");
  report.status = "missing";
  report.detail = `已認領但缺少 ${items.length} 張移轉券，可補發缺少項目；不更動點數。`;
  return {
    report,
    write(adminId: string) {
      for (const item of items) tx.create(item.ref, { ...item.data, repairedBy: adminId, repairedAt: FieldValue.serverTimestamp() });
      tx.update(legacyRef, { couponsTransferred: report.expected, couponsTransferredAt: FieldValue.serverTimestamp() });
      const logRef = db.collection("legacyCouponRepairLogs").doc();
      tx.create(logRef, { adminId, legacyMemberId, userId: uid, count: items.length,
        couponIds: items.map(item => item.ref.id), createdAt: FieldValue.serverTimestamp() });
      tx.create(db.collection("notifications").doc(`legacy_coupon_repair_${logRef.id}`), {
        userId: uid, type: "coupon_gift", title: "舊會員優惠券移轉完成",
        body: `已補齊舊會員優惠券 ${items.length} 張，請至購買課卡頁面查看。`,
        isRead: false, createdAt: FieldValue.serverTimestamp(),
      });
      return items.length;
    },
  };
}
