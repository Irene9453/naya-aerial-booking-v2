export type CouponDiscount = {
  discountType: "percentage" | "fixed_amount";
  discountRate: number;
  fixedDiscountAmount: number;
};

/** Legacy coupons without discountType continue to use their percentage discount. */
export function couponDiscountFields(coupon: Record<string, unknown>): CouponDiscount {
  const discountType = coupon.discountType ?? "percentage";
  if (discountType === "fixed_amount") {
    const amount = coupon.fixedDiscountAmount;
    if (!Number.isSafeInteger(amount) || (amount as number) <= 0 || (amount as number) > 1000000) {
      throw new Error("INVALID_COUPON_DISCOUNT");
    }
    return { discountType: "fixed_amount", discountRate: 1, fixedDiscountAmount: amount as number };
  }
  if (discountType !== "percentage") throw new Error("INVALID_COUPON_DISCOUNT");
  const rate = coupon.discountRate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 1) {
    throw new Error("INVALID_COUPON_DISCOUNT");
  }
  return { discountType: "percentage", discountRate: rate, fixedDiscountAmount: 0 };
}

export function couponDiscountAmount(price: number, coupon: Record<string, unknown>): number {
  if (!Number.isSafeInteger(price) || price < 0) throw new Error("INVALID_COUPON_PRICE");
  const discount = couponDiscountFields(coupon);
  return discount.discountType === "fixed_amount"
    ? Math.min(price, discount.fixedDiscountAmount)
    : Math.round(price * (1 - discount.discountRate));
}

export function couponDiscountLabel(coupon: Record<string, unknown>): string {
  const discount = couponDiscountFields(coupon);
  return discount.discountType === "fixed_amount"
    ? `折抵 NT$ ${discount.fixedDiscountAmount.toLocaleString("en-US")}`
    : `${Number((discount.discountRate * 10).toFixed(2))} 折`;
}
