import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { NEW_STUDENT_OFFERS, isNewStudentOfferId, isEligibleNewStudent, hasPurchasedNewStudentOffer } from "@/lib/newStudentOffers";

import { readNewStudentEligibility, eligibilityUserFields } from "@/lib/newStudentEligibility";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Do not activate until historical membership and end-to-end tests are complete.
  if (process.env.NAYA_NEW_STUDENT_APPROVAL_ENABLED !== "true") {
    return NextResponse.json({ error: "新生優惠付款核准功能尚未開放" }, { status: 503 });
  }

  try {
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "請先登入管理員" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(bearer.slice(7));
    const adminId = decoded.uid;
    const adminSnap = await adminDb.collection("users").doc(adminId).get();
    if (!adminSnap.exists || adminSnap.data()?.role !== "admin") {
      return NextResponse.json({ error: "沒有管理員權限" }, { status: 403 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "申請內容不正確" }, { status: 400 });
    }
    const requestId = body && typeof body === "object" && "requestId" in body
      ? (body as { requestId?: unknown }).requestId : null;
    if (typeof requestId !== "string" || !/^new_student_[^/]+_(trial_yoga|trial_aerial|starter_12)$/.test(requestId)) {
      return NextResponse.json({ error: "新生訂單編號不正確" }, { status: 400 });
    }
    const orderRef = adminDb.collection("purchaseRequests").doc(requestId);
    // Legacy history is not fully normalized. Keep the rollout flag OFF until verified.
    // Recheck known regular purchases at approval, not only at order submission.
    const submittedOrder = await orderRef.get();
    if (!submittedOrder.exists) {
      return NextResponse.json({ error: "找不到購買申請" }, { status: 404 });
    }
    const studentId = String(submittedOrder.data()?.userId ?? "");
    if (!studentId || studentId.includes("/")) {
      return NextResponse.json({ error: "新生訂單資料不正確" }, { status: 400 });
    }
    const result = await adminDb.runTransaction(async (tx) => {
      const currentAdmin = await tx.get(adminDb.collection("users").doc(adminId));
      if (!currentAdmin.exists || currentAdmin.data()?.role !== "admin") {
        throw new Error("沒有管理員權限");
      }
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("找不到購買申請");
      const order = orderSnap.data()!;
      const userId = String(order.userId ?? "");
      const offerId = order.offerId;
      if (userId !== studentId || !userId || userId.includes("/") || !isNewStudentOfferId(offerId) ||
          requestId !== `new_student_${userId}_${offerId}` || order.offerType !== "new_student") {
        throw new Error("新生訂單資料不正確");
      }
      const userRef = adminDb.collection("users").doc(userId);
      const saleRef = adminDb.collection("packageSales").doc(`request_${requestId}`);
      const transactionRef = adminDb.collection("pointTransactions").doc(`request_${requestId}`);
      const voucherRef = adminDb.collection("trialVouchers").doc(`new_student_${userId}_${offerId}`);
      const noticeRef = adminDb.collection("notifications").doc(`request_${requestId}`);
      const [userSnap, saleSnap, voucherSnap] = await Promise.all([
        tx.get(userRef), tx.get(saleRef), tx.get(voucherRef),
      ]);
      if (!userSnap.exists) throw new Error("找不到會員資料");
      const rawUser = userSnap.data()!;
      const eligibility = await readNewStudentEligibility(tx, userId, rawUser);
      const user: Record<string, unknown> = { ...rawUser, ...eligibilityUserFields(eligibility) };
      if (!isEligibleNewStudent(user)) {
        throw new Error("會員不符合新生優惠資格");
      }
      if (order.status !== "pending" || order.paymentStatus !== "unpaid") {
        throw new Error("訂單並非待核准狀態");
      }
      if (hasPurchasedNewStudentOffer(user, offerId) || saleSnap.exists || voucherSnap.exists) {
        throw new Error("此項優惠已發放過");
      }
      const offer = NEW_STUDENT_OFFERS[offerId];
      if (order.packageId !== `new_student_${offerId}` ||
          order.packageName !== offer.name || order.packagePoints !== offer.points ||
          order.originalPrice !== offer.price || order.finalPrice !== offer.price ||
          order.discountAmount !== 0 ||
          order.discountType != null || order.discountValue !== 0 || order.couponName != null ||
          order.couponId != null || order.couponSource != null || order.couponCode != null ||
          !["transfer", "linepay_money"].includes(order.paymentMethod) ||
          (order.paymentMethod === "transfer" &&
            (typeof order.transferLastFive !== "string" || !/^\d{5}$/.test(order.transferLastFive)))) {
        throw new Error("訂單商品或價格驗證失敗");
      }
      const pointsBefore = Number(user.points ?? 0);
      if (!Number.isSafeInteger(pointsBefore) || pointsBefore < 0) throw new Error("會員點數異常");
      const pointsAfter = pointsBefore + offer.points;
      if (!Number.isSafeInteger(pointsAfter)) throw new Error("會員點數異常");

      // Separate per-offer claims; do not reset isNewStudent (reserved for regular package logic).
      tx.update(userRef, { ...eligibilityUserFields(eligibility), points: pointsAfter, [`newStudentOfferPurchases.${offerId}`]: true });
      tx.update(orderRef, {
        status: "completed", paymentStatus: "confirmed", reviewedBy: adminId,
        reviewedAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp(),
        pointBalanceAfter: pointsAfter,
      });
      tx.create(saleRef, {
        requestId, adminId, studentId: userId, offerId, offerType: "new_student",
        packageId: order.packageId, packageName: offer.name, points: offer.points,
        originalPrice: offer.price, discountAmount: 0, price: offer.price,
        paymentMethod: order.paymentMethod ?? "", transferLastFive: order.transferLastFive ?? null,
        status: "completed", createdAt: FieldValue.serverTimestamp(),
      });
      if (offer.points > 0) {
        tx.create(transactionRef, {
          userId, adminId, requestId, packageId: order.packageId, packageName: offer.name,
          type: "new_student_package_purchase", amount: offer.points, balanceAfter: pointsAfter,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.create(voucherRef, {
          userId, offerId, kind: offer.entitlement, status: "available", quantity: 1,
          purchaseRequestId: requestId, issuedAt: FieldValue.serverTimestamp(),
          usedAt: null, bookingId: null,
        });
      }
      tx.create(noticeRef, {
        userId, requestId, type: "package_purchase", title: "新生優惠購買完成",
        body: offer.points > 0 ? `已收到款項，${offer.name} 已加入 ${offer.points} 點。` :
          `已收到款項，${offer.name} 體驗券已發放。預約功能完成後即可使用。`,
        isRead: false, createdAt: FieldValue.serverTimestamp(),
      });
      return { packageName: offer.name, pointsAdded: offer.points, pointsAfter,
        voucherIssued: offer.points === 0 };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code) : "";
    if (code.startsWith("auth/")) {
      return NextResponse.json({ error: "登入已失效，請重新登入" }, { status: 401 });
    }
    console.error("新生優惠付款核准失敗", error);
    const message = error instanceof Error ? error.message : "核准失敗";
    const safeErrors = new Set(["沒有管理員權限", "會員已有一般課卡購買紀錄", "找不到購買申請", "新生訂單資料不正確", "找不到會員資料",
      "會員不符合新生優惠資格", "訂單並非待核准狀態", "此項優惠已發放過",
      "訂單商品或價格驗證失敗", "會員點數異常"]);
    return NextResponse.json({ error: safeErrors.has(message) ? message : "核准失敗，請稍後再試" },
      { status: safeErrors.has(message) ? 400 : 500 });
  }
}
