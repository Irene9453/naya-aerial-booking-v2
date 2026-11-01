/* Run locally with the existing Firebase CLI login. Never reads or prints keys. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const PROJECT = 'naya-aerial-booking';
const RELEASE = `projects/${PROJECT}/releases/cloud.firestore`;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// Preserve offsets while ignoring braces and match statements in comments/strings.
function mask(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    value => value.replace(/[^\r\n]/g, ' '));
}
function addVoucherRule(source) {
  const clean = mask(source);
  if (/\bmatch\s+\/trialVouchers\//.test(clean)) {
    throw Error('線上已有 trialVouchers 規則；已備份，但不自動覆寫。請提供備份的 .rules 檔核對。');
  }
  const blocks = [...clean.matchAll(/\bmatch\s+\/databases\/\{[^}\r\n]+\}\/documents\s*\{/g)];
  if (blocks.length !== 1) throw Error('無法唯一識別 Firestore documents 區塊，未修改。');
  const start = blocks[0].index + blocks[0][0].length;
  let depth = 1, end = start;
  while (end < clean.length && depth) {
    if (clean[end] === '{') depth++;
    if (clean[end] === '}') depth--;
    end++;
  }
  if (depth) throw Error('規則括號不完整，未修改。');
  const rule = '\n    // Members can read only their own trial vouchers; writes stay server-only.\n' +
    '    match /trialVouchers/{voucherId} {\n' +
    '      allow get, list: if request.auth != null\n' +
    '        && resource.data.userId == request.auth.uid;\n' +
    '      allow create, update, delete: if false;\n' +
    '    }\n';
  // Insert immediately after the documents opening brace; preserve all existing text.
  return source.slice(0, start) + rule + source.slice(start);
}
async function patch({ api, backupDir, publish }) {
  const current = async () => {
    const releases = await api.listAllReleases(PROJECT);
    const release = releases.find(value => value.name === RELEASE);
    if (!release?.rulesetName) throw Error('找不到 default Firestore 的線上規則，停止。');
    return release;
  };
  const release = await current();
  const files = await api.getRulesetContent(release.rulesetName);
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0].content !== 'string') {
    throw Error('線上規則不是單一原始檔，停止自動修改。');
  }
  fs.mkdirSync(backupDir, { recursive: false });
  const original = files[0].content;
  fs.writeFileSync(path.join(backupDir, 'original.rules'), original);
  fs.writeFileSync(path.join(backupDir, 'firebase.restore.json'), JSON.stringify({ firestore: { rules: 'original.rules' } }, null, 2));
  fs.writeFileSync(path.join(backupDir, 'backup.json'), JSON.stringify({ projectId: PROJECT, release, sha256: sha(original), downloadedAt: new Date().toISOString() }, null, 2));
  console.log(`線上原始規則已備份：${backupDir}`);
  console.log(`備份 SHA256：${sha(original)}`);
  const updated = addVoucherRule(original);
  fs.writeFileSync(path.join(backupDir, 'patched.rules'), updated);
  const proposed = [{ ...files[0], content: updated }];
  const tested = await api.testRuleset(PROJECT, proposed);
  if (tested.status !== 200 || tested.body?.issues?.some(issue => issue.severity === 'ERROR')) {
    throw Error('Firebase 規則語法檢查未通過，未發布。請查看備份的 patched.rules。');
  }
  if (!publish) {
    console.log('修改與語法檢查完成；未發布（需要 --publish）。');
    return { backupDir, published: false };
  }
  const newRuleset = await api.createRuleset(PROJECT, proposed);
  if ((await current()).rulesetName !== release.rulesetName) {
    throw Error('備份後線上規則已被其他操作更動，停止發布，避免覆蓋。');
  }
  const publishInfo = { projectId: PROJECT, previousRuleset: release.rulesetName, newRuleset, attemptedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(backupDir, 'publish-attempt.json'), JSON.stringify(publishInfo, null, 2));
  await api.updateRelease(PROJECT, newRuleset, 'cloud.firestore');
  if ((await current()).rulesetName !== newRuleset) throw Error('發布後版本核對不一致，請查看 Firebase 控制台。');
  fs.writeFileSync(path.join(backupDir, 'published.json'), JSON.stringify({ ...publishInfo, verifiedAt: new Date().toISOString(), sha256: sha(updated) }, null, 2));
  console.log('發布成功：只新增會員讀取自己體驗券的權限；其餘原始規則保留。');
  console.log('如需還原，執行：');
  console.log(`firebase deploy --only firestore:rules --project ${PROJECT} --config "${path.join(backupDir, 'firebase.restore.json')}"`);
  return { backupDir, published: true };
}
async function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--firebase-tools-root');
  if (rootIndex < 0 || !args[rootIndex + 1]) throw Error('缺少 --firebase-tools-root，請使用提供的 PowerShell 指令。');
  const cliRoot = path.resolve(args[rootIndex + 1]);
  const auth = require(path.join(cliRoot, 'lib/auth.js'));
  const { requireAuth } = require(path.join(cliRoot, 'lib/requireAuth.js'));
  const api = require(path.join(cliRoot, 'lib/gcp/rules.js'));
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw Error('此電腦尚未登入 Firebase CLI，請先執行 firebase login。');
  const options = { project: PROJECT, nonInteractive: true };
  auth.setActiveAccount(options, account);
  await requireAuth(options);
  const backupDir = path.join(os.homedir(), `naya-live-rules-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await patch({ api, backupDir, publish: args.includes('--publish') });
}
module.exports = { mask, addVoucherRule, patch };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
