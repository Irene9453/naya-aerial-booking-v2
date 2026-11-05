import test from "node:test";
import assert from "node:assert/strict";
import { isPastNormalCancellationDeadline } from "../lib/bookingCancellationNotice.ts";

const ms = (iso) => Date.parse(iso);
const classAt = (iso) => new Date(iso);

test("Sunday class: prior day 23:59 has no warning; class day midnight does", () => {
  const classStart = classAt("2026-11-08T13:30:00+08:00");
  assert.equal(isPastNormalCancellationDeadline(classStart, ms("2026-11-07T23:59:00+08:00")), false);
  assert.equal(isPastNormalCancellationDeadline(classStart, ms("2026-11-08T00:00:00+08:00")), true);
  assert.equal(isPastNormalCancellationDeadline(classStart, ms("2026-11-08T13:00:00+08:00")), true);
});

test("month boundary: May 1 class becomes non-cancellable on May 1 at midnight", () => {
  const classStart = classAt("2027-05-01T18:00:00+08:00");
  assert.equal(isPastNormalCancellationDeadline(classStart, ms("2027-04-30T23:59:59+08:00")), false);
  assert.equal(isPastNormalCancellationDeadline(classStart, ms("2027-05-01T00:00:00+08:00")), true);
});

test("year boundary: January 1 class becomes non-cancellable at midnight", () => {
  const classStart = classAt("2027-01-01T11:00:00+08:00");
  assert.equal(isPastNormalCancellationDeadline(classStart, ms("2026-12-31T23:59:59+08:00")), false);
  assert.equal(isPastNormalCancellationDeadline(classStart, ms("2027-01-01T00:00:00+08:00")), true);
});
