import { NextRequest, NextResponse } from "next/server";
import { FieldPath, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { planLegacyCouponReconciliation } from "@/lib/legacyCouponReconciliation";

import { isFirestoreQuotaError, firestoreQuotaMessage } from "@/lib/firestoreQuota";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ")) return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
    let uid: string;
    try { uid = (await adminAuth.verifyIdToken(bearer.slice(7), true)).uid; }
    catch { return NextResponse.json({ error: "登入已失效，請重新登入。" }, { status: 401 }); }
    const adminRef = adminDb.collection("users").doc(uid);
    const admin = await adminRef.get();
    if (!admin.exists || admin.data()?.role !== "admin") return NextResponse.json({ error: "沒有管理員權限。" }, { status: 403 });
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "資料格式錯誤。" }, { status: 400 }); }
    if (!body || typeof body !== "object" || !["audit", "repair"].includes(body.action)) return NextResponse.json({ error: "請指定核對或補發操作。" }, { status: 400 });
    const safeId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("/");
    const inspect = (id: string, repair: boolean, legacySnapshot?: DocumentSnapshot) => adminDb.runTransaction(async tx => {
      if (repair) {
        const currentAdmin = await tx.get(adminRef);
        if (!currentAdmin.exists || currentAdmin.data()?.role !== "admin") throw Error("沒有管理員權限。");
      }
      // 純核對沿用本批快照；補發則必須在交易內重新讀取。
      const plan = await planLegacyCouponReconciliation(tx, adminDb, id, repair ? undefined : legacySnapshot);
      const created = repair ? plan.write(uid) : 0;
      return { ...plan.report, created };
    });
    if (body.action === "repair") {
      if (!safeId(body.legacyMemberId)) return NextResponse.json({ error: "舊會員編號不正確。" }, { status: 400 });
      const result = await inspect(body.legacyMemberId, true);
      return NextResponse.json({ success: true, result });
    }
    if (body.legacyMemberId !== undefined) {
      if (!safeId(body.legacyMemberId)) return NextResponse.json({ error: "舊會員編號不正確。" }, { status: 400 });
      return NextResponse.json({ results: [await inspect(body.legacyMemberId, false)], nextCursor: null });
    }
    if (body.cursor !== undefined && !safeId(body.cursor)) return NextResponse.json({ error: "分頁資料不正確。" }, { status: 400 });
    let query = adminDb.collection("legacyMembers").orderBy(FieldPath.documentId()).limit(20);
    if (body.cursor) query = query.startAfter(body.cursor);
    const page = await query.get();
    const results = [];
    for (let i = 0; i < page.docs.length; i += 4) {
      results.push(...await Promise.all(page.docs.slice(i, i + 4).map(doc => inspect(doc.id, false, doc))));
    }
    return NextResponse.json({ results, nextCursor: page.docs.length === 20 ? page.docs.at(-1)!.id : null });
  } catch (error) {
    console.error("舊會員優惠券核對失敗", error);
    if (isFirestoreQuotaError(error)) return NextResponse.json({ error: firestoreQuotaMessage, code: "FIRESTORE_QUOTA_EXCEEDED" }, { status: 503 });
    const forbidden = error instanceof Error && error.message === "沒有管理員權限。";
    return NextResponse.json({ error: forbidden ? error.message : "核對失敗，請稍後重試；沒有自動重發優惠券。" }, { status: forbidden ? 403 : 500 });
  }
}
