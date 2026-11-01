export const NEW_STUDENT_OFFERS = {
  trial_yoga: {
    name: "新生空中瑜伽單堂體驗",
    price: 320,
    regularPrice: 450,
    points: 0,
    entitlement: "yoga",
  },
  trial_aerial: {
    name: "新生舞綢／空環單堂體驗",
    price: 450,
    regularPrice: 600,
    points: 0,
    entitlement: "aerial",
  },
  starter_12: {
    name: "新生 12 點大禮包",
    price: 1260,
    regularPrice: 1800,
    points: 12,
    entitlement: null,
  },
} as const;

export type NewStudentOfferId =
  keyof typeof NEW_STUDENT_OFFERS;

export function isNewStudentOfferId(
  value: unknown
): value is NewStudentOfferId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      NEW_STUDENT_OFFERS,
      value
    )
  );
}

// Share one eligibility policy between submission and payment approval.
export function isEligibleNewStudent(user: Record<string, unknown>) {
  return user.role === "student" && user.isNewStudent === true &&
    user.newStudentEligibilityVerified === true &&
    !user.legacyMemberId && !user.legacyClaimedAt &&
    user.legacyStatus !== "claimed";
}

export function hasPurchasedNewStudentOffer(
  user: Record<string, unknown>, offerId: NewStudentOfferId
) {
  const purchases = user.newStudentOfferPurchases;
  return purchases !== null && typeof purchases === "object" &&
    (purchases as Record<string, unknown>)[offerId] === true;
}
