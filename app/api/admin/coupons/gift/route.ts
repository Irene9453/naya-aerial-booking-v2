import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function emulatorOnly() {
  return process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
    process.env.FIREBASE_ADMIN_PROJECT_ID === "demo-naya-aerial" &&
    process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099";
}

export async function POST(request: NextRequest) {
  if (!emulatorOnly()) {
    return NextResponse.json({ error: "贈券功能目前僅開放 Emulator 測試。" }, { status: 403 });
  }
  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const adminSnapshot = await adminDb.collection("users").doc(decoded.uid).get();
    if (adminSnapshot.data()?.role !== "admin") {
      return NextResponse.json({ error: "沒有管理員權限。" }, { status: 403 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new Error("請提供贈券資料。");
    const input = body as Record<string, unknown>;
    const couponId = typeof input.couponId === "string" ? input.couponId.trim() : "";
    const operationId = typeof input.operationId === "string" ? input.operationId.trim() : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    const quantity = input.quantity;
    const rawIds = input.userIds;
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)) throw new Error("操作識別碼無效。");
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(couponId)) throw new Error("優惠券識別碼無效。");
    if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 10) throw new Error("每人張數限 1 至 10 張。");
    if (reason.length < 2 || reason.length > 200) throw new Error("請輸入 2 至 200 字的贈券原因。");
    if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 100 ||
      !rawIds.every((id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id))) {
      throw new Error("每批限 1 至 100 位有效會員。");
    }
    const userIds = [...new Set(rawIds as string[])];
    if (userIds.length !== rawIds.length) throw new Error("會員名單有重複項目。");

    const templateSnapshot = await adminDb.collection("coupons").doc(couponId).get();
    const template = templateSnapshot.data();
    if (!templateSnapshot.exists || !template || template.isActive !== true) throw new Error("優惠券不存在或未啟用。");
    const rate = Number(template.discountRate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new Error("優惠券折扣資料無效。");
    const name = String(template.name ?? "").trim();
    if (!name) throw new Error("優惠券名稱無效。");
    const results: Array<{ userId: string; status: "created" | "already_done" | "failed"; error?: string }> = [];

    for (const userId of userIds) {
      try {
        const status = await adminDb.runTransaction(async (tx) => {
          const memberRef = adminDb.collection("users").doc(userId);
          const logRef = adminDb.collection("couponGiftLogs").doc(`${operationId}_${userId}`);
          const [member, prior] = await Promise.all([tx.get(memberRef), tx.get(logRef)]);
          if (prior.exists) {
            const existing = prior.data()!;
            if (existing.adminId !== decoded.uid || existing.couponId !== couponId ||
                existing.quantity !== quantity || existing.reason !== reason) {
              throw new Error("操作識別碼已被其他贈券內容使用。");
            }
            return "already_done" as const;
          }
          if (!member.exists || member.data()?.role !== "student") throw new Error("找不到有效學生會員。");
          const giftIds: string[] = [];
          for (let index = 0; index < (quantity as number); index++) {
            const giftId = `gift_${operationId}_${userId}_${index}`;
            giftIds.push(giftId);
            tx.create(adminDb.collection("userCoupons").doc(giftId), {
              userId, couponId, name, type: String(template.type ?? "reward"),
              discountRate: rate, status: "available", rewardCost: 0,
              source: "admin_gift", giftOperationId: operationId,
              giftReason: reason, issuedBy: decoded.uid, issuedAt: FieldValue.serverTimestamp(),
              usedAt: null, purchaseRequestId: null,
              minimumPackagePoints: Number(template.minimumPackagePoints ?? 0),
              maximumPackagePoints: template.maximumPackagePoints ?? null,
            });
          }
          tx.create(logRef, {
            operationId, userId, adminId: decoded.uid, couponId, couponName: name,
            quantity, reason, giftIds, createdAt: FieldValue.serverTimestamp(),
          });
          tx.create(adminDb.collection("notifications").doc(`coupon_gift_${operationId}_${userId}`), {
            userId, type: "coupon_gift", title: "收到優惠券",
            body: `老師贈送「${name}」${quantity} 張，請至購買課卡頁面使用。`,
            isRead: false, createdAt: FieldValue.serverTimestamp(),
          });
          return "created" as const;
        });
        results.push({ userId, status });
      } catch (error) {
        results.push({ userId, status: "failed", error: error instanceof Error ? error.message : "未知錯誤" });
      }
    }
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "贈券失敗。" }, { status: 400 });
  }
}