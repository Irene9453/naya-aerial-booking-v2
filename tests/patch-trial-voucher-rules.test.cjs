const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { addVoucherRule, patch } = require('../scripts/patch-trial-voucher-rules.cjs');
const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Keep existing live permissions.
    match /users/{uid} { allow read: if request.auth.uid == uid; }
  }
}`;
function fixture(options = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'naya-rules-test-'));
  let reads = 0, release = 'old', updates = 0, creates = 0;
  const api = {
    listAllReleases: async () => [{ name: 'projects/naya-aerial-booking/releases/cloud.firestore', rulesetName: options.race && ++reads > 1 ? 'other' : release }],
    getRulesetContent: async () => [{ name: 'firestore.rules', content: options.source ?? source }],
    testRuleset: async () => ({ status: 200, body: { issues: options.invalid ? [{ severity: 'ERROR' }] : [] } }),
    createRuleset: async () => { creates++; return 'new'; },
    updateRelease: async (project, name, service) => { assert.equal(project, 'naya-aerial-booking'); assert.equal(service, 'cloud.firestore'); release = name; updates++; },
  };
  return { api, backupDir: path.join(parent, 'backup'), parent, get updates() { return updates; }, get creates() { return creates; } };
}
test('adds owner-only rule inside documents while preserving all original characters', () => {
  const updated = addVoucherRule(source);
  const added = updated.slice(source.indexOf('documents {') + 'documents {'.length, updated.indexOf('\n    // Keep existing'));
  assert.equal(updated.replace(added, ''), source);
  assert.match(added, /resource.data.userId == request.auth.uid/);
  assert.match(added, /allow create, update, delete: if false/);
});
test('braces and match statements in strings or comments do not confuse parser', () => {
  const input = source.replace('// Keep existing live permissions.', '// match /trialVouchers/{id} { }\n /* } */\n function x() { return "}"; }');
  assert.match(addVoucherRule(input), /Members can read only/);
});
test('existing voucher rule is never overwritten', () => assert.throws(() => addVoucherRule(source.replace('// Keep existing live permissions.', 'match /trialVouchers/{id} { allow read: if false; }')), /已有/));
test('missing or duplicate documents scope fails closed', () => {
  assert.throws(() => addVoucherRule('service cloud.firestore {}'), /無法唯一/);
  assert.throws(() => addVoucherRule(source + source), /無法唯一/);
});
test('malformed scope fails closed', () => assert.throws(() => addVoucherRule(source.slice(0, source.lastIndexOf('  }'))), /括號不完整/));
test('prepare backs up actual live source and does not publish', async () => {
  const f = fixture(); try {
    await patch({ ...f, publish: false });
    assert.equal(fs.readFileSync(path.join(f.backupDir, 'original.rules'), 'utf8'), source);
    assert.equal(f.updates, 0); assert.equal(f.creates, 0);
    assert.match(fs.readFileSync(path.join(f.backupDir, 'firebase.restore.json'), 'utf8'), /original.rules/);
  } finally { fs.rmSync(f.parent, { recursive: true }); }
});
test('publish preserves backup and verifies the selected default release', async () => {
  const f = fixture(); try {
    await patch({ ...f, publish: true });
    assert.equal(f.updates, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.backupDir, 'published.json'))).previousRuleset, 'old');
    assert.equal(fs.readFileSync(path.join(f.backupDir, 'original.rules'), 'utf8'), source);
  } finally { fs.rmSync(f.parent, { recursive: true }); }
});
test('compile errors do not publish or create rulesets', async () => {
  const f = fixture({ invalid: true }); try {
    await assert.rejects(patch({ ...f, publish: true }), /語法檢查未通過/);
    assert.equal(f.updates, 0); assert.equal(f.creates, 0);
  } finally { fs.rmSync(f.parent, { recursive: true }); }
});
test('concurrent changes prevent overwriting another release', async () => {
  const f = fixture({ race: true }); try {
    await assert.rejects(patch({ ...f, publish: true }), /已被其他操作更動/);
    assert.equal(f.updates, 0);
  } finally { fs.rmSync(f.parent, { recursive: true }); }
});
test('existing rules still get backed up before automatic modification stops', async () => {
  const f = fixture({ source: source.replace('// Keep existing live permissions.', 'match /trialVouchers/{id} { allow read: if false; }') }); try {
    await assert.rejects(patch({ ...f, publish: true }), /已有/);
    assert.ok(fs.existsSync(path.join(f.backupDir, 'original.rules')));
    assert.equal(f.updates, 0);
  } finally { fs.rmSync(f.parent, { recursive: true }); }
});
