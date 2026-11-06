import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

type Kind = "trial_yoga" | "trial_aerial";
const ALLOWED: readonly Kind[] = ["trial_yoga", "trial_aerial"];
const label = (kind: Kind) => kind === "trial_yoga" ? "空瑜體驗券" : "舞綢／空環體驗券";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
  }
  let adminId: string;
  try {
    adminId = (await adminAuth.verifyIdToken(authHeader.slice(7), true)).uid;
  } catch {
    return NextResponse.json({ error: "管理員登入已失效，請重新登入。" }, { status: 401 });
  }

  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "資料格式不正確。" }, { status: 400 }); }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "請提供發券資料。" }, { status: 400 });
  }
  const input = raw as Record<string, unknown>;
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const target = input.offerId;
  const previous = input.previousOfferId;
  const action = input.action;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const operationId = typeof input.operationId === "string" ? input.operationId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId) ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(operationId) ||
      !ALLOWED.includes(target as Kind) ||
      (action !== "grant" && action !== "exchange") ||
      (action === "exchange" && (!ALLOWED.includes(previous as Kind) || previous === target)) ||
      (action === "grant" && previous != null) ||
      reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: "請選擇有效會員、券種與操作類型，並填寫 2–200 字原因。" }, { status: 400 });
  }

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const adminRef = adminDb.collection("users").doc(adminId);
      const memberRef = adminDb.collection("users").doc(userId);
      const newRef = adminDb.collection("trialVouchers").doc(`new_student_${userId}_${target}`);
      const oldRef = action === "exchange"
        ? adminDb.collection("trialVouchers").doc(`new_student_${userId}_${previous}`)
        : null;
      const logRef = adminDb.collection("trialVoucherAdminActions").doc(operationId);
      const [adminSnap, memberSnap, newSnap, oldSnap, previousLog] = await Promise.all([
        tx.get(adminRef), tx.get(memberRef), tx.get(newRef), oldRef ? tx.get(oldRef) : Promise.resolve(null), tx.get(logRef),
      ]);
      if (!adminSnap.exists || adminSnap.data()?.role !== "admin") {
        throw new Error("沒有管理員權限。");
      }
      if (previousLog.exists) {
        const record = previousLog.data()!;
        if (record.adminId === adminId && record.userId === userId &&
            record.action === action && record.offerId === target &&
            (record.previousOfferId ?? null) === (previous ?? null) && record.reason === reason) {
          return { alreadyDone: true, offerId: target };
        }
        throw new Error("操作識別碼已用於其他發券內容。");
      }
      if (!memberSnap.exists || memberSnap.data()?.role !== "student") {
        throw new Error("找不到有效學生會員。");
      }
      // Keep historical voucher IDs immutable: previously-used or revoked target vouchers
      // must never be reset, as it would allow the same benefit to be issued twice.
      if (newSnap.exists) {
        throw new Error("學生曾領取此券種，無法重複發放或覆寫；請先人工核對。");
      }
      if (oldRef) {
        const old = oldSnap?.data();
        if (!oldSnap?.exists || old?.userId !== userId || old.offerId !== previous ||
            old.status !== "available" || old.quantity !== 1 || old.bookingId != null) {
          throw new Error("原體驗券已使用、預約中或不存在，無法換券。");
        }
      }
      const kind = target === "trial_yoga" ? "yoga" : "aerial";
      tx.create(newRef, {
        userId, offerId: target, kind, status: "available", quantity: 1,
        purchaseRequestId: null, issuedAt: FieldValue.serverTimestamp(),
        issuedBy: adminId, issueReason: reason, issueSource: action === "exchange" ? "admin_exchange" : "admin_grant",
        adminOperationId: operationId, usedAt: null, bookingId: null,
      });
      if (oldRef) {
        tx.update(oldRef, {
          status: "revoked", quantity: 0, revokedAt: FieldValue.serverTimestamp(),
          revokedBy: adminId, revokeReason: reason, exchangeOperationId: operationId,
        });
      }
      // Member center displays vouchers only when the purchase/issue flag is true.
      // Do not reset old purchase history when exchanging.
      tx.update(memberRef, { [`newStudentOfferPurchases.${target}`]: true });
      tx.create(logRef, {
        adminId, userId, action, offerId: target,
        previousOfferId: action === "exchange" ? previous : null,
        reason, newVoucherId: newRef.id, oldVoucherId: oldRef?.id ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(adminDb.collection("notifications").doc(`trial_voucher_admin_${operationId}`), {
        userId, type: "trial_voucher", title: action === "exchange" ? "體驗券已更換" : "收到體驗券",
        body: action === "exchange"
          ? `老師已將體驗券更換為「${label(target as Kind)}」，請至會員中心查看。`
          : `老師已發放「${label(target as Kind)}」，請至會員中心查看。`,
        isRead: false, createdAt: FieldValue.serverTimestamp(),
      });
      return { alreadyDone: false, offerId: target };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = [
      "沒有管理員權限。", "找不到有效學生會員。",
      "操作識別碼已用於其他發券內容。",
      "學生曾領取此券種，無法重複發放或覆寫；請先人工核對。",
      "原體驗券已使用、預約中或不存在，無法換券。",
    ];
    if (!safe.includes(message)) console.error("管理員體驗券操作失敗", error);
    return NextResponse.json({ error: safe.includes(message) ? message : "發券失敗，請稍後重試。" },
      { status: safe.includes(message) ? 400 : 500 });
  }
}
