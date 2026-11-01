import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  NEW_STUDENT_OFFERS,
  isNewStudentOfferId,
  isEligibleNewStudent,
  hasPurchasedNewStudentOffer,
} from "@/lib/newStudentOffers";

import { readNewStudentEligibility, eligibilityUserFields } from "@/lib/newStudentEligibility";

export const runtime = "nodejs";

const PAYMENT_METHODS = new Set(["transfer", "linepay_money"]);

export async function POST(request: NextRequest) {
  if (process.env.NAYA_NEW_STUDENT_APPROVAL_ENABLED !== "true") {
    return NextResponse.json({ error: "新生優惠購買功能尚未開放" }, { status: 503 });
  }
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
    }

    const token = await adminAuth.verifyIdToken(authorization.slice(7));
    const userId = token.uid;
    const authUser = await adminAuth.getUser(userId);
    if (!authUser.emailVerified) {
      return NextResponse.json(
        { error: "請先完成 Email 驗證" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "申請內容不正確" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "申請內容不正確" }, { status: 400 });
    }
    const fields = body as Record<string, unknown>;
    const { offerId, paymentMethod, transferLastFive } = fields;

    if (!isNewStudentOfferId(offerId)) {
      return NextResponse.json({ error: "無效的新生優惠商品" }, { status: 400 });
    }
    if (typeof paymentMethod !== "string" || !PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: "付款方式不正確" }, { status: 400 });
    }
    if (
      paymentMethod === "transfer" &&
      (typeof transferLastFive !== "string" || !/^\d{5}$/.test(transferLastFive))
    ) {
      return NextResponse.json({ error: "請填寫轉出帳號末五碼" }, { status: 400 });
    }

    const offer = NEW_STUDENT_OFFERS[offerId];
    // 固定文件 ID：每位會員、每項優惠永遠只有一筆申請紀錄。
    // 拒絕後可重新提出，但完成後不能再次購買。
    const requestId = `new_student_${userId}_${offerId}`;
    const requestRef = adminDb.collection("purchaseRequests").doc(requestId);
    const userRef = adminDb.collection("users").doc(userId);

    const saleRef = adminDb.collection("packageSales").doc(`request_${requestId}`);
    const voucherRef = adminDb.collection("trialVouchers").doc(requestId);

    const result = await adminDb.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const existingSnap = await tx.get(requestRef);
      const saleSnap = await tx.get(saleRef);
      const voucherSnap = await tx.get(voucherRef);

      if (!userSnap.exists) throw new Error("找不到會員資料");
      const rawUserData = userSnap.data()!;
      const eligibility = await readNewStudentEligibility(tx, userId, rawUserData);
      const userData = { ...rawUserData, ...eligibilityUserFields(eligibility) };
      if (!isEligibleNewStudent(userData)) {
        throw new Error("此會員不符合新生優惠資格");
      }
      if (hasPurchasedNewStudentOffer(userData, offerId) || saleSnap.exists || voucherSnap.exists) {
        throw new Error("此項新生優惠已購買過");
      }

      if (existingSnap.exists) {
        const status = String(existingSnap.data()?.status ?? "");
        if (status === "completed") throw new Error("此項新生優惠已購買過");
        if (status !== "rejected") throw new Error("已有此項優惠的待處理申請");
      }

      const order = {
        userId,
        offerId,
        offerType: "new_student",
        packageId: `new_student_${offerId}`,
        packageName: offer.name,
        packagePoints: offer.points,
        originalPrice: offer.price,
        finalPrice: offer.price,
        discountAmount: 0,
        discountType: null,
        discountValue: 0,
        couponId: null,
        couponCode: null,
        couponName: null,
        couponSource: null,
        paymentMethod,
        transferLastFive: paymentMethod === "transfer" ? transferLastFive : null,
        paymentStatus: "unpaid",
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        completedAt: null,
        createdAt: FieldValue.serverTimestamp(),
      };
      tx.update(userRef, eligibilityUserFields(eligibility));
      if (existingSnap.exists) tx.set(requestRef, order);
      else tx.create(requestRef, order);
      return { requestId, offerId, finalPrice: offer.price };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code) : "";
    if (code.startsWith("auth/")) {
      return NextResponse.json({ error: "登入已失效，請重新登入" }, { status: 401 });
    }
    console.error("建立新生優惠訂單失敗：", error);
    const message = error instanceof Error ? error.message : "建立訂單失敗";
    const knownErrors = [
      "已有一般課卡購買紀錄的會員不適用新生優惠",
      "找不到會員資料",
      "此會員不符合新生優惠資格",
      "舊系統會員不適用新生優惠",
      "此項新生優惠已購買過",
      "已有此項優惠的待處理申請",
    ];
    return NextResponse.json(
      { error: knownErrors.includes(message) ? message : "建立訂單失敗，請稍後再試" },
      { status: knownErrors.includes(message) ? 400 : 500 }
    );
  }
}
