import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { couponTemplateFields } from "@/lib/couponTemplate";

export const runtime = "nodejs";
export const maxDuration = 60;
const safeErrors = new Set([
  "操作識別碼已被其他贈券內容使用。", "找不到有效學生會員。", "管理員權限已變更。",
  "優惠券不存在或未啟用。", "優惠券折扣或適用點數資料無效。",
]);

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
    }
    let adminId: string;
    try { adminId = (await adminAuth.verifyIdToken(authorization.slice(7), true)).uid; }
    catch { return NextResponse.json({ error: "登入已失效，請重新登入。" }, { status: 401 }); }
    const adminRef = adminDb.collection("users").doc(adminId);
    const adminSnapshot = await adminRef.get();
    if (!adminSnapshot.exists || adminSnapshot.data()?.role !== "admin") {
      return NextResponse.json({ error: "沒有管理員權限。" }, { status: 403 });
    }
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "贈券資料格式不正確。" }, { status: 400 }); }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "請提供贈券資料。" }, { status: 400 });
    const input = body as Record<string, unknown>;
    const couponId = typeof input.couponId === "string" ? input.couponId.trim() : "";
    const operationId = typeof input.operationId === "string" ? input.operationId.trim() : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const quantity = input.quantity;
    const rawIds = input.userIds;
    let validationError = "";
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)) validationError = "操作識別碼無效。";
    else if (!/^[a-zA-Z0-9_-]{1,200}$/.test(couponId)) validationError = "優惠券識別碼無效。";
    else if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 10) validationError = "每人張數限 1 至 10 張。";
    else if (reason.length < 2 || reason.length > 200) validationError = "請輸入 2 至 200 字的贈券原因。";
    else if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 100 ||
      !rawIds.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id))) validationError = "每批限 1 至 100 位有效會員。";
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const userIds = [...new Set(rawIds as string[])];
    if (userIds.length !== (rawIds as string[]).length) return NextResponse.json({ error: "會員名單有重複項目。" }, { status: 400 });
    const results: Array<{ userId: string; status: "created" | "already_done" | "failed"; error?: string }> = [];
    for (const userId of userIds) {
      try {
        const status = await adminDb.runTransaction(async tx => {
          const memberRef = adminDb.collection("users").doc(userId);
          const logRef = adminDb.collection("couponGiftLogs").doc(`${operationId}_${userId}`);
          const templateRef = adminDb.collection("coupons").doc(couponId);
          const [currentAdmin, member, prior, templateSnapshot] = await Promise.all([
            tx.get(adminRef), tx.get(memberRef), tx.get(logRef), tx.get(templateRef),
          ]);
          if (!currentAdmin.exists || currentAdmin.data()?.role !== "admin") throw Error("管理員權限已變更。");
          if (prior.exists) {
            const existing = prior.data()!;
            if (existing.adminId !== adminId || existing.couponId !== couponId || existing.quantity !== quantity || existing.reason !== reason) {
              throw Error("操作識別碼已被其他贈券內容使用。");
            }
            return "already_done" as const;
          }
          if (!member.exists || member.data()?.role !== "student") throw Error("找不到有效學生會員。");
          const template = templateSnapshot.data();
          if (!templateSnapshot.exists || template?.isActive !== true) throw Error("優惠券不存在或未啟用。");
          let fields;
          try { fields = couponTemplateFields(template); }
          catch { throw Error("優惠券折扣或適用點數資料無效。"); }
          const giftIds: string[] = [];
          for (let index = 0; index < (quantity as number); index++) {
            const giftId = `gift_${operationId}_${userId}_${index}`;
            giftIds.push(giftId);
            tx.create(adminDb.collection("userCoupons").doc(giftId), {
              userId, couponId, ...fields, status: "available", rewardCost: 0,
              source: "admin_gift", giftOperationId: operationId,
              giftReason: reason, issuedBy: adminId, issuedAt: FieldValue.serverTimestamp(),
              usedAt: null, purchaseRequestId: null,
            });
          }
          tx.create(logRef, { operationId, userId, adminId, couponId, couponName: fields.name,
            quantity, reason, giftIds, createdAt: FieldValue.serverTimestamp() });
          tx.create(adminDb.collection("notifications").doc(`coupon_gift_${operationId}_${userId}`), {
            userId, type: "coupon_gift", title: "收到優惠券",
            body: `老師贈送「${fields.name}」${quantity} 張，請至購買課卡頁面使用。`,
            isRead: false, createdAt: FieldValue.serverTimestamp(),
          });
          return "created" as const;
        });
        results.push({ userId, status });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!safeErrors.has(message)) console.error("管理員贈券失敗", error);
        results.push({ userId, status: "failed", error: safeErrors.has(message) ? message : "發放失敗，請重試同一操作。" });
      }
    }
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("管理員贈券失敗", error);
    return NextResponse.json({ error: "贈券失敗，請稍後重試。" }, { status: 500 });
  }
}
