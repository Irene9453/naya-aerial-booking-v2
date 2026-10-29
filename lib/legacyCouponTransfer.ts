import {
  FieldValue,
  type Transaction,
  type Firestore,
  type DocumentReference,
} from "firebase-admin/firestore";

export type LegacyCoupon = {
  couponId: string;
  quantity: number;
};

export function parseLegacyCoupons(value: unknown): LegacyCoupon[] {
  if (value == null) return [];

  if (!Array.isArray(value) || value.length > 30) {
    throw new Error("INVALID_LEGACY_COUPONS");
  }

  const seen = new Set<string>();

  const coupons = value.map((entry): LegacyCoupon => {
    if (!entry || typeof entry !== "object") {
      throw new Error("INVALID_LEGACY_COUPONS");
    }

    const row = entry as Record<string, unknown>;
    const couponId = row.couponId;
    const quantity = row.quantity;

    if (
      typeof couponId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(couponId) ||
      !Number.isSafeInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > 30 ||
      seen.has(couponId)
    ) {
      throw new Error("INVALID_LEGACY_COUPONS");
    }

    seen.add(couponId);

    return {
      couponId,
      quantity: quantity as number,
    };
  });

  if (
    coupons.reduce((total, coupon) => total + coupon.quantity, 0) > 60
  ) {
    throw new Error("INVALID_LEGACY_COUPONS");
  }

  return coupons;
}

export async function prepareLegacyCouponTransfer(
  tx: Transaction,
  db: Firestore,
  uid: string,
  legacyMemberId: string,
  rawCoupons: unknown
) {
  const coupons = parseLegacyCoupons(rawCoupons);

  const items: Array<{
    ref: DocumentReference;
    data: Record<string, unknown>;
  }> = [];

  // 所有讀取必須在 Transaction 寫入之前完成。
  for (const coupon of coupons) {
    const templateRef = db
      .collection("coupons")
      .doc(coupon.couponId);

    const templateSnapshot = await tx.get(templateRef);

    if (!templateSnapshot.exists) {
      throw new Error("LEGACY_COUPON_NOT_FOUND");
    }

    const template = templateSnapshot.data() ?? {};
    const discountRate = template.discountRate;

    if (
      typeof discountRate !== "number" ||
      !Number.isFinite(discountRate) ||
      discountRate <= 0 ||
      discountRate > 1
    ) {
      throw new Error("INVALID_LEGACY_COUPONS");
    }

    for (let index = 1; index <= coupon.quantity; index++) {
      const ref = db.collection("userCoupons").doc(
        `legacy_${legacyMemberId}_${coupon.couponId}_${index}`
      );

      const existing = await tx.get(ref);

      if (existing.exists) {
        throw new Error("DUPLICATE_LEGACY_COUPON");
      }

      items.push({
        ref,
        data: {
          userId: uid,
          couponId: coupon.couponId,
          name: String(template.name ?? "優惠券"),
          type: String(template.type ?? "reward"),
          discountRate,
          status: "available",
          rewardCost: 0,
          source: "legacy_claim",
          legacyMemberId,
          issuedAt: FieldValue.serverTimestamp(),
          usedAt: null,
          purchaseRequestId: null,
        },
      });
    }
  }

  return {
    count: items.length,

    write() {
      for (const item of items) {
        tx.create(item.ref, item.data);
      }
    },
  };
}