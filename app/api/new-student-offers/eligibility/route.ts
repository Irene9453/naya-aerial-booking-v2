import { NEW_STUDENT_OFFERS, hasPurchasedNewStudentOffer, type NewStudentOfferId } from "@/lib/newStudentOffers";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { readNewStudentEligibility, eligibilityUserFields } from "@/lib/newStudentEligibility";

export const runtime = "nodejs";

// POST because this refreshes the server-owned eligibility fields.
export async function POST(request: NextRequest) {
  try {
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
    }
    const { uid } = await adminAuth.verifyIdToken(bearer.slice(7));
    const authUser = await adminAuth.getUser(uid);
    if (!authUser.emailVerified) {
      return NextResponse.json({ status: "pending", reason: "email_unverified" }, { status: 403 });
    }
    const userRef = adminDb.collection("users").doc(uid);
    const result = await adminDb.runTransaction(async (tx) => {
      const snapshot = await tx.get(userRef);
      if (!snapshot.exists) return null;
      const result = await readNewStudentEligibility(tx, uid, snapshot.data()!);
      const unavailableOfferIds: NewStudentOfferId[] = [];
      for (const id of Object.keys(NEW_STUDENT_OFFERS) as NewStudentOfferId[]) {
        const key = `new_student_${uid}_${id}`;
        const claim = await tx.get(adminDb.collection("newStudentOfferClaims").doc(key));
        const requestId = claim.data()?.requestId;
        const linked = typeof requestId === "string"
          ? await tx.get(adminDb.collection("purchaseRequests").doc(requestId)) : null;
        const oldOrder = await tx.get(adminDb.collection("purchaseRequests").doc(key));
        if (hasPurchasedNewStudentOffer(snapshot.data()!, id) ||
            (linked?.exists && linked.data()?.status !== "rejected") ||
            (oldOrder.exists && oldOrder.data()?.status !== "rejected")) unavailableOfferIds.push(id);
      }
      tx.update(userRef, eligibilityUserFields(result));
      return { ...result, unavailableOfferIds };
    });
    if (!result) return NextResponse.json({ error: "找不到會員資料" }, { status: 404 });
    return NextResponse.json({ ...result, purchasingEnabled: process.env.NAYA_NEW_STUDENT_APPROVAL_ENABLED === "true" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code.startsWith("auth/")) return NextResponse.json({ error: "登入已失效，請重新登入" }, { status: 401 });
    console.error("更新新生資格失敗", error);
    return NextResponse.json({ error: "暫時無法確認新生優惠資格" }, { status: 500 });
  }
}
