import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

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
    if (!body || typeof body !== "object" || typeof body.legacyMemberId !== "string" || !body.legacyMemberId || body.legacyMemberId.length > 200 || body.legacyMemberId.includes("/") ||
        !["unknown", "never_purchased", "purchased"].includes(body.status) || typeof body.evidence !== "string" || body.evidence.trim().length < 10 || body.evidence.trim().length > 500) {
      return NextResponse.json({ error: "請選擇購課狀態，並填寫 10～500 字的核對依據。" }, { status: 400 });
    }
    const ref = adminDb.collection("legacyMembers").doc(body.legacyMemberId);
    await adminDb.runTransaction(async tx => {
      const currentAdmin = await tx.get(adminRef);
      if (!currentAdmin.exists || currentAdmin.data()?.role !== "admin") throw Error("沒有管理員權限。");
      const legacy = await tx.get(ref);
      if (!legacy.exists) throw Error("找不到舊會員資料。");
      if (body.status === "never_purchased") {
        const ids = new Set([ref.id, legacy.data()?.claimedBy].filter(id => typeof id === "string" && id.length > 0));
        const linkedSales = await tx.get(adminDb.collection("packageSales").where("legacyMemberId", "==", ref.id));
        if (linkedSales.docs.some(sale => sale.data().offerType !== "new_student")) throw Error("已有購課紀錄，不能標示為從未購課。");
        for (const id of ids) {
          const sales = await tx.get(adminDb.collection("packageSales").where("studentId", "==", id));
          if (sales.docs.some(sale => sale.data().offerType !== "new_student")) throw Error("已有購課紀錄，不能標示為從未購課。");
        }
      }
      const log = adminDb.collection("legacyPurchaseHistoryLogs").doc();
      tx.create(log, { legacyMemberId: ref.id, adminId: uid,
        previousStatus: legacy.data()?.purchaseHistoryStatus ?? "unknown",
        previousEvidence: legacy.data()?.purchaseHistoryEvidence ?? null,
        status: body.status, evidence: body.evidence.trim(), createdAt: FieldValue.serverTimestamp() });
      tx.update(ref, { purchaseHistoryStatus: body.status, purchaseHistoryEvidence: body.evidence.trim(),
        purchaseHistoryVerifiedBy: uid, purchaseHistoryVerifiedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("確認舊會員購課紀錄失敗", error);
    const message = error instanceof Error ? error.message : "";
    const status = message === "沒有管理員權限。" ? 403 : message === "找不到舊會員資料。" ? 404 : message === "已有購課紀錄，不能標示為從未購課。" ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? "儲存失敗，請稍後重試。" : message }, { status });
  }
}
