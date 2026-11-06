import { couponDiscountFields } from "@/lib/couponDiscount";
export function couponTemplateFields(template: Record<string, unknown>) {
  const discount = couponDiscountFields(template);
  const minimum = template.minimumPackagePoints ?? 0;
  const maximum = template.maximumPackagePoints ?? null;
  if (!Number.isSafeInteger(minimum) || (minimum as number) < 0 ||
      (maximum !== null && (!Number.isSafeInteger(maximum) || (maximum as number) < (minimum as number)))) {
    throw new Error("INVALID_COUPON_TEMPLATE");
  }
  const name = typeof template.name === "string" ? template.name.trim() : "";
  if (!name) throw new Error("INVALID_COUPON_TEMPLATE");
  return { name, type: String(template.type ?? "reward"), ...discount,
    minimumPackagePoints: minimum as number, maximumPackagePoints: maximum as number | null };
}
