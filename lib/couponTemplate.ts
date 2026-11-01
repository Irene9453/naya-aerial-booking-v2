export function couponTemplateFields(template: Record<string, unknown>) {
  const discountRate = template.discountRate;
  const minimum = template.minimumPackagePoints ?? 0;
  const maximum = template.maximumPackagePoints ?? null;
  if (typeof discountRate !== "number" || !Number.isFinite(discountRate) || discountRate <= 0 || discountRate > 1 ||
      !Number.isSafeInteger(minimum) || (minimum as number) < 0 ||
      (maximum !== null && (!Number.isSafeInteger(maximum) || (maximum as number) < (minimum as number)))) {
    throw new Error("INVALID_COUPON_TEMPLATE");
  }
  const name = typeof template.name === "string" ? template.name.trim() : "";
  if (!name) throw new Error("INVALID_COUPON_TEMPLATE");
  return { name, type: String(template.type ?? "reward"), discountRate,
    minimumPackagePoints: minimum as number, maximumPackagePoints: maximum as number | null };
}
