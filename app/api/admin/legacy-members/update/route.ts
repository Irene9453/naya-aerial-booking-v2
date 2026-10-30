import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { parseLegacyCoupons } from "@/lib/legacyCouponTransfer";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

async function requireAdmin(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const decoded = await adminAuth.verifyIdToken(header.slice(7));
  const user = await adminDb.collection("users").doc(decoded.uid).get();
  if (!user.exists || user.data()?.role !== "admin") throw new Error("FORBIDDEN");
  return decoded.uid;
}
const phoneOf = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const id = String(body.legacyMemberId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const phone = phoneOf(body.phone);
    const y = Number(body.birthdayYear), m = Number(body.birthdayMonth), d = Number(body.birthdayDay);
    const points = Number(body.points), rewardPoints = Number(body.rewardPoints);
    if (!id || !name) return NextResponse.json({ error: "姓名與會員資料不可空白。" }, { status: 400 });
    if (!/^09\d{8}$/.test(phone)) return NextResponse.json({ error: "手機號碼格式不正確。" }, { status: 400 });
    const date = new Date(y, m - 1, d);
    if (!Number.isInteger(y) || y < 1900 || y > 2100 || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return NextResponse.json({ error: "生日格式不正確。" }, { status: 400 });
    if (!Number.isInteger(points) || points < 0 || !Number.isInteger(rewardPoints) || rewardPoints < 0) return NextResponse.json({ error: "點數必須是 0 以上整數。" }, { status: 400 });
    // 未提供 coupons 時保留原資料；有提供時驗證優惠券格式。
    const coupons = Object.prototype.hasOwnProperty.call(body, "coupons")
      ? parseLegacyCoupons(body.coupons)
      : undefined;
    const ref = adminDb.collection("legacyMembers").doc(id);
    await adminDb.runTransaction(async (tx) => {
      const [snap, duplicate] = await Promise.all([tx.get(ref), tx.get(adminDb.collection("legacyMembers").where("phoneNormalized", "==", phone))]);
      if (!snap.exists) throw new Error("NOT_FOUND");
      if (snap.data()?.status !== "unclaimed") throw new Error("LOCKED");
      if (duplicate.docs.some((doc) => doc.id !== id)) throw new Error("DUPLICATE_PHONE");
      tx.update(ref, { name, phone, phoneNormalized: phone, birthdayYear: y, birthdayMonth: m, birthdayDay: d, points, rewardPoints, ...(coupons !== undefined ? { coupons } : {}), updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const map: Record<string, [string, number]> = { UNAUTHORIZED: ["請先登入管理員帳號。",401], FORBIDDEN:["只有管理員可以執行此操作。",403], NOT_FOUND:["找不到舊會員資料。",404], LOCKED:["此會員已完成認領，不能再修改。",409], DUPLICATE_PHONE:["這支手機號碼已存在於其他舊會員資料。",409] };
    const hit = map[message];
    console.error("更新舊會員失敗：", error);
    return NextResponse.json({ error: hit?.[0] ?? "更新舊會員資料失敗。" }, { status: hit?.[1] ?? 500 });
  }
}
