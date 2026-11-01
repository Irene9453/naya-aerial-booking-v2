const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const clone = value => structuredClone(value);
function fixture() {
  const data = new Map(); let queue = Promise.resolve(), counter = 0;
  const snap = key => ({ id: key.split('/').at(-1), exists: data.has(key), data: () => clone(data.get(key)) });
  function collection(name) {
    const query = { collection: name, filters: [], max: Infinity, after: null,
      doc(id = `auto_${++counter}`) { return { id, key: `${name}/${id}`, get: async () => snap(`${name}/${id}`) }; },
      where(field, operator, value) { return { ...this, filters: [...this.filters, [field, value]] }; },
      orderBy() { return this; }, limit(max) { return { ...this, max }; }, startAfter(after) { return { ...this, after }; },
      async get() { return read(this); } };
    return query;
  }
  function read(ref) {
    if (ref.key) return snap(ref.key);
    const docs = [...data].filter(([key, value]) => key.startsWith(ref.collection + '/') &&
      key.split('/').length === 2 && ref.filters.every(([field, wanted]) => value[field] === wanted) &&
      (!ref.after || key.split('/')[1] > ref.after)).sort(([a], [b]) => a.localeCompare(b)).slice(0, ref.max).map(([key]) => snap(key));
    return { docs, empty: docs.length === 0 };
  }
  const db = { collection, runTransaction(fn) {
    const job = queue.then(async () => {
      f.beforeTransaction?.();
      const writes = [];
      const tx = { get: async ref => { if (writes.length) throw Error('READ_AFTER_WRITE'); return read(ref); },
        create: (ref, value) => writes.push(['create', ref.key, value]),
        update: (ref, value) => writes.push(['update', ref.key, value]), set: (ref, value) => writes.push(['set', ref.key, value]) };
      const result = await fn(tx);
      for (const [kind, key] of writes) {
        if (kind === 'create' && data.has(key)) throw Error('DUPLICATE_CREATE');
        if (kind === 'update' && !data.has(key)) throw Error('MISSING_UPDATE');
      }
      for (const [kind, key, value] of writes) data.set(key, kind === 'update' ? { ...data.get(key), ...clone(value) } : clone(value));
      return result;
    }); queue = job.catch(() => {}); return job;
  } };
  const auth = { verifyIdToken: async token => { if (!['admin', 'student'].includes(token)) throw Object.assign(Error('invalid'), { code: 'auth/id-token-expired' }); return { uid: token }; },
    getUser: async () => ({ emailVerified: true }) };
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const js = ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(js, { Error, module, exports: module.exports, console: { error() {} },
      process: { env: { NODE_ENV: 'production' } }, require(id) {
        if (id === 'next/server') return { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } };
        if (id === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 123456 }, FieldPath: { documentId: () => '__name__' } };
        if (id === '@/lib/firebaseAdmin') return { adminDb: db, adminAuth: auth };
        if (id.startsWith('@/lib/')) return load(id.slice(2) + '.ts');
        throw Error('Unknown import ' + id);
      } }, { filename: name });
    return cache[name] = module.exports;
  }
  const request = (body, token = 'admin') => new Request('http://localhost/test', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const f = { data, db, auth, load, request, beforeTransaction: null };
  data.set('users/admin', { role: 'admin' });
  data.set('users/student', { role: 'student', points: 5, rewardPoints: 3, journeyLegacyClasses: 0 });
  data.set('users/other', { role: 'student' });
  data.set('coupons/reward80', { name: '八折券', type: 'reward', discountRate: 0.8, isActive: true, minimumPackagePoints: 12, maximumPackagePoints: 24 });
  data.set('legacyMembers/legacy1', { name: '測試舊會員', status: 'claimed', claimedBy: 'student', phoneNormalized: '0912345678', birthdayYear: 1990, birthdayMonth: 1, birthdayDay: 2, points: 10, rewardPoints: 20, coupons: [{ couponId: 'reward80', quantity: 2 }] });
  data.get('users/student').legacyMemberId = 'legacy1';
  f.gift = (extra = {}, token = 'admin') => load('app/api/admin/coupons/gift/route.ts').POST(request({ operationId: 'operation_12345', couponId: 'reward80', quantity: 2, reason: '測試贈券原因', userIds: ['student'], ...extra }, token));
  f.audit = (extra = {}, token = 'admin') => load('app/api/admin/legacy-members/coupons/route.ts').POST(request({ action: 'audit', ...extra }, token));
  f.repair = () => f.audit({ action: 'repair', legacyMemberId: 'legacy1' });
  f.claim = () => load('app/api/admin/legacy-claims/approve/route.ts').POST(request({ requestId: 'student', legacyMemberId: 'legacy1', identityVerificationMethod: '已核對本人會員手機與生日資料' }));
  return f;
}
const couponKeys = f => [...f.data.keys()].filter(key => key.startsWith('userCoupons/'));
function existing(f, index, status = 'used') {
  f.data.set(`userCoupons/legacy_legacy1_reward80_${index}`, { userId: 'student', legacyMemberId: 'legacy1', couponId: 'reward80', source: 'legacy_claim', status });
}
test('production admin can gift, records reason, preserves restrictions, not points', async () => {
  const f = fixture(); const r = await f.gift(); assert.equal(r.status, 200); assert.equal((await r.json()).results[0].status, 'created');
  assert.equal(couponKeys(f).length, 2); const coupon = f.data.get(couponKeys(f)[0]);
  assert.equal(coupon.minimumPackagePoints, 12); assert.equal(coupon.maximumPackagePoints, 24); assert.equal(coupon.source, 'admin_gift');
  assert.equal(f.data.get('users/student').points, 5); assert.equal(f.data.get('users/student').rewardPoints, 3);
  assert.equal(f.data.get('couponGiftLogs/operation_12345_student').quantity, 2);
});
test('students and expired tokens cannot gift', async () => { const f = fixture(); assert.equal((await f.gift({}, 'student')).status, 403); assert.equal((await f.gift({}, 'expired')).status, 401); assert.equal(couponKeys(f).length, 0); });
test('same operation retries issue once, including concurrent requests', async () => {
  const f = fixture(); const rs = await Promise.all([f.gift(), f.gift()]);
  const statuses = await Promise.all(rs.map(async r => (await r.json()).results[0].status));
  assert.deepEqual(statuses.sort(), ['already_done', 'created']); assert.equal(couponKeys(f).length, 2);
});
test('operation ID cannot be reused with different gift contents', async () => { const f = fixture(); await f.gift(); assert.equal((await (await f.gift({ quantity: 1 })).json()).results[0].status, 'failed'); assert.equal(couponKeys(f).length, 2); });
for (const patch of [{ quantity: 0 }, { quantity: 11 }, { quantity: 1.2 }, { userIds: ['student', 'student'] }, { userIds: [] }, { couponId: '../x' }, { reason: 'a' }]) test('reject invalid gift input ' + JSON.stringify(patch), async () => { const f = fixture(); assert.equal((await f.gift(patch)).status, 400); assert.equal(couponKeys(f).length, 0); });
test('gift rechecks active template and admin role in transaction', async () => {
  const f = fixture(); f.beforeTransaction = () => { f.data.get('users/admin').role = 'student'; };
  assert.equal((await (await f.gift()).json()).results[0].status, 'failed'); assert.equal(couponKeys(f).length, 0);
});
for (const patch of [{ isActive: false }, { discountRate: 1.5 }, { minimumPackagePoints: -1 }, { maximumPackagePoints: 1 }]) test('reject invalid template ' + JSON.stringify(patch), async () => { const f = fixture(); Object.assign(f.data.get('coupons/reward80'), patch); assert.equal((await (await f.gift()).json()).results[0].status, 'failed'); assert.equal(couponKeys(f).length, 0); });
test('partial batch failure can be retried without issuing to successes twice', async () => {
  const f = fixture(); const r = await f.gift({ userIds: ['student', 'missing'] }); const results = (await r.json()).results;
  assert.deepEqual(results.map(row => row.status), ['created', 'failed']); f.data.set('users/missing', { role: 'student' });
  const retry = (await (await f.gift({ userIds: ['student', 'missing'] })).json()).results;
  assert.deepEqual(retry.map(row => row.status), ['already_done', 'created']); assert.equal(couponKeys(f).length, 4);
});
test('audit reports missing coupons without any writes', async () => {
  const f = fixture(); const before = JSON.stringify([...f.data]); const r = await f.audit(); assert.equal(r.status, 200);
  const report = (await r.json()).results[0]; assert.equal(report.status, 'missing'); assert.equal(report.missing, 2); assert.equal(JSON.stringify([...f.data]), before);
});
test('unclaimed imports are kept pending, not gifted to an account', async () => { const f = fixture(); Object.assign(f.data.get('legacyMembers/legacy1'), { status: 'unclaimed', claimedBy: null }); const report = (await (await f.repair()).json()).result; assert.equal(report.status, 'unclaimed'); assert.equal(report.created, 0); assert.equal(couponKeys(f).length, 0); });
test('legacy records with no coupon field do not invent entitlements', async () => { const f = fixture(); delete f.data.get('legacyMembers/legacy1').coupons; const report = (await (await f.repair()).json()).result; assert.equal(report.status, 'no_coupons'); assert.equal(report.created, 0); });
test('repair creates missing slots, no points, one log, repeated repair no-op', async () => {
  const f = fixture(); assert.equal((await (await f.repair()).json()).result.created, 2);
  assert.equal((await (await f.repair()).json()).result.created, 0); assert.equal(couponKeys(f).length, 2);
  assert.equal(f.data.get('users/student').points, 5); assert.equal(f.data.get('users/student').rewardPoints, 3);
  assert.equal([...f.data.keys()].filter(key => key.startsWith('legacyCouponRepairLogs/')).length, 1);
  assert.equal(f.data.get(couponKeys(f)[0]).minimumPackagePoints, 12);
});
test('repair preserves used/reserved coupons and only fills absent slots', async () => {
  for (const status of ['used', 'reserved', 'available', 'expired', 'locked']) {
    const f = fixture(); existing(f, 1, status); await f.repair(); assert.equal(couponKeys(f).length, 2);
    assert.equal(f.data.get('userCoupons/legacy_legacy1_reward80_1').status, status);
  }
});
test('concurrent repairs do not duplicate coupons', async () => { const f = fixture(); const results = await Promise.all([f.repair(), f.repair()]); const counts = await Promise.all(results.map(async r => (await r.json()).result.created)); assert.deepEqual(counts.sort(), [0, 2]); assert.equal(couponKeys(f).length, 2); });
test('one-way or wrong ownership never auto repairs', async () => {
  const f = fixture(); f.data.get('users/student').legacyMemberId = 'different'; assert.equal((await (await f.repair()).json()).result.status, 'needs_review'); assert.equal(couponKeys(f).length, 0);
});
test('nonstandard legacy coupon IDs require review, never duplicate', async () => { const f = fixture(); f.data.set('userCoupons/old-import', { userId: 'student', couponId: 'reward80', source: 'legacy_import' }); assert.equal((await (await f.repair()).json()).result.status, 'needs_review'); assert.equal(couponKeys(f).length, 1); });
test('misassigned deterministic coupon blocks all repair', async () => { const f = fixture(); existing(f, 1); f.data.get('userCoupons/legacy_legacy1_reward80_1').userId = 'other'; assert.equal((await (await f.repair()).json()).result.status, 'needs_review'); assert.equal(couponKeys(f).length, 1); });
test('missing coupon template blocks all repair, including earlier prepared items', async () => { const f = fixture(); f.data.get('legacyMembers/legacy1').coupons.push({ couponId: 'missing', quantity: 1 }); assert.equal((await (await f.repair()).json()).result.status, 'needs_review'); assert.equal(couponKeys(f).length, 0); });
test('students cannot audit or repair other members', async () => { const f = fixture(); assert.equal((await f.audit({}, 'student')).status, 403); assert.equal((await f.audit({ action: 'repair', legacyMemberId: 'legacy1' }, 'student')).status, 403); });
test('audit rejects expired sessions and invalid IDs', async () => { const f = fixture(); assert.equal((await f.audit({}, 'expired')).status, 401); assert.equal((await f.audit({ legacyMemberId: '../x' })).status, 400); });
test('manual claim transfers legacy coupons atomically with balances', async () => {
  const f = fixture(); const user = f.data.get('users/student'); delete user.legacyMemberId;
  Object.assign(f.data.get('legacyMembers/legacy1'), { status: 'unclaimed', claimedBy: null, journeyLegacyClasses: 2 });
  f.data.set('legacyClaimRequests/student', { uid: 'student', status: 'pending', phone: '0912345678', birthdayYear: 1990, birthdayMonth: 1, birthdayDay: 2 });
  const r = await f.claim(); assert.equal(r.status, 200); assert.equal((await r.json()).couponsTransferred, 2);
  assert.equal(couponKeys(f).length, 2); assert.equal(f.data.get('users/student').points, 15); assert.equal(f.data.get('users/student').rewardPoints, 23);
  assert.equal(f.data.get('legacyClaimRequests/student').couponsTransferred, 2);
  assert.equal((await f.claim()).status, 409); assert.equal(couponKeys(f).length, 2);
});
test('invalid legacy coupon prevents partial claim or balance changes', async () => {
  const f = fixture(); delete f.data.get('users/student').legacyMemberId;
  Object.assign(f.data.get('legacyMembers/legacy1'), { status: 'unclaimed', claimedBy: null, coupons: [{ couponId: 'missing', quantity: 1 }] });
  f.data.set('legacyClaimRequests/student', { uid: 'student', status: 'pending', phone: '0912345678', birthdayYear: 1990, birthdayMonth: 1, birthdayDay: 2 });
  assert.equal((await f.claim()).status, 409); assert.equal(f.data.get('users/student').points, 5); assert.equal(f.data.get('legacyMembers/legacy1').status, 'unclaimed');
});
test('claim keeps all balances untouched when duplicate legacy voucher exists', async () => {
  const f = fixture(); delete f.data.get('users/student').legacyMemberId;
  Object.assign(f.data.get('legacyMembers/legacy1'), { status: 'unclaimed', claimedBy: null });
  f.data.set('legacyClaimRequests/student', { uid: 'student', status: 'pending', phone: '0912345678', birthdayYear: 1990, birthdayMonth: 1, birthdayDay: 2 });
  existing(f, 2, 'used'); assert.equal((await f.claim()).status, 409);
  assert.equal(f.data.get('users/student').points, 5); assert.equal(couponKeys(f).length, 1);
});
test('unverified claimant cannot transfer coupons or points', async () => {
  const f = fixture(); f.auth.getUser = async () => ({ emailVerified: false });
  assert.equal((await f.claim()).status, 409); assert.equal(couponKeys(f).length, 0);
});
test('manual claim rechecks admin role before transaction writes', async () => {
  const f = fixture(); delete f.data.get('users/student').legacyMemberId;
  Object.assign(f.data.get('legacyMembers/legacy1'), { status: 'unclaimed', claimedBy: null });
  f.data.set('legacyClaimRequests/student', { uid: 'student', status: 'pending', phone: '0912345678', birthdayYear: 1990, birthdayMonth: 1, birthdayDay: 2 });
  f.beforeTransaction = () => { f.data.get('users/admin').role = 'student'; };
  assert.equal((await f.claim()).status, 403); assert.equal(couponKeys(f).length, 0); assert.equal(f.data.get('users/student').points, 5);
});
test('repair rechecks current admin before any write', async () => { const f = fixture(); f.beforeTransaction = () => { f.data.get('users/admin').role = 'student'; }; assert.equal((await f.repair()).status, 403); assert.equal(couponKeys(f).length, 0); });
test('ordinary gifts never satisfy or block missing legacy transfer slots', async () => { const f = fixture(); await f.gift(); assert.equal((await (await f.repair()).json()).result.created, 2); assert.equal(couponKeys(f).length, 4); });
test('audit pagination does not skip legacy members', async () => {
  const f = fixture(); for (let i = 0; i < 22; i++) f.data.set('legacyMembers/x' + String(i).padStart(2, '0'), { name: '未認領', status: 'unclaimed' });
  const first = await (await f.audit()).json(); assert.equal(first.results.length, 20); assert.ok(first.nextCursor);
  const second = await (await f.audit({ cursor: first.nextCursor })).json(); assert.equal(second.results.length, 3); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.results, ...second.results].map(row => row.legacyMemberId)).size, 23);
});
const updatePurchaseHistory=(f,extra={},token='admin')=>f.load('app/api/admin/legacy-members/purchase-history/route.ts').POST(f.request({legacyMemberId:'legacy1',status:'never_purchased',evidence:'已核對舊系統完整交易紀錄，只有註冊沒有購課。',...extra},token));
test('admin can verify no historical purchases for an already claimed member',async()=>{
 const f=fixture();assert.equal((await updatePurchaseHistory(f)).status,200);const record=f.data.get('legacyMembers/legacy1');assert.equal(record.purchaseHistoryStatus,'never_purchased');assert.equal(record.purchaseHistoryVerifiedBy,'admin');assert.equal(f.data.get('users/student').points,5);assert.equal([...f.data.keys()].filter(key=>key.startsWith('legacyPurchaseHistoryLogs/')).length,1);
});
test('students cannot declare their own legacy account never-purchased',async()=>{const f=fixture();assert.equal((await updatePurchaseHistory(f,{},'student')).status,403);assert.equal(f.data.get('legacyMembers/legacy1').purchaseHistoryStatus,undefined)});
test('verification requires a detailed source, not a zero balance assertion',async()=>{const f=fixture();assert.equal((await updatePurchaseHistory(f,{evidence:'零點'})).status,400)});
for(const sale of [{studentId:'student'},{studentId:'legacy1'},{legacyMemberId:'legacy1'}])test('actual purchase blocks no-purchase verification '+JSON.stringify(sale),async()=>{const f=fixture();f.data.set('packageSales/proof',sale);assert.equal((await updatePurchaseHistory(f)).status,409);assert.equal(f.data.get('legacyMembers/legacy1').purchaseHistoryStatus,undefined)});
test('independent new student offers do not block remaining offers',async()=>{const f=fixture();f.data.set('packageSales/new-offer',{studentId:'student',offerType:'new_student'});assert.equal((await updatePurchaseHistory(f)).status,200)});
test('verification rechecks admin authority inside the transaction',async()=>{const f=fixture();f.beforeTransaction=()=>{f.data.get('users/admin').role='student'};assert.equal((await updatePurchaseHistory(f)).status,403);assert.equal(f.data.get('legacyMembers/legacy1').purchaseHistoryStatus,undefined)});
