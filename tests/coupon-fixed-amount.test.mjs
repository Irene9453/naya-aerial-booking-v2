import test from "node:test";
import assert from "node:assert/strict";
import { couponDiscountFields, couponDiscountAmount, couponDiscountLabel } from "../lib/couponDiscount.ts";

test("legacy percentage coupons still calculate 85% and 90%", () => {
  assert.equal(couponDiscountAmount(3000, { discountRate: 0.85 }), 450);
  assert.equal(couponDiscountAmount(3000, { discountRate: 0.9 }), 300);
  assert.equal(couponDiscountLabel({ discountRate: 0.7 }), "7 折");
});

test("fixed amount coupons reduce total by exactly 100 or 200", () => {
  assert.equal(couponDiscountAmount(1500, { discountType: "fixed_amount", fixedDiscountAmount: 100 }), 100);
  assert.equal(couponDiscountAmount(1500, { discountType: "fixed_amount", fixedDiscountAmount: 200 }), 200);
  assert.equal(couponDiscountLabel({ discountType: "fixed_amount", fixedDiscountAmount: 200 }), "折抵 NT$ 200");
});

test("fixed amount discount never makes a negative order total", () => {
  assert.equal(couponDiscountAmount(80, { discountType: "fixed_amount", fixedDiscountAmount: 200 }), 80);
  assert.equal(couponDiscountAmount(0, { discountType: "fixed_amount", fixedDiscountAmount: 200 }), 0);
});

test("invalid or unsafe discount definitions are rejected", () => {
  for (const value of [0, -100, 12.5, Number.MAX_SAFE_INTEGER, "100"]) {
    assert.throws(() => couponDiscountFields({ discountType: "fixed_amount", fixedDiscountAmount: value }));
  }
  assert.throws(() => couponDiscountFields({ discountRate: 1.2 }));
  assert.throws(() => couponDiscountFields({ discountType: "unknown", discountRate: 0.8 }));
});
