const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { patch } = require('./patch-trial-voucher-rules.cjs');
const PROJECT = 'naya-aerial-booking';
const EXPECTED = 'c5c30de3785baef0fa371c20393c84f91852e490ed5a5d839cfaecb1cbf63318';
const KNOWN_LIVE = new Set([
  '8615f7f5bcbb64a6289bc41c1616d874751f56c66a44651245a1d93debcaac7b',
  '3ad39f30aa487b5bb10fda038fa7d429b948e9e8e087d5d6b51d97d7de04d308',
]);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function releaseTransform(desired) {
  if (sha(desired) !== EXPECTED) throw Error('新版規則與已測試 SHA256 不一致，停止。');
  return original => {
    if (original.trim() !== desired.trim() && !KNOWN_LIVE.has(sha(original.trim()))) {
      throw Error('線上規則包含未核對的變更，已備份但未發布；請提供 original.rules 核對。');
    }
    return desired;
  };
}
async function main() {
  const args = process.argv.slice(2);
  function argument(name) {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1]) throw Error(`Missing ${name}`);
    return path.resolve(args[index + 1]);
  }
  const cliRoot = argument('--firebase-tools-root');
  const transform = releaseTransform(fs.readFileSync(argument('--rules-file'), 'utf8'));
  const auth = require(path.join(cliRoot, 'lib/auth.js'));
  const { requireAuth } = require(path.join(cliRoot, 'lib/requireAuth.js'));
  const api = require(path.join(cliRoot, 'lib/gcp/rules.js'));
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw Error('請先在本機執行 firebase login。');
  const options = { project: PROJECT, nonInteractive: true };
  auth.setActiveAccount(options, account);
  await requireAuth(options);
  await patch({
    api, publish: args.includes('--publish'), transform,
    backupDir: path.join(os.homedir(), `naya-production-rules-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`),
    successMessage: '正式規則發布成功：已備份前一版、核對已知線上版本、通過語法檢查，並驗證發布結果。',
  });
}
module.exports = { releaseTransform };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
