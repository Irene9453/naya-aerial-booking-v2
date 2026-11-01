const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { releaseTransform } = require('../scripts/publish-production-rules.cjs');
const desired = fs.readFileSync(path.join(__dirname, '../firestore.production.rules'), 'utf8');
test('only the tested release rules are accepted', () => {
  assert.throws(() => releaseTransform(desired + '// changed'), /SHA256/);
});
test('unreviewed live changes are not overwritten', () => {
  assert.throws(() => releaseTransform(desired)('rules_version = "2"; // unknown'), /未核對/);
});
test('the already published target is accepted', () => {
  assert.equal(releaseTransform(desired)(desired.trim()), desired);
});
