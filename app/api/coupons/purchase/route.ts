import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { couponApiUser, couponApiFailure, CouponApiError, safeCouponId } from "@/lib/couponApiAuth";
import { couponIsUsable, couponDeadline } from "@/lib/couponValidity";
import { couponTemplateFields } from "@/lib/couponTemplate";
import { couponDiscountFields, couponDiscountAmount } from "@/lib/couponDiscount";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const submittedAtMillis = Date.now();
  try {
    const uid = await couponApiUser(request);
    if (!(await adminAuth.getUser(uid)).emailVerified) throw new CouponApiError("請先完成 Email 驗證。", 403);
    let input; try { input = await request.json(); } catch { throw new CouponApiError("申請格式不正確。"); }
    if (!input || !safeCouponId(input.couponId) || !safeCouponId(input.packageId) || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.operationId ?? "") ||
        !["transfer", "linepay_money", "cash"].includes(input.paymentMethod) || (input.paymentMethod === "transfer" && !/^\d{5}$/.test(input.transferLastFive ?? ""))) throw new CouponApiError("請確認商品、付款方式及轉出末五碼。");
    const birthday = input.couponSource === "birthday";
    const birthdayYear = birthday ? Number(String(input.couponId).match(/^birthday_(\d{4})$/)?.[1]) : null;
    if (birthday && (!birthdayYear || birthdayYear < 2000)) throw new CouponApiError("生日優惠編號不正確。");
    const canonicalCouponId = birthday ? `birthday_${uid}_${birthdayYear}` : input.couponId;
    const requestId = `coupon_${uid}_${input.operationId}`;
    const orderRef = adminDb.collection("purchaseRequests").doc(requestId);
    const couponRef = adminDb.collection("userCoupons").doc(canonicalCouponId);
    const result = await adminDb.runTransaction(async tx => {
      const [member, couponSnap, packageSnap, existing] = await Promise.all([
        tx.get(adminDb.collection("users").doc(uid)), tx.get(couponRef), tx.get(adminDb.collection("packages").doc(input.packageId)), tx.get(orderRef),
      ]);
      let coupon = couponSnap.data();
      const product = packageSnap.data();
      let birthdayUsageRef;
      let birthdayUsage;
      const localDate = new Date(submittedAtMillis + 8 * 3600000);
      const year = localDate.getUTCFullYear(), month = localDate.getUTCMonth() + 1;
      if (birthday || coupon?.source === "automatic_birthday") {
        const benefitYear = birthday ? birthdayYear! : Number(coupon?.birthdayYear);
        if (!Number.isSafeInteger(benefitYear)) throw new CouponApiError("生日優惠資料不正確。");
        birthdayUsageRef = adminDb.collection("birthdayCouponUsage").doc(`${uid}_${benefitYear}`);
        birthdayUsage = await tx.get(birthdayUsageRef);
        if (!coupon) {
          const birthMonth = Number(member.data()?.birthdayMonth);
          if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) throw new CouponApiError("尚未設定正確生日。");
          const deadline = Date.UTC(benefitYear, birthMonth, 1) - 8 * 3600000;
          coupon = { userId: uid, name: "生日 7 折優惠", type: "birthday", discountRate: 0.7, minimumPackagePoints: 0, maximumPackagePoints: null,
            status: "available", expiryMode: "date", expiresAtMillis: deadline, expiresOn: new Date(deadline - 1 + 8 * 3600000).toISOString().slice(0, 10), source: "automatic_birthday", birthdayYear: benefitYear };
        }
      }
      if (!member.exists || member.data()?.role !== "student") throw new CouponApiError("找不到學生會員資料。", 403);
      if (existing.exists) {
        const order = existing.data()!;
        if (order.userId === uid && order.couponId === canonicalCouponId && order.packageId === input.packageId && order.offerType === "reserved_coupon" &&
            ((order.status === "pending" && coupon?.status === "reserved" && coupon.purchaseRequestId === requestId) || order.status === "completed")) return { requestId, finalPrice: order.finalPrice };
        throw new CouponApiError("操作編號已被使用，請重新整理後確認購買紀錄。");
      }
      if (birthdayUsageRef && (Number(coupon?.birthdayYear) !== year || Number(member.data()?.birthdayMonth) !== month ||
          (birthdayUsage?.exists && birthdayUsage.data()?.status !== "released"))) throw new CouponApiError("目前無法使用本年度生日優惠，可能已使用或有待處理申請。");
      const now = submittedAtMillis;
      if (!coupon || coupon.userId !== uid || !couponIsUsable(coupon, now)) throw new CouponApiError("優惠券已到期、待核對、已使用或已被其他申請保留。");
      if (!product || product.isActive !== true || !Number.isSafeInteger(product.points) || product.points <= 0 || !Number.isSafeInteger(product.price) || product.price < 0) throw new CouponApiError("課卡商品不存在或已停用。");
      try { couponTemplateFields(coupon); } catch { throw new CouponApiError("優惠券折扣或適用商品設定無效。"); }
      if (product.points < Number(coupon.minimumPackagePoints ?? 0) ||
          (coupon.maximumPackagePoints != null && product.points > Number(coupon.maximumPackagePoints))) throw new CouponApiError("優惠券不適用於此商品。");
      const discount = couponDiscountFields(coupon);
      const discountAmount = couponDiscountAmount(product.price, coupon);
      const order = { userId: uid, offerType: "reserved_coupon", packageId: input.packageId, packageName: product.name, packagePoints: product.points,
        originalPrice: product.price, discountAmount, finalPrice: product.price - discountAmount, couponId: canonicalCouponId,
        couponCode: birthday ? input.couponId : canonicalCouponId, couponName: String(coupon.name ?? "優惠券"), couponSource: birthdayUsageRef ? "birthday" : "user_coupon", discountType: discount.discountType, discountValue: discount.discountType === "fixed_amount" ? discount.fixedDiscountAmount : discount.discountRate,
        couponExpiresAtMillis: couponDeadline(coupon) ?? null, couponReservedAtMillis: now,
        paymentMethod: input.paymentMethod, transferLastFive: input.paymentMethod === "transfer" ? input.transferLastFive : null,
        status: "pending", paymentStatus: "unpaid", createdAt: FieldValue.serverTimestamp(), submittedAtMillis: now,
        reviewedBy: null, reviewedAt: null, completedAt: null };
      tx.create(orderRef, order);
      if (couponSnap.exists) tx.update(couponRef, { status: "reserved", purchaseRequestId: requestId, reservedAtMillis: now });
      else tx.create(couponRef, { ...coupon, status: "reserved", purchaseRequestId: requestId, reservedAtMillis: now, issuedAt: FieldValue.serverTimestamp() });
      if (birthdayUsageRef) tx.set(birthdayUsageRef, { userId: uid, year: coupon!.birthdayYear, status: "reserved", requestId, reservedAtMillis: now });
      return { requestId, finalPrice: order.finalPrice };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return couponApiFailure(error); }
}
