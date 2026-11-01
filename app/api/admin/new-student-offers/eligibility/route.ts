import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { couponApiUser, couponApiFailure, CouponApiError, safeCouponId } from "@/lib/couponApiAuth";
import { readNewStudentEligibility } from "@/lib/newStudentEligibility";
import { normalizeEligibilityPhone } from "@/lib/newStudentEligibilityPolicy";
import { NEW_STUDENT_OFFERS } from "@/lib/newStudentOffers";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const adminId = await couponApiUser(request, true);
    let body; try { body = await request.json(); } catch { throw new CouponApiError("資料格式錯誤。"); }
    if (!body || !safeCouponId(body.legacyMemberId)) throw new CouponApiError("請選擇舊會員資料。");
    const result = await adminDb.runTransaction(async tx => {
      const [admin, legacy] = await Promise.all([tx.get(adminDb.collection("users").doc(adminId)), tx.get(adminDb.collection("legacyMembers").doc(body.legacyMemberId))]);
      if (admin.data()?.role !== "admin") throw new CouponApiError("管理員權限已變更。", 403);
      if (!legacy.exists) throw new CouponApiError("找不到舊會員資料。", 404);
      const phone = normalizeEligibilityPhone(legacy.data()?.phoneNormalized ?? legacy.data()?.phone);
      const registry = phone ? await tx.get(adminDb.collection("phoneRegistry").doc(phone)) : null;
      const uid = legacy.data()?.claimedBy || registry?.data()?.userId;
      if (!safeCouponId(uid)) return { status: "pending", reason: "member_account_unlinked", unavailableOfferIds: [] };
      const member = await tx.get(adminDb.collection("users").doc(uid));
      if (!member.exists) return { status: "pending", reason: "member_account_unlinked", unavailableOfferIds: [] };
      const eligibility = await readNewStudentEligibility(tx, uid, member.data()!);
      const orders = await tx.get(adminDb.collection("purchaseRequests").where("userId", "==", uid));
      const unavailable = new Set<string>();
      const purchases = member.data()?.newStudentOfferPurchases ?? {};
      for (const id of Object.keys(NEW_STUDENT_OFFERS)) if (purchases[id] === true) unavailable.add(id);
      for (const order of orders.docs) {
        const data = order.data();
        if (data.offerType === "new_student" && ["pending", "completed"].includes(data.status)) for (const id of data.offerIds ?? [data.offerId]) if (typeof id === "string") unavailable.add(id);
      }
      return { ...eligibility, userId: uid, unavailableOfferIds: [...unavailable] };
    });
    let emailVerified: boolean | null = null;
    if ("userId" in result) { try { emailVerified = (await adminAuth.getUser(result.userId)).emailVerified; } catch { emailVerified = false; } }
    return NextResponse.json({ ...result, emailVerified, purchasingEnabled: process.env.NAYA_NEW_STUDENT_APPROVAL_ENABLED === "true" });
  } catch (error) { return couponApiFailure(error); }
}
