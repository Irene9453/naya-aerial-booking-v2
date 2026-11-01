import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

import { isFirestoreQuotaError, firestoreQuotaMessage } from "@/lib/firestoreQuota";

export const runtime = "nodejs";
class ScheduleError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(value);
const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : null;
const validMillis = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= Date.UTC(2000, 0, 1) && value < Date.UTC(2100, 0, 1);
const formatTime = (value: number) => new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });

export async function POST(request: NextRequest) {
  try {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new ScheduleError("請先登入管理員帳號。", 401);
    let uid: string;
    try { uid = (await adminAuth.verifyIdToken(header.slice(7), true)).uid; }
    catch { throw new ScheduleError("登入已失效，請重新登入。", 401); }
    const adminRef = adminDb.collection("users").doc(uid);
    if ((await adminRef.get()).data()?.role !== "admin") throw new ScheduleError("只有管理員可以修改課程時間。", 403);
    let body;
    try { body = await request.json(); }
    catch { throw new ScheduleError("請求格式不正確。", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ScheduleError("請求格式不正確。", 400);
    const { classId, startTimeMillis, endTimeMillis, expectedStartTimeMillis, expectedEndTimeMillis, reason, operationId } = body;
    if (!validId(classId) || !validId(operationId) || !validMillis(startTimeMillis) || !validMillis(endTimeMillis) || endTimeMillis <= startTimeMillis || endTimeMillis - startTimeMillis > 86400000 ||
        !(expectedStartTimeMillis === null || validMillis(expectedStartTimeMillis)) || !(expectedEndTimeMillis === null || validMillis(expectedEndTimeMillis)) || typeof reason !== "string" || reason.trim().length < 2 || reason.trim().length > 300) {
      throw new ScheduleError("請填寫有效的開始／結束時間（24 小時內）及 2～300 字的修改原因。", 400);
    }
    const classRef = adminDb.collection("classes").doc(classId);
    const logRef = adminDb.collection("classScheduleChanges").doc(`${classId}_${operationId}`);
    const result = await adminDb.runTransaction(async tx => {
      const [admin, course, previous] = await Promise.all([tx.get(adminRef), tx.get(classRef), tx.get(logRef)]);
      if (admin.data()?.role !== "admin") throw new ScheduleError("管理員權限已變更，請重新登入。", 403);
      if (previous.exists) {
        const log = previous.data()!;
        if (log.adminUid !== uid || log.newStartTimeMillis !== startTimeMillis || log.newEndTimeMillis !== endTimeMillis || log.reason !== reason.trim()) throw new ScheduleError("操作編號已使用，請重新開啟修改畫面。");
        return { alreadySaved: true, notifiedStudents: log.notifiedStudents };
      }
      if (!course.exists) throw new ScheduleError("找不到課程。", 404);
      const data = course.data()!;
      if (data.status === "cancelled" || data.status === "canceled") throw new ScheduleError("已取消的課程不能修改時間。");
      const oldStart = millis(data.startTime), oldEnd = millis(data.endTime);
      if (oldStart !== expectedStartTimeMillis || oldEnd !== expectedEndTimeMillis) throw new ScheduleError("課程時間已被其他操作修改，請關閉畫面重新開啟後再試。");
      if (oldStart === startTimeMillis && oldEnd === endTimeMillis) throw new ScheduleError("時間沒有變更。");
      // 以 classId 單欄查詢；同一交易內同步所有顯示課程時間的紀錄。
      const [bookings, waitlists, records] = await Promise.all([
        tx.get(adminDb.collection("bookings").where("classId", "==", classId)),
        tx.get(adminDb.collection("waitlists").where("classId", "==", classId)),
        tx.get(adminDb.collection("studentLessonRecords").where("classId", "==", classId)),
      ]);
      const recipients = new Set<string>();
      for (const doc of bookings.docs) {
        const booking = doc.data();
        if (booking.status === "booked" && typeof booking.userId === "string" && booking.userId && !booking.userId.includes("/")) recipients.add(booking.userId);
      }
      for (const doc of waitlists.docs) {
        const waiting = doc.data();
        if (waiting.status === "waiting" && typeof waiting.userId === "string" && waiting.userId && !waiting.userId.includes("/")) recipients.add(waiting.userId);
      }
      // 保持原子性；不讓大班級只更新部分會員。
      if (bookings.size + waitlists.size + records.size + recipients.size + 2 > 450) throw new ScheduleError("相關紀錄過多，請聯絡系統管理員處理，尚未修改時間。");
      const startTime = Timestamp.fromMillis(startTimeMillis), endTime = Timestamp.fromMillis(endTimeMillis);
      tx.update(classRef, { startTime, endTime, scheduleUpdatedAt: FieldValue.serverTimestamp(), scheduleUpdatedBy: uid });
      for (const doc of [...bookings.docs, ...waitlists.docs, ...records.docs]) {
        tx.update(doc.ref, { classStartTime: startTime, classEndTime: endTime, scheduleUpdatedAt: FieldValue.serverTimestamp() });
      }
      for (const userId of recipients) {
        tx.create(adminDb.collection("notifications").doc(`${logRef.id}_${userId}`), {
          userId, classId, type: "class_schedule_changed", title: "課程時間已調整", courseName: String(data.courseName ?? "課程"),
          body: `${String(data.courseName ?? "課程")} 時間已調整為 ${formatTime(startTimeMillis)}～${formatTime(endTimeMillis)}。原因：${reason.trim()}`,
          previousClassStartTime: data.startTime ?? null, classStartTime: startTime, classEndTime: endTime, isRead: false, createdAt: FieldValue.serverTimestamp(),
        });
      }
      tx.create(logRef, { classId, adminUid: uid, oldStartTimeMillis: oldStart, oldEndTimeMillis: oldEnd,
        newStartTimeMillis: startTimeMillis, newEndTimeMillis: endTimeMillis, reason: reason.trim(), notifiedStudents: recipients.size, createdAt: FieldValue.serverTimestamp() });
      return { alreadySaved: false, notifiedStudents: recipients.size };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("修改課程時間失敗：", error);
    if (isFirestoreQuotaError(error)) return NextResponse.json({ error: firestoreQuotaMessage, code: "FIRESTORE_QUOTA_EXCEEDED" }, { status: 503 });
    return NextResponse.json({ error: error instanceof ScheduleError ? error.message : "修改時間失敗，請稍後重試。" }, { status: error instanceof ScheduleError ? error.status : 500 });
  }
}
