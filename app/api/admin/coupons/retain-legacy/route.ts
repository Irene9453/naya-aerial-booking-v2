import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { couponApiUser, couponApiFailure, CouponApiError, safeCouponId } from "@/lib/couponApiAuth";
import { couponDeadline } from "@/lib/couponValidity";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const adminId = await couponApiUser(request, true);
    let body; try { body = await request.json(); } catch { throw new CouponApiError("資料格式錯誤。"); }
    if (!body || !safeCouponId(body.requestId) || typeof body.evidence !== "string" || body.evidence.trim().length < 10 || body.evidence.length > 500) throw new CouponApiError("請填寫 10～500 字的舊申請核對依據。");
    await adminDb.runTransaction(async tx => {
      const orderRef = adminDb.collection("purchaseRequests").doc(body.requestId);
      const [admin, orderSnap, sale] = await Promise.all([tx.get(adminDb.collection("users").doc(adminId)), tx.get(orderRef), tx.get(adminDb.collection("packageSales").doc(`request_${body.requestId}`))]);
      if (admin.data()?.role !== "admin") throw new CouponApiError("管理員權限已變更。", 403);
      const order = orderSnap.data();
      if (!order || order.status !== "pending" || order.paymentStatus !== "unpaid" || sale.exists || order.offerType === "reserved_coupon" || !["birthday", "user_coupon"].includes(order.couponSource) || !safeCouponId(order.userId) || !safeCouponId(order.packageId)) throw new CouponApiError("這筆不是可核對的舊待核款優惠申請。");
      const created = order.createdAt;
      const rawSubmitted = typeof created?.toMillis === "function" ? created.toMillis() : typeof created?.seconds === "number" ? created.seconds * 1000 + Math.floor(Number(created.nanoseconds ?? 0) / 1000000) : NaN;
      const submitted = Math.floor(rawSubmitted);
      if (!Number.isSafeInteger(submitted) || submitted <= 0 || submitted > Date.now()) throw new CouponApiError("舊申請缺少可信時間，不能自動保留優惠。");
      const [member, product] = await Promise.all([tx.get(adminDb.collection("users").doc(order.userId)), tx.get(adminDb.collection("packages").doc(order.packageId))]);
      if (!member.exists || !product.exists || product.data()?.points !== order.packagePoints || product.data()?.price !== order.originalPrice) throw new CouponApiError("會員或商品資料已變更，請先人工核對。");
      const birthday = order.couponSource === "birthday";
      const localDate = new Date(submitted + 8 * 3600000), year = localDate.getUTCFullYear(), month = localDate.getUTCMonth() + 1;
      const couponId = birthday ? `birthday_${order.userId}_${year}` : order.couponId;
      if (!safeCouponId(couponId)) throw new CouponApiError("缺少優惠券資料。");
      const couponRef = adminDb.collection("userCoupons").doc(couponId);
      const couponSnap = await tx.get(couponRef);
      let coupon = couponSnap.data();
      const usageRef = birthday ? adminDb.collection("birthdayCouponUsage").doc(`${order.userId}_${year}`) : null;
      const usage = usageRef ? await tx.get(usageRef) : null;
      if (birthday) {
        if (Number(member.data()?.birthdayMonth) !== month || (usage?.exists && usage.data()?.status !== "released")) throw new CouponApiError("生日月份或本年度使用紀錄不符。");
        if (!coupon) { const deadline = Date.UTC(year, month, 1) - 8 * 3600000; coupon = { userId: order.userId, name: "生日 7 折優惠", type: "birthday", discountRate: 0.7, source: "automatic_birthday", birthdayYear: year,
          status: "available", expiryMode: "date", expiresAtMillis: deadline, expiresOn: new Date(deadline - 1 + 8 * 3600000).toISOString().slice(0, 10), minimumPackagePoints: 0, maximumPackagePoints: null }; }
      }
      const deadline = coupon ? couponDeadline(coupon) : undefined;
      if (!coupon || coupon.userId !== order.userId || !["available", "expired"].includes(coupon.status) || deadline === undefined || (deadline !== null && submitted >= deadline) ||
          typeof coupon.discountRate !== "number" || coupon.discountRate <= 0 || coupon.discountRate > 1 || order.discountValue !== coupon.discountRate ||
          !Number.isSafeInteger(order.originalPrice) || order.originalPrice < 0 || !Number.isSafeInteger(order.packagePoints) || order.packagePoints <= 0 ||
          order.packagePoints < Number(coupon.minimumPackagePoints ?? 0) || (coupon.maximumPackagePoints != null && order.packagePoints > Number(coupon.maximumPackagePoints)) ||
          order.discountAmount !== Math.round(order.originalPrice * (1 - coupon.discountRate)) || order.finalPrice !== order.originalPrice - order.discountAmount) throw new CouponApiError("舊申請時間、期限或折扣資料不符，不能保留優惠。");
      if (couponSnap.exists) tx.update(couponRef, { status: "reserved", purchaseRequestId: body.requestId, reservedAtMillis: submitted });
      else tx.create(couponRef, { ...coupon, status: "reserved", purchaseRequestId: body.requestId, reservedAtMillis: submitted, issuedAt: FieldValue.serverTimestamp() });
      if (usageRef) tx.set(usageRef, { userId: order.userId, year, status: "reserved", requestId: body.requestId, reservedAtMillis: submitted });
      tx.update(orderRef, { offerType: "reserved_coupon", couponId, couponExpiresAtMillis: deadline ?? null, couponReservedAtMillis: submitted,
        retainedBy: adminId, retentionEvidence: body.evidence.trim(), retainedAt: FieldValue.serverTimestamp() });
      tx.create(adminDb.collection("couponRetentionLogs").doc(), { requestId: body.requestId, adminId, submittedAtMillis: submitted, evidence: body.evidence.trim(), createdAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ success: true });
  } catch (error) { return couponApiFailure(error); }
}
