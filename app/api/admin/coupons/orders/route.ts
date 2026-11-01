import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { couponApiUser, couponApiFailure, CouponApiError, safeCouponId } from "@/lib/couponApiAuth";
import { couponDeadline } from "@/lib/couponValidity";
import { paymentReceivedAt } from "@/lib/paymentReceivedAt";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const adminId = await couponApiUser(request, true);
    let input; try { input = await request.json(); } catch { throw new CouponApiError("資料格式錯誤。"); }
    if (!input || !safeCouponId(input.requestId) || !["approve", "reject", "update_payment"].includes(input.action)) throw new CouponApiError("訂單資料不正確。");
    const orderRef = adminDb.collection("purchaseRequests").doc(input.requestId);
    const result = await adminDb.runTransaction(async tx => {
      const [admin, orderSnap] = await Promise.all([tx.get(adminDb.collection("users").doc(adminId)), tx.get(orderRef)]);
      if (admin.data()?.role !== "admin") throw new CouponApiError("管理員權限已變更。", 403);
      const order = orderSnap.data();
      if (!order || order.offerType !== "reserved_coupon" || !safeCouponId(order.couponId) || !safeCouponId(order.userId)) throw new CouponApiError("找不到有效的保留優惠訂單。");
      if (order.status !== "pending" || order.paymentStatus !== "unpaid") throw new CouponApiError("此訂單已處理，請重新整理。");
      const couponRef = adminDb.collection("userCoupons").doc(order.couponId), memberRef = adminDb.collection("users").doc(order.userId);
      const saleRef = adminDb.collection("packageSales").doc(`request_${input.requestId}`);
      const [couponSnap, memberSnap, sale] = await Promise.all([tx.get(couponRef), tx.get(memberRef), tx.get(saleRef)]);
      const coupon = couponSnap.data(), member = memberSnap.data();
      if (sale.exists) throw new CouponApiError("已存在銷售紀錄，請先核對，避免重複處理。");
      if (!coupon || coupon.userId !== order.userId || coupon.status !== "reserved" || coupon.purchaseRequestId !== input.requestId) throw new CouponApiError("優惠券鎖定資料不一致，請人工核對。");
      const birthdayUsageRef = coupon.source === "automatic_birthday" ? adminDb.collection("birthdayCouponUsage").doc(`${order.userId}_${coupon.birthdayYear}`) : null;
      const birthdayUsage = birthdayUsageRef ? await tx.get(birthdayUsageRef) : null;
      if (birthdayUsageRef && (!birthdayUsage?.exists || birthdayUsage.data()?.requestId !== input.requestId || birthdayUsage.data()?.status !== "reserved")) throw new CouponApiError("生日優惠保留紀錄不一致。");
      if (input.action === "update_payment") {
        if (order.paymentMethod !== "transfer" || !/^\d{5}$/.test(input.transferLastFive ?? "") || typeof input.reason !== "string" || input.reason.trim().length < 2 || input.reason.length > 500) throw new CouponApiError("請輸入正確末五碼與更正原因。");
        tx.update(orderRef, { transferLastFive: input.transferLastFive, paymentCorrectedBy: adminId, paymentCorrectedAt: FieldValue.serverTimestamp() });
        tx.create(adminDb.collection("couponPaymentCorrections").doc(), { requestId: input.requestId, adminId, previousLastFive: order.transferLastFive ?? null,
          transferLastFive: input.transferLastFive, reason: input.reason.trim(), createdAt: FieldValue.serverTimestamp() });
        return { requestId: input.requestId, updated: true };
      }
      if (input.action === "reject") {
        const expires = couponDeadline(coupon);
        if (birthdayUsageRef) tx.update(birthdayUsageRef, { status: "released", requestId: null });
        tx.update(couponRef, { status: expires !== undefined && expires !== null && expires <= Date.now() ? "expired" : "available", purchaseRequestId: null, reservedAtMillis: null });
        tx.update(orderRef, { status: "rejected", rejectionReason: String(input.reason ?? "").slice(0, 500), reviewedBy: adminId, reviewedAt: FieldValue.serverTimestamp() });
        return { requestId: input.requestId, rejected: true };
      }
      if (!member || sale.exists || !Number.isSafeInteger(member.points) || member.points < 0 || !Number.isSafeInteger(order.packagePoints) || order.packagePoints <= 0 ||
          typeof order.discountValue !== "number" || order.discountValue <= 0 || order.discountValue > 1 || !Number.isSafeInteger(order.originalPrice) || order.originalPrice < 0 ||
          order.discountAmount !== Math.round(order.originalPrice * (1 - order.discountValue)) || order.finalPrice !== order.originalPrice - order.discountAmount ||
          !Number.isSafeInteger(order.couponReservedAtMillis) || order.couponReservedAtMillis !== coupon.reservedAtMillis ||
          (order.couponExpiresAtMillis !== null && (!Number.isSafeInteger(order.couponExpiresAtMillis) || order.couponReservedAtMillis >= order.couponExpiresAtMillis))) throw new CouponApiError("訂單價格或保留優惠資料不正確。");
      const newPointBalance = member.points + order.packagePoints;
      if (!Number.isSafeInteger(newPointBalance)) throw new CouponApiError("會員點數異常。");
      let receivedAt: number; try { receivedAt = paymentReceivedAt(input.paymentReceivedAtMillis); } catch (error) { throw new CouponApiError((error as Error).message); }
      if (birthdayUsageRef) tx.update(birthdayUsageRef, { status: "used", usedAt: FieldValue.serverTimestamp() });
      tx.update(memberRef, { points: newPointBalance, isNewStudent: false });
      tx.update(couponRef, { status: "used", usedAt: FieldValue.serverTimestamp() });
      tx.update(orderRef, { status: "completed", paymentStatus: "confirmed", paymentReceivedAtMillis: receivedAt, reviewedBy: adminId,
        reviewedAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp(), pointBalanceAfter: newPointBalance });
      tx.create(saleRef, { requestId: input.requestId, adminId, studentId: order.userId, packageId: order.packageId, packageName: order.packageName,
        points: order.packagePoints, originalPrice: order.originalPrice, discountAmount: order.discountAmount, price: order.finalPrice,
        couponId: order.couponId, couponName: order.couponName, couponSource: order.couponSource, paymentMethod: order.paymentMethod,
        transferLastFive: order.transferLastFive ?? null, paymentReceivedAtMillis: receivedAt, status: "completed", createdAt: FieldValue.serverTimestamp() });
      tx.create(adminDb.collection("pointTransactions").doc(`request_${input.requestId}`), { userId: order.userId, adminId, type: "package_purchase",
        amount: order.packagePoints, balanceAfter: newPointBalance, requestId: input.requestId, packageName: order.packageName, createdAt: FieldValue.serverTimestamp() });
      tx.create(adminDb.collection("notifications").doc(`request_${input.requestId}`), { userId: order.userId, type: "package_purchase", title: "課卡購買完成",
        body: `${order.packageName} 已加入 ${order.packagePoints} 點。`, isRead: false, createdAt: FieldValue.serverTimestamp() });
      return { requestId: input.requestId, packagePoints: order.packagePoints, newPointBalance };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return couponApiFailure(error); }
}
