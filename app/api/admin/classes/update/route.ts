import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const safeId = (value: unknown) => typeof value === "string" &&
  /^[a-zA-Z0-9_-]{1,128}$/.test(value);
class ChangeError extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); }
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
  }
  let adminId: string;
  try { adminId = (await adminAuth.verifyIdToken(authorization.slice(7), true)).uid; }
  catch { return NextResponse.json({ error: "登入失效，請重新登入。" }, { status: 401 }); }
  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "更新資料格式錯誤。" }, { status: 400 }); }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "更新資料格式錯誤。" }, { status: 400 });
  }
  const fields = input as Record<string, unknown>;
  const classId = fields.classId;
  const operationId = fields.operationId;
  const courseName = typeof fields.courseName === "string" ? fields.courseName.trim() : "";
  const newStartMillis = Date.parse(typeof fields.startTimeIso === "string" ? fields.startTimeIso : "");
  if (!safeId(classId) || !safeId(operationId) ||
      courseName.length < 2 || courseName.length > 100 ||
      !Number.isFinite(newStartMillis) ||
      newStartMillis <= Date.now() + 60000 ||
      newStartMillis > Date.now() + 366 * 24 * 3600000) {
    return NextResponse.json({ error: "請輸入有效課程名稱及未來一年內的開始時間（至少晚於目前一分鐘）。" }, { status: 400 });
  }
  const cid = classId as string, opId = operationId as string;
  const ref = adminDb.collection("classes").doc(cid);
  const actionRef = adminDb.collection("classScheduleChanges").doc(opId);
  const newStart = Timestamp.fromMillis(newStartMillis);
  try {
    const result = await adminDb.runTransaction(async tx => {
      const adminRef = adminDb.collection("users").doc(adminId);
      const bookingQuery = adminDb.collection("bookings")
        .where("classId", "==", cid).where("status", "==", "booked");
      // All Firestore reads must precede every write.
      const [admin, course, action, bookings] = await Promise.all([
        tx.get(adminRef), tx.get(ref), tx.get(actionRef), tx.get(bookingQuery),
      ]);
      if (!admin.exists || admin.data()?.role !== "admin") {
        throw new ChangeError("沒有管理員權限。", 403);
      }
      if (action.exists) {
        const old = action.data()!;
        if (old.adminId === adminId && old.classId === cid &&
            old.courseName === courseName && old.startTimeMillis === newStartMillis) {
          return { alreadyDone: true, notified: old.notifiedCount ?? 0 };
        }
        throw new ChangeError("操作識別碼已經使用，請重新整理。");
      }
      if (!course.exists) throw new ChangeError("找不到課程。", 404);
      const data = course.data()!;
      if (data.status !== "open") throw new ChangeError("已取消或關閉的課程不可修改。");
      if (!(data.startTime instanceof Timestamp) || data.startTime.toMillis() <= Date.now()) {
        throw new ChangeError("已開始或已結束的課程不可修改。");
      }
      if (bookings.size > 80) throw new ChangeError("預約人數超出單次可安全更新的範圍，請聯絡系統管理員。");
      const nameChanged = String(data.courseName ?? "") !== courseName;
      const timeChanged = data.startTime.toMillis() !== newStartMillis;
      if (!nameChanged && !timeChanged) {
        return { alreadyDone: false, noChange: true, notified: 0 };
      }
      for (const booking of bookings.docs) {
        const value = booking.data();
        if (!safeId(value.userId) || value.classId !== cid) {
          throw new ChangeError("預約資料異常，為避免通知錯誤已停止修改。");
        }
      }
      let newEndTime: Timestamp | null = null;
      if (timeChanged && data.endTime instanceof Timestamp) {
        const duration = data.endTime.toMillis() - data.startTime.toMillis();
        if (duration <= 0 || duration > 12 * 3600000) {
          throw new ChangeError("課程結束時間異常，無法安全調整。");
        }
        newEndTime = Timestamp.fromMillis(newStartMillis + duration);
      }
      tx.update(ref, {
        courseName,
        startTime: newStart,
        ...(newEndTime ? { endTime: newEndTime } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: adminId,
      });
      const format = (ms: number) => new Date(ms).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
        weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      });
      const description = `課程資訊有異動：${String(data.courseName ?? "")}（原 ${format(data.startTime.toMillis())}）→ ${courseName}（新 ${format(newStartMillis)}）。請確認最新上課時間。`;
      for (const booking of bookings.docs) {
        const userId = booking.data().userId as string;
        tx.update(booking.ref, {
          courseName, classStartTime: newStart,
          scheduleUpdatedAt: FieldValue.serverTimestamp(),
          scheduleUpdatedBy: adminId,
        });
        tx.create(adminDb.collection("notifications").doc(`class_update_${opId}_${booking.id}`), {
          userId, type: "class_update",
          title: "📅 你預約的課程資訊已更新",
          body: description,
          classId: cid,
          bookingId: booking.id,
          classStartTime: newStart,
          courseName,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      tx.create(actionRef, {
        adminId, classId: cid, operationId: opId,
        previousName: String(data.courseName ?? ""),
        previousStartTimeMillis: data.startTime.toMillis(),
        courseName, startTimeMillis: newStartMillis,
        notifiedCount: bookings.size,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { alreadyDone: false, noChange: false, notified: bookings.size };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("管理員修改課程時間或名稱失敗", error);
    return NextResponse.json({ error: "課程更新失敗，請稍後重試。" }, { status: 500 });
  }
}
