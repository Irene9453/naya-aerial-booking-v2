import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Manual quota adjustments never modify bookings, point balances or historical leave records. */
export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
  }
  let adminId: string;
  try {
    adminId = (await adminAuth.verifyIdToken(authorization.slice(7), true)).uid;
  } catch {
    return NextResponse.json({ error: "登入已失效，請重新登入。" }, { status: 401 });
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "資料格式不正確。" }, { status: 400 }); }
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const userId = typeof value.userId === "string" ? value.userId.trim() : "";
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  const operationId = typeof value.operationId === "string" ? value.operationId.trim() : "";
  const year = value.year;
  const half = value.half;
  const action = value.action;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId) ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(operationId) ||
      !Number.isSafeInteger(year) || (year as number) < 2020 || (year as number) > 2100 ||
      (half !== 1 && half !== 2) ||
      (action !== "restore" && action !== "mark_used") ||
      reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: "請確認學生、半年期間、調整方式及原因（2–200 字）。" }, { status: 400 });
  }
  const periodKey = `${year}-H${half}`;
  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const adminRef = adminDb.collection("users").doc(adminId);
      const userRef = adminDb.collection("users").doc(userId);
      const operationRef = adminDb.collection("specialLeaveAdminAdjustmentLogs").doc(operationId);
      const [admin, user, prior] = await Promise.all([tx.get(adminRef), tx.get(userRef), tx.get(operationRef)]);
      if (!admin.exists || admin.data()?.role !== "admin") throw Error("沒有管理員權限。");
      if (prior.exists) {
        const log = prior.data()!;
        if (log.adminId === adminId && log.userId === userId && log.periodKey === periodKey &&
            log.action === action && log.reason === reason) return { alreadyDone: true, periodKey };
        throw Error("操作識別碼已經使用，請重新整理。");
      }
      if (!user.exists || user.data()?.role !== "student") throw Error("找不到學生會員。");
      const overrides = user.data()?.specialLeaveOverrides;
      const previous = overrides && typeof overrides === "object" ? overrides[periodKey] : null;
      const version = Number(previous?.revision ?? 0);
      if (!Number.isSafeInteger(version) || version < 0 || version > 10000) throw Error("額度資料異常，請人工核對。");
      if (action === "restore" && previous?.status === "available") throw Error("此期間已有可用的手動額度，無需重複恢復。");
      const status = action === "restore" ? "available" : "blocked";
      const revision = version + 1;
      const updatedAt = FieldValue.serverTimestamp();
      tx.update(userRef, { [`specialLeaveOverrides.${periodKey}`]: {
        status, revision, updatedAt, updatedBy: adminId, reason,
      } });
      tx.create(operationRef, { adminId, userId, action, periodKey, reason,
        previousStatus: previous?.status ?? null, revision, createdAt: FieldValue.serverTimestamp() });
      tx.create(adminDb.collection("notifications").doc(`special_leave_adjust_${operationId}`), {
        userId, type: "special_leave_adjustment", title: "特殊請假額度更新",
        body: action === "restore" ? `老師已恢復 ${year} 年${half === 1 ? "上半年" : "下半年"}的特殊請假額度 1 次。` :
          `老師已將 ${year} 年${half === 1 ? "上半年" : "下半年"}的特殊請假額度設為已使用。`,
        isRead: false, createdAt: FieldValue.serverTimestamp(),
      });
      return { alreadyDone: false, periodKey, status };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const allowed = ["沒有管理員權限。", "找不到學生會員。", "操作識別碼已經使用，請重新整理。",
      "額度資料異常，請人工核對。", "此期間已有可用的手動額度，無需重複恢復。"];
    if (!allowed.includes(message)) console.error("特殊請假額度調整失敗", error);
    return NextResponse.json({ error: allowed.includes(message) ? message : "調整失敗，請稍後再試。" },
      { status: allowed.includes(message) ? 400 : 500 });
  }
}
