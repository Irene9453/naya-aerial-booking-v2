import type { Transaction, DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { evaluateNewStudentEligibility, normalizeEligibilityPhone } from "@/lib/newStudentEligibilityPolicy";

/** Reads only. Call before ANY transaction writes. Never trust client eligibility flags. */
export async function readNewStudentEligibility(
  tx: Transaction, userId: string, user: DocumentData
) {
  const phone = normalizeEligibilityPhone(user.phoneNormalized ?? user.phone);
  const registry = phone ? await tx.get(adminDb.collection("phoneRegistry").doc(phone)) : null;
  const legacy = phone ? await tx.get(adminDb.collection("legacyMembers")
    .where("phoneNormalized", "==", phone)) : null;
  const claim = await tx.get(adminDb.collection("legacyClaimRequests").doc(userId));
  const sales = await tx.get(adminDb.collection("packageSales").where("studentId", "==", userId));
  return evaluateNewStudentEligibility({
    user, userId,
    registryOwner: registry?.data()?.userId,
    historyComplete: process.env.NAYA_LEGACY_HISTORY_COMPLETE === "true",
    hasLegacyMatch: Boolean(legacy && !legacy.empty),
    // A rejected legacy claim remains ambiguous; it does not prove new membership.
    hasLegacyClaim: claim.exists,
    hasRegularPurchase: sales.docs.some((sale) => sale.data().offerType !== "new_student"),
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
