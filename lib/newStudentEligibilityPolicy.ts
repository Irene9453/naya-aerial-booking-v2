export type EligibilityStatus = "eligible" | "ineligible" | "pending";

export function normalizeEligibilityPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let phone = value.trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("+886")) phone = "0" + phone.slice(4);
  else if (phone.startsWith("886")) phone = "0" + phone.slice(3);
  return /^09\d{8}$/.test(phone) ? phone : null;
}

export function evaluateNewStudentEligibility(input: {
  user: Record<string, unknown>;
  historyComplete: boolean;
  registryOwner: unknown;
  userId: string;
  hasLegacyMatch: boolean;
  hasLegacyClaim: boolean;
  hasRegularPurchase: boolean;
}): { status: EligibilityStatus; reason: string } {
  const u = input.user;
  if (u.role !== "student") return { status: "ineligible", reason: "not_student" };
  if (u.legacyMemberId || u.legacyClaimedAt || u.legacyStatus === "claimed" ||
      input.hasLegacyMatch) {
    return { status: "ineligible", reason: "legacy_member" };
  }
  if (input.hasLegacyClaim) return { status: "pending", reason: "legacy_claim_review" };
  if (input.hasRegularPurchase) return { status: "ineligible", reason: "regular_purchase" };
  // An already consumed regular-package benefit must not be re-enabled.
  if (u.newStudentEligibilityVerified === true && u.isNewStudent !== true) {
    return { status: "ineligible", reason: "eligibility_consumed" };
  }
  if (!normalizeEligibilityPhone(u.phoneNormalized ?? u.phone) ||
      input.registryOwner !== input.userId) {
    return { status: "pending", reason: "phone_registry_mismatch" };
  }
  if (!input.historyComplete) return { status: "pending", reason: "history_incomplete" };
  return { status: "eligible", reason: "no_legacy_or_regular_purchase" };
}
