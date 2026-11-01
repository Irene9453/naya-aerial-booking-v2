export type EligibilityStatus = "eligible" | "ineligible" | "pending";
export type LegacyPurchaseHistory = "none" | "never_purchased" | "purchased" | "unknown" | "conflict";

export function normalizeEligibilityPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let phone = value.trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("+886")) phone = "0" + phone.slice(4);
  else if (phone.startsWith("886")) phone = "0" + phone.slice(3);
  return /^09\d{8}$/.test(phone) ? phone : null;
}

export function resolveLegacyPurchaseHistory(records: Record<string, unknown>[], userId: string, incomplete = false): LegacyPurchaseHistory {
  if (records.some(record => record.purchaseHistoryStatus === "purchased")) return "purchased";
  if (records.some(record => record.claimedBy && record.claimedBy !== userId)) return "conflict";
  if (incomplete) return "unknown";
  if (!records.length) return "none";
  return records.every(record => record.purchaseHistoryStatus === "never_purchased" &&
    typeof record.purchaseHistoryVerifiedBy === "string" && record.purchaseHistoryVerifiedBy.length > 0 && record.purchaseHistoryVerifiedAt != null)
    ? "never_purchased" : "unknown";
}

export function evaluateNewStudentEligibility(input: {
  user: Record<string, unknown>;
  historyComplete: boolean;
  registryOwner: unknown;
  userId: string;
  hasLegacyMatch: boolean;
  hasLegacyClaim: boolean;
  hasRegularPurchase: boolean;
  legacyPurchaseHistory?: LegacyPurchaseHistory;
  legacyClaimApproved?: boolean;
}): { status: EligibilityStatus; reason: string } {
  const u = input.user;
  if (u.role !== "student") return { status: "ineligible", reason: "not_student" };
  if (input.hasRegularPurchase) return { status: "ineligible", reason: "regular_purchase" };
  const hasLegacy = Boolean(u.legacyMemberId || u.legacyClaimedAt || u.legacyStatus === "claimed" || input.hasLegacyMatch);
  const legacyHistory = input.legacyPurchaseHistory ?? (hasLegacy ? "unknown" : "none");
  if (legacyHistory === "purchased") return { status: "ineligible", reason: "legacy_purchase" };
  if (legacyHistory === "conflict") return { status: "pending", reason: "legacy_identity_conflict" };
  if (legacyHistory === "unknown" || (hasLegacy && legacyHistory !== "never_purchased")) {
    return { status: "pending", reason: "legacy_purchase_history_pending" };
  }
  if (input.hasLegacyClaim && !input.legacyClaimApproved && legacyHistory !== "never_purchased") return { status: "pending", reason: "legacy_claim_review" };
  // Old "legacy_member" denials were based only on account existence. Recheck them
  // after verified purchase history is available; never reset a consumed benefit.
  const legacyOnlyDenial = legacyHistory === "never_purchased" && ["legacy_member", "legacy_purchase"].includes(String(u.newStudentEligibilityReason));
  if (u.newStudentEligibilityVerified === true && u.isNewStudent !== true && !legacyOnlyDenial) {
    return { status: "ineligible", reason: "eligibility_consumed" };
  }
  if (!normalizeEligibilityPhone(u.phoneNormalized ?? u.phone) || input.registryOwner !== input.userId) {
    return { status: "pending", reason: "phone_registry_mismatch" };
  }
  if (!input.historyComplete) return { status: "pending", reason: "history_incomplete" };
  return { status: "eligible", reason: "no_course_purchase" };
}
