const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const moduleObject = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, "../lib/classDuplicateGuard.ts"), "utf8");
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  module: moduleObject, exports: moduleObject.exports,
});
const { classifyMatchingClasses } = moduleObject.exports;

test("cancelled historical session does not block re-creating the slot", () => {
  const result = classifyMatchingClasses([{ id: "old1", status: "cancelled" }]);
  assert.equal(result.blocked, false);
  assert.equal(result.cancelled, 1);
  assert.deepEqual(Array.from(result.blockingIds), []);
});
test("open session blocks duplicate booking creation", () => {
  const result = classifyMatchingClasses([{ id: "live1", status: "open" }]);
  assert.equal(result.blocked, true);
  assert.deepEqual(Array.from(result.blockingIds), ["live1"]);
});
test("unknown or missing status fails closed", () => {
  for (const value of ["", undefined, "draft"]) {
    assert.equal(classifyMatchingClasses([{ id: "unknown", status: value }]).blocked, true);
  }
});
test("mixed cancelled and live sessions still block creation", () => {
  const result = classifyMatchingClasses([
    { id: "cancelled1", status: "admin_cancelled" },
    { id: "live", status: "open" },
  ]);
  assert.equal(result.blocked, true);
  assert.equal(result.cancelled, 1);
  assert.deepEqual(Array.from(result.blockingIds), ["live"]);
});
test("no records allow new class", () => {
  assert.equal(classifyMatchingClasses([]).blocked, false);
});
