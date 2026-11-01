import type { Transaction, DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { evaluateNewStudentEligibility, normalizeEligibilityPhone, resolveLegacyPurchaseHistory } from "@/lib/newStudentEligibilityPolicy";

/** Reads only. Call before ANY transaction writes. Never trust client eligibility flags. */
export async function readNewStudentEligibility(tx: Transaction, userId: string, user: DocumentData) {
  const phone = normalizeEligibilityPhone(user.phoneNormalized ?? user.phone);
  const registry = phone ? await tx.get(adminDb.collection("phoneRegistry").doc(phone)) : null;
  const legacy = phone ? await tx.get(adminDb.collection("legacyMembers").where("phoneNormalized", "==", phone)) : null;
  const claim = await tx.get(adminDb.collection("legacyClaimRequests").doc(userId));
  const sales = await tx.get(adminDb.collection("packageSales").where("studentId", "==", userId));
  const records = new Map((legacy?.docs ?? []).map(doc => [doc.id, doc.data()]));
  const claimData = claim.data();
  const approved = claim.exists && claimData?.status === "approved" && claimData.uid === userId;
  const linkedIds = [user.legacyMemberId, approved ? claimData?.legacyMemberId : null].filter(value => value != null);
  let incomplete = false;
  let identityConflict = false;
  for (const id of new Set(linkedIds)) {
    if (typeof id !== "string" || !id || id.includes("/")) { incomplete = true; continue; }
    const record = await tx.get(adminDb.collection("legacyMembers").doc(id));
    if (!record.exists) { incomplete = true; continue; }
    if (record.data()?.claimedBy !== userId) identityConflict = true;
    records.set(id, record.data()!);
  }
  if ((user.legacyClaimedAt || user.legacyStatus === "claimed") && records.size === 0) incomplete = true;
  let hasRegularPurchase = sales.docs.some(sale => sale.data().offerType !== "new_student");
  for (const id of records.keys()) {
    const [oldSales, linkedSales] = await Promise.all([
      tx.get(adminDb.collection("packageSales").where("studentId", "==", id)),
      tx.get(adminDb.collection("packageSales").where("legacyMemberId", "==", id)),
    ]);
    if ([...oldSales.docs, ...linkedSales.docs].some(sale => sale.data().offerType !== "new_student")) hasRegularPurchase = true;
  }
  const history = resolveLegacyPurchaseHistory([...records.values()], userId, incomplete);
  return evaluateNewStudentEligibility({
    user, userId, registryOwner: registry?.data()?.userId,
    historyComplete: process.env.NAYA_LEGACY_HISTORY_COMPLETE === "true",
    hasLegacyMatch: records.size > 0,
    hasLegacyClaim: claim.exists,
    legacyClaimApproved: approved && typeof claimData?.legacyMemberId === "string" && records.has(claimData.legacyMemberId),
    legacyPurchaseHistory: identityConflict && history !== "purchased" ? "conflict" : history,
    hasRegularPurchase,
  });
}

export function eligibilityUserFields(result: { status: string; reason: string }) {
  return {
    isNewStudent: result.status === "eligible",
    newStudentEligibilityVerified: result.status !== "pending",
    newStudentEligibilityStatus: result.status,
    newStudentEligibilityReason: result.reason,
  };
}
