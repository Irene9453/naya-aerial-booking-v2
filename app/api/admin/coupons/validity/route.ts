import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { couponApiUser, couponApiFailure, CouponApiError, safeCouponId } from "@/lib/couponApiAuth";
import { issueCouponValidity, legacyCouponValidity } from "@/lib/couponValidity";
import { parseLegacyCoupons } from "@/lib/legacyCouponTransfer";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const adminId = await couponApiUser(request, true);
    let body; try { body = await request.json(); } catch { throw new CouponApiError("資料格式錯誤。"); }
    if (!body || !["list", "set"].includes(body.action)) throw new CouponApiError("請指定查詢或期限設定。");
    if (body.action === "list") {
      if (!safeCouponId(body.targetId) || !["user", "legacy"].includes(body.kind)) throw new CouponApiError("請選擇會員。");
      if (body.kind === "user") {
        const coupons = await adminDb.collection("userCoupons").where("userId", "==", body.targetId).get();
        return NextResponse.json({ items: coupons.docs.map(doc => ({ ...doc.data(), kind: "issued", id: doc.id })) });
      }
      const legacy = await adminDb.collection("legacyMembers").doc(body.targetId).get();
      if (!legacy.exists) throw new CouponApiError("找不到舊會員資料。");
      const entries = parseLegacyCoupons(legacy.data()?.coupons);
      const issued = await adminDb.collection("userCoupons").where("legacyMemberId", "==", body.targetId).get();
      const byId = new Map(issued.docs.map(doc => [doc.id, doc.data()]));
      const items = [];
      for (const entry of entries) {
        const template = await adminDb.collection("coupons").doc(entry.couponId).get();
        for (let index = 1; index <= entry.quantity; index++) {
          const id = `legacy_${body.targetId}_${entry.couponId}_${index}`;
          items.push({ name: String(template.data()?.name ?? entry.couponId), ...legacyCouponValidity(entry, index), ...byId.get(id),
            kind: "legacy", id, legacyMemberId: body.targetId, couponId: entry.couponId, index, status: byId.get(id)?.status ?? "待移轉" });
        }
      }
      return NextResponse.json({ items });
    }
    if (!["unlimited", "date", "unknown"].includes(body.expiryMode) || typeof body.reason !== "string" || body.reason.trim().length < 2 || body.reason.length > 500) throw new CouponApiError("請設定期限並填寫 2～500 字原因。");
    let validity;
    try { validity = issueCouponValidity({ expiryMode: body.expiryMode, expiryDate: body.expiresOn }, Date.now(), true); }
    catch (error) { throw new CouponApiError((error as Error).message); }
    await adminDb.runTransaction(async tx => {
      const admin = await tx.get(adminDb.collection("users").doc(adminId));
      if (admin.data()?.role !== "admin") throw new CouponApiError("管理員權限已變更。", 403);
      if (!safeCouponId(body.id) || !["issued", "legacy"].includes(body.kind)) throw new CouponApiError("優惠券編號不正確。");
      const issuedRef = adminDb.collection("userCoupons").doc(body.id);
      const issued = await tx.get(issuedRef);
      if (body.kind === "issued" && !issued.exists) throw new CouponApiError("找不到優惠券。");
      if (issued.data()?.status === "reserved") throw new CouponApiError("這張券已保留給待核款訂單，不能改動期限；請先處理原訂單。");
      const legacyId = body.kind === "legacy" ? body.legacyMemberId : issued.data()?.legacyMemberId;
      let legacyRef, updatedCoupons;
      let previousLegacyExpiry: string | null = null;
      if (legacyId !== undefined) {
        if (!safeCouponId(legacyId)) throw new CouponApiError("舊會員編號不正確。");
        legacyRef = adminDb.collection("legacyMembers").doc(legacyId);
        const legacy = await tx.get(legacyRef);
        if (!legacy.exists) throw new CouponApiError("找不到原始舊會員資料。");
        const entries = parseLegacyCoupons(legacy.data()?.coupons);
        let found = false;
        updatedCoupons = entries.map(entry => {
          const index = Array.from({ length: entry.quantity }, (_, i) => i + 1).find(i => body.id === `legacy_${legacyId}_${entry.couponId}_${i}`);
          if (index === undefined) return entry;
          found = true;
          previousLegacyExpiry = entry.expiresOnByIndex ? entry.expiresOnByIndex[index - 1] : entry.expiresOn === undefined ? "unknown" : entry.expiresOn;
          const dates = entry.expiresOnByIndex ? [...entry.expiresOnByIndex] : Array(entry.quantity).fill(entry.expiresOn === undefined ? "" : entry.expiresOn);
          dates[index - 1] = validity.expiryMode === "unlimited" ? null : validity.expiryMode === "unknown" ? "" : validity.expiresOn;
          return { ...entry, expiresOnByIndex: dates };
        });
        if (!found || (issued.exists && issued.data()?.userId !== legacy.data()?.claimedBy)) throw new CouponApiError("優惠券與舊會員原始資料不一致，請先核對。");
      } else if (body.kind === "legacy") throw new CouponApiError("缺少舊會員資料。");
      const now = Date.now();
      if (legacyRef && updatedCoupons) tx.update(legacyRef, { coupons: updatedCoupons });
      if (issued.exists) {
        const priorStatus = issued.data()?.status;
        const status = ["available", "expired"].includes(priorStatus) ? validity.expiresAtMillis !== null && validity.expiresAtMillis <= now ? "expired" : "available" : priorStatus;
        tx.update(issuedRef, { ...validity, status, expiryUpdatedBy: adminId, expiryUpdatedAt: FieldValue.serverTimestamp() });
      }
      tx.create(adminDb.collection("couponExpiryLogs").doc(), { couponRecordId: body.id, legacyMemberId: legacyId ?? null, adminId,
        previousLegacyExpiry, previousMode: issued.data()?.expiryMode ?? null, previousExpiresAtMillis: issued.data()?.expiresAtMillis ?? null,
        ...validity, reason: body.reason.trim(), createdAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ success: true });
  } catch (error) { return couponApiFailure(error); }
}
