import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
  let adminId: string;
  try { adminId = (await adminAuth.verifyIdToken(authHeader.slice(7), true)).uid; }
  catch { return NextResponse.json({ error: "登入已失效，請重新登入。" }, { status: 401 }); }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "資料格式錯誤。" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "請提供調整資料。" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const periodKey = typeof input.periodKey === "string" ? input.periodKey.trim() : "";
  const action = input.action;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const operationId = typeof input.operationId === "string" ? input.operationId.trim() : "";
  const periodMatch = /^(20\d{2})-H([12])$/.exec(periodKey);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId) ||
      !periodMatch || (action !== "restore" && action !== "mark_used") ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(operationId) ||
      reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: "請選擇有效學生、半年期間、操作類型並填寫 2–200 字原因。" }, { status: 400 });
  }
  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const adminRef = adminDb.collection("users").doc(adminId);
      const memberRef = adminDb.collection("users").doc(userId);
      const baselineRef = adminDb.collection("specialLeaveRecords").doc(`${userId}_${periodKey}`);
      const adjustmentRef = adminDb.collection("specialLeaveQuotaAdjustments").doc(`${userId}_${periodKey}`);
      const logRef = adminDb.collection("specialLeaveAdjustmentLogs").doc(operationId);
      const [adminSnap, memberSnap, baselineSnap, adjustmentSnap, logSnap] = await Promise.all([
        tx.get(adminRef), tx.get(memberRef), tx.get(baselineRef), tx.get(adjustmentRef), tx.get(logRef),
      ]);
      if (!adminSnap.exists || adminSnap.data()?.role !== "admin") throw Error("沒有管理員權限。");
      if (logSnap.exists) {
        const log = logSnap.data()!;
        if (log.adminId === adminId && log.userId === userId && log.periodKey === periodKey &&
            log.action === action && log.reason === reason) return { alreadyDone: true };
        throw Error("操作識別碼已用於其他調整。");
      }
      if (!memberSnap.exists || memberSnap.data()?.role !== "student") throw Error("找不到有效學生會員。");
      const baselineUsed = baselineSnap.exists && baselineSnap.data()?.status === "approved";
      const existing = adjustmentSnap.data();
      const previousExtra = Number(existing?.extraRemaining ?? 0);
      if (![0, 1].includes(previousExtra)) throw Error("原有額度資料異常，請人工核對。");
      // Restore gives a single additional usable slot only if a normal leave was used.
      // Never alter historical records or retroactively refund points.
      const manualBlocked = action === "mark_used";
      const extraRemaining = action === "restore" && baselineUsed ? 1 : 0;
      tx.set(adjustmentRef, {
        userId, periodKey, periodYear: Number(periodMatch[1]), periodHalf: Number(periodMatch[2]),
        manualBlocked, extraRemaining, modifiedBy: adminId, reason,
        modifiedAt: FieldValue.serverTimestamp(), operationId,
      });
      // Mirror only the quota view into the existing owner-readable member document.
      // Firestore security rules remain unchanged; the adjustment itself is backend-only.
      tx.update(memberRef, {
        [`specialLeaveQuotaAdjustments.${periodKey}`]: { manualBlocked, extraRemaining },
      });
      tx.create(logRef, {
        userId, adminId, periodKey, action, reason, baselineUsed,
        previousState: existing ? { manualBlocked: existing.manualBlocked === true, extraRemaining: previousExtra } : null,
        newState: { manualBlocked, extraRemaining },
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(adminDb.collection("notifications").doc(`special_leave_adjust_${operationId}`), {
        userId, type: "special_leave_adjustment", title: "特殊請假額度已更新",
        body: action === "restore" ? `${periodKey} 特殊請假額度已由老師恢復一次。` : `${periodKey} 特殊請假額度已由老師標記使用。`,
        isRead: false, createdAt: FieldValue.serverTimestamp(),
      });
      return { alreadyDone: false, manualBlocked, extraRemaining, baselineUsed };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = ["沒有管理員權限。", "找不到有效學生會員。", "操作識別碼已用於其他調整。", "原有額度資料異常，請人工核對。"];
    if (!known.includes(message)) console.error("特殊請假手動調整失敗", error);
    return NextResponse.json({ error: known.includes(message) ? message : "額度調整失敗，請稍後重試。" },
      { status: known.includes(message) ? 400 : 500 });
  }
}
