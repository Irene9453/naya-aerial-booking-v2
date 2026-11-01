import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { NextResponse, type NextRequest } from "next/server";
export class CouponApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function couponApiUser(request: NextRequest, admin = false) {
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) throw new CouponApiError("請先登入。", 401);
  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(token.slice(7), true)).uid; }
  catch { throw new CouponApiError("登入已失效，請重新登入。", 401); }
  if (admin) { const member = await adminDb.collection("users").doc(uid).get(); if (member.data()?.role !== "admin") throw new CouponApiError("沒有管理員權限。", 403); }
  return uid;
}
export function couponApiFailure(error: unknown) {
  console.error("優惠券操作失敗", error);
  return NextResponse.json({ error: error instanceof CouponApiError ? error.message : "操作失敗，請稍後重試。" }, { status: error instanceof CouponApiError ? error.status : 500 });
}
export function safeCouponId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length < 600 && value !== "." && value !== ".." && !value.includes("/"); }
