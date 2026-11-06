import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { validateAvailableTrialVoucher } from "@/lib/trialVoucherBooking";

export const runtime = "nodejs";
export const maxDuration = 60;

// Match the existing student-booking rollout controls. This API never enables booking globally.
const demoEmulator = process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "demo-naya-aerial" &&
  process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099";

const known = new Set([
  "沒有管理員操作權限。", "找不到學生會員。", "找不到課程資料。",
  "已經預約過這堂課。", "這堂課已有無法重新預約的紀錄。",
  "這堂課目前無法預約。", "這堂課已滿班或名額設定不正確。",
  "課程點數設定不正確。", "會員點數資料異常。", "點數不足，無法預約。",
  "課程時間設定不正確。", "此課程已開始，無法預約。",
  "找不到有效的體驗券", "體驗券不屬於此會員",
  "體驗券已使用或無法預約", "這堂課不適用新生體驗券",
  "體驗券與課程種類不符", "體驗券商品資料不正確", "體驗券識別碼不正確",
]);
const safeId = (value: unknown) => typeof value === "string" &&
  value.length >= 1 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value);

export async function POST(request: NextRequest) {
  if (!demoEmulator && process.env.NAYA_BOOKING_LIVE !== "true") {
    return NextResponse.json({ error: "新系統預約功能尚未開放。" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
  let adminId: string;
  try { adminId = (await adminAuth.verifyIdToken(header.slice(7), true)).uid; }
  catch { return NextResponse.json({ error: "登入已失效，請重新登入。" }, { status: 401 }); }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "預約資料格式不正確。" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "預約資料格式不正確。" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const studentId = input.studentId, classId = input.classId;
  const method = input.paymentType === "trial_voucher" ? "trial_voucher" : input.paymentType === "points" ? "points" : null;
  if (!safeId(studentId) || !safeId(classId) || !method ||
      (input.trialVoucherId !== undefined && !safeId(input.trialVoucherId)) ||
      (method === "trial_voucher" && (!safeId(input.trialVoucherId) || !demoEmulator && process.env.NAYA_TRIAL_BOOKING_ENABLED !== "true")) ||
      (method === "points" && input.trialVoucherId !== undefined)) {
    return NextResponse.json({ error: "請選擇有效學生、課程與扣款方式；體驗券預約須已正式開放。" }, { status: 400 });
  }
  const uid = studentId as string, cid = classId as string;
  const bookingId = `${uid}_${cid}`;
  const adminRef = adminDb.collection("users").doc(adminId);
  const memberRef = adminDb.collection("users").doc(uid);
  const classRef = adminDb.collection("classes").doc(cid);
  const bookingRef = adminDb.collection("bookings").doc(bookingId);
  const waitlistRef = adminDb.collection("waitlists").doc(bookingId);
  const voucherId = method === "trial_voucher" ? input.trialVoucherId as string : null;
  const voucherRef = voucherId ? adminDb.collection("trialVouchers").doc(voucherId) : null;
  try {
    const result = await adminDb.runTransaction(async tx => {
      // Read everything before mutating any document; Firestore retries concurrent bookings safely.
      const [admin, member, session, prior, waitlist, voucher] = await Promise.all([
        tx.get(adminRef), tx.get(memberRef), tx.get(classRef), tx.get(bookingRef),
        tx.get(waitlistRef), voucherRef ? tx.get(voucherRef) : Promise.resolve(null),
      ]);
      if (!admin.exists || admin.data()?.role !== "admin") throw Error("沒有管理員操作權限。");
      if (!member.exists || member.data()?.role !== "student") throw Error("找不到學生會員。");
      if (!session.exists) throw Error("找不到課程資料。");
      if (prior.exists) {
        if (prior.data()?.status === "booked") throw Error("已經預約過這堂課。");
        if (!["cancelled", "admin_cancelled"].includes(String(prior.data()?.status))) {
          throw Error("這堂課已有無法重新預約的紀錄。");
        }
      }
      const course = session.data()!, person = member.data()!;
      if (course.status !== "open") throw Error("這堂課目前無法預約。");
      const capacity = Number(course.capacity), booked = Number(course.bookedCount);
      const required = Number(course.pointsRequired), balance = Number(person.points);
      if (!Number.isSafeInteger(capacity) || capacity <= 0 ||
          !Number.isSafeInteger(booked) || booked < 0 || booked >= capacity) {
        throw Error("這堂課已滿班或名額設定不正確。");
      }
      if (!Number.isSafeInteger(required) || required <= 0) throw Error("課程點數設定不正確。");
      if (!Number.isSafeInteger(balance) || balance < 0) throw Error("會員點數資料異常。");
      if (!(course.startTime instanceof Timestamp)) throw Error("課程時間設定不正確。");
      if (course.startTime.toMillis() <= Date.now()) throw Error("此課程已開始，無法預約。");
      let remainingPoints = balance;
      let offerId: string | null = null;
      if (voucherRef && voucherId) {
        if (course.category === "special") throw Error("這堂課不適用新生體驗券");
        validateAvailableTrialVoucher({
          voucherId, voucher: voucher?.data(), userId: uid, courseName: course.courseName,
        });
        offerId = String(voucher!.data()!.offerId);
      } else {
        if (balance < required) throw Error("點數不足，無法預約。");
        remainingPoints -= required;
      }
      if (voucherRef) {
        tx.update(voucherRef, {
          status: "used", quantity: 0, bookingId,
          usedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(memberRef, { points: remainingPoints });
      }
      tx.update(classRef, { bookedCount: booked + 1 });
      tx.set(bookingRef, {
        userId: uid, classId: cid, courseName: String(course.courseName ?? ""),
        classStartTime: course.startTime, paymentType: method,
        trialVoucherId: voucherId, trialOfferId: offerId,
        pointsUsed: method === "points" ? required : 0,
        status: "booked", createdAt: FieldValue.serverTimestamp(),
        cancelledAt: null, pointsRefunded: 0,
        bookedByAdminId: adminId, bookingSource: "admin_on_behalf",
      });
      if (waitlist.exists && waitlist.data()?.status === "waiting") {
        tx.update(waitlistRef, { status: "converted", convertedAt: FieldValue.serverTimestamp() });
      }
      if (!voucherRef) {
        tx.create(adminDb.collection("pointTransactions").doc(), {
          userId: uid, bookingId, classId: cid, courseName: String(course.courseName ?? ""),
          classStartTime: course.startTime, type: "booking",
          amount: -required, balanceAfter: remainingPoints,
          createdAt: FieldValue.serverTimestamp(), adminId,
        });
      }
      tx.create(adminDb.collection("notifications").doc(), {
        userId: uid, type: "booking", title: "老師已替你預約課程",
        body: `老師已替你預約 ${String(course.courseName ?? "")}`,
        classId: cid, bookingId, courseName: String(course.courseName ?? ""),
        classStartTime: course.startTime, isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { bookingId, studentId: uid, remainingPoints, paymentType: method };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!known.has(message)) console.error("管理員代約失敗", error);
    return NextResponse.json({ error: known.has(message) ? message : "預約處理失敗，請稍後再試。" },
      { status: known.has(message) ? 400 : 500 });
  }
}
