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
    user.newStudentEligibilityVerified === true;
}

export function hasPurchasedNewStudentOffer(
  user: Record<string, unknown>, offerId: NewStudentOfferId
) {
  const purchases = user.newStudentOfferPurchases;
  return purchases !== null && typeof purchases === "object" &&
    (purchases as Record<string, unknown>)[offerId] === true;
}

// Canonical ordering makes retries and differently ordered selections share an ID.
export function parseNewStudentOfferIds(value: unknown): NewStudentOfferId[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3 ||
      !value.every(isNewStudentOfferId) || new Set(value).size !== value.length) return null;
  return [...value].sort();
}

export function summarizeNewStudentOffers(ids: NewStudentOfferId[]) {
  return {
    name: ids.map(id => NEW_STUDENT_OFFERS[id].name).join("＋"),
    price: ids.reduce((sum, id) => sum + NEW_STUDENT_OFFERS[id].price, 0),
    points: ids.reduce((sum, id) => sum + NEW_STUDENT_OFFERS[id].points, 0),
    vouchers: ids.filter(id => NEW_STUDENT_OFFERS[id].points === 0).length,
  };
}
