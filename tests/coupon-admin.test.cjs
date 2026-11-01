const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const clone = value => structuredClone(value);
function fixture() {
  let clock = Date.now();
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const env = { NODE_ENV: "production", NAYA_NEW_STUDENT_APPROVAL_ENABLED: "true", NAYA_LEGACY_HISTORY_COMPLETE: "true" };
  const reads = []; const data = new Map(); let queue = Promise.resolve(), counter = 0;
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
    reads.push(ref.key ?? `query:${ref.collection}`);
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
    vm.runInNewContext(js, { Date: ClockDate, crypto: require("node:crypto"), Error, module, exports: module.exports, console: { error() {} },
      process: { env }, require(id) {
        if (id === 'next/server') return { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } };
        if (id === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 123456 }, FieldPath: { documentId: () => '__name__' } };
        if (id === '@/lib/firebaseAdmin') return { adminDb: db, adminAuth: auth };
        if (id.startsWith('@/lib/')) return load(id.slice(2) + '.ts');
        throw Error('Unknown import ' + id);
      } }, { filename: name });
    return cache[name] = module.exports;
  }
  const request = (body, token = 'admin') => new Request('http://localhost/test', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const f = { data, reads, db, auth, load, request, env, beforeTransaction: null, setNow: value => { clock = value; } };
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

const validity=(f,body,token='admin')=>f.load('app/api/admin/coupons/validity/route.ts').POST(f.request(body,token));
async function issued(f,extra={}){await f.gift();const id='gift_operation_12345_student_0';Object.assign(f.data.get('userCoupons/'+id),extra);f.data.set('packages/basic',{name:'12 點課卡',price:1800,points:12,isActive:true});return id;}
const reserve=(f,couponId,extra={},token='student')=>f.load('app/api/coupons/purchase/route.ts').POST(f.request({couponId,packageId:'basic',operationId:'purchase_operation_123',paymentMethod:'transfer',transferLastFive:'12345',...extra},token));
const review=(f,requestId,extra={},token='admin')=>f.load('app/api/admin/coupons/orders/route.ts').POST(f.request({requestId,action:'approve',...extra},token));
test('coupon purchase snapshots server price, locks once, ignores caller discount',async()=>{const f=fixture();const id=await issued(f);const r=await reserve(f,id,{finalPrice:1});assert.equal(r.status,200);const order=await r.json();assert.equal(order.finalPrice,1440);assert.equal(f.data.get('userCoupons/'+id).status,'reserved');assert.equal((await reserve(f,id,{operationId:'another_operation'})).status,400);assert.equal((await reserve(f,id)).status,200);assert.equal(f.data.get('users/student').points,5)});
test('coupon reserved before expiry can be approved after expiry and across months',async()=>{const f=fixture();f.setNow(Date.parse('2026-10-31T23:59:00+08:00'));const id=await issued(f,{expiryMode:'date',expiresOn:'2026-10-31',expiresAtMillis:Date.parse('2026-11-01T00:00:00+08:00')});const o=await(await reserve(f,id)).json();f.setNow(Date.parse('2026-11-03T12:00:00+08:00'));const receipt=Date.parse('2026-10-31T23:58:00+08:00');assert.equal((await review(f,o.requestId,{paymentReceivedAtMillis:receipt})).status,200);assert.equal(f.data.get('users/student').points,17);assert.equal(f.data.get('userCoupons/'+id).status,'used');assert.equal(f.data.get('packageSales/request_'+o.requestId).paymentReceivedAtMillis,receipt);assert.equal((await review(f,o.requestId)).status,400)});
test('October submission with November receipt records November revenue',async()=>{const f=fixture();f.setNow(Date.parse('2026-10-31T23:59:00+08:00'));const id=await issued(f,{expiryMode:'date',expiresAtMillis:Date.parse('2026-11-01T00:00:00+08:00')});const o=await(await reserve(f,id)).json();f.setNow(Date.parse('2026-11-03T12:00:00+08:00'));const receipt=Date.parse('2026-11-02T10:00:00+08:00');await review(f,o.requestId,{paymentReceivedAtMillis:receipt});assert.equal(f.data.get('packageSales/request_'+o.requestId).paymentReceivedAtMillis,receipt)});
test('exact expiry boundary blocks new application',async()=>{const f=fixture();const cutoff=Date.parse('2026-11-01T00:00:00+08:00');f.setNow(cutoff);const id=await issued(f,{expiryMode:'date',expiresAtMillis:cutoff});assert.equal((await reserve(f,id)).status,400)});
test('unknown legacy expiry is not silently treated as unlimited',async()=>{const f=fixture();const id=await issued(f,{source:'legacy_claim'});delete f.data.get('userCoupons/'+id).expiryMode;delete f.data.get('userCoupons/'+id).expiresAtMillis;assert.equal((await reserve(f,id)).status,400)});
test('rejection after expiry preserves expired record instead of renewing it',async()=>{const f=fixture();f.setNow(Date.parse('2026-10-31T20:00:00+08:00'));const cutoff=Date.parse('2026-11-01T00:00:00+08:00');const id=await issued(f,{expiryMode:'date',expiresAtMillis:cutoff});const o=await(await reserve(f,id)).json();f.setNow(cutoff+1);assert.equal((await review(f,o.requestId,{action:'reject'})).status,200);assert.equal(f.data.get('userCoupons/'+id).status,'expired');assert.equal(f.data.get('userCoupons/'+id).expiresAtMillis,cutoff);assert.equal((await reserve(f,id,{operationId:'new_operation'})).status,400)});
test('rejection before expiry releases coupon without adding points',async()=>{const f=fixture();const id=await issued(f);const o=await(await reserve(f,id)).json();await review(f,o.requestId,{action:'reject'});assert.equal(f.data.get('userCoupons/'+id).status,'available');assert.equal(f.data.get('users/student').points,5)});
test('payment correction keeps original reservation and adds audit log',async()=>{const f=fixture();const id=await issued(f);const o=await(await reserve(f,id)).json();const original=f.data.get('purchaseRequests/'+o.requestId).couponReservedAtMillis;assert.equal((await review(f,o.requestId,{action:'update_payment',transferLastFive:'67890',reason:'核對匯款末五碼'})).status,200);assert.equal(f.data.get('purchaseRequests/'+o.requestId).couponReservedAtMillis,original);assert.equal(f.data.get('userCoupons/'+id).status,'reserved');assert.equal(f.data.get('purchaseRequests/'+o.requestId).transferLastFive,'67890');assert.equal([...f.data.keys()].filter(k=>k.startsWith('couponPaymentCorrections/')).length,1)});
test('student cannot approve, correct payment or set expiry',async()=>{const f=fixture();const id=await issued(f);const o=await(await reserve(f,id)).json();assert.equal((await review(f,o.requestId,{},'student')).status,403);assert.equal((await validity(f,{action:'set',kind:'issued',id,expiryMode:'unlimited',reason:'更正期限'},'student')).status,403)});
test('admin cannot change expiry of a reserved coupon',async()=>{const f=fixture();const id=await issued(f);await reserve(f,id);assert.equal((await validity(f,{action:'set',kind:'issued',id,expiryMode:'unlimited',reason:'更正期限'})).status,400)});
test('used coupon expiry may be recorded but its rights are never reissued',async()=>{const f=fixture();const id=await issued(f,{status:'used'});assert.equal((await validity(f,{action:'set',kind:'issued',id,expiryMode:'date',expiresOn:'2030-01-01',reason:'補登原期限'})).status,200);assert.equal(f.data.get('userCoupons/'+id).status,'used');assert.equal(couponKeys(f).length,2)});
test('per-slot legacy dates survive repair without renewing or overwriting used coupons',async()=>{const f=fixture();existing(f,1,'used');const id='legacy_legacy1_reward80_1';assert.equal((await validity(f,{action:'set',kind:'legacy',id,legacyMemberId:'legacy1',expiryMode:'date',expiresOn:'2026-10-31',reason:'補登舊系統原期限'})).status,200);const missing='legacy_legacy1_reward80_2';assert.equal((await validity(f,{action:'set',kind:'legacy',id:missing,legacyMemberId:'legacy1',expiryMode:'unlimited',reason:'原系統沒有期限'})).status,200);await f.repair();assert.equal(f.data.get('userCoupons/'+id).status,'used');assert.equal(f.data.get('userCoupons/'+missing).expiryMode,'unlimited');assert.equal(f.data.get('userCoupons/'+id).expiresOn,'2026-10-31')});
test('unclaimed legacy expiry entry does not issue coupons or transfer balances',async()=>{const f=fixture();Object.assign(f.data.get('legacyMembers/legacy1'),{status:'unclaimed',claimedBy:null});assert.equal((await validity(f,{action:'set',kind:'legacy',id:'legacy_legacy1_reward80_1',legacyMemberId:'legacy1',expiryMode:'date',expiresOn:'2030-01-01',reason:'補登原期限'})).status,200);assert.equal(couponKeys(f).length,0);assert.equal(f.data.get('users/student').points,5);assert.equal(f.data.get('legacyMembers/legacy1').coupons[0].expiresOnByIndex[0],'2030-01-01')});
test('malformed and impossible expiry dates do not modify coupons',async()=>{const f=fixture();const id=await issued(f);for(const date of ['2026-02-30','bad','2026-13-01'])assert.equal((await validity(f,{action:'set',kind:'issued',id,expiryMode:'date',expiresOn:date,reason:'測試原期限'})).status,400);assert.equal(f.data.get('userCoupons/'+id).expiryMode,'unlimited')});
test('different members cannot reserve another member coupon',async()=>{const f=fixture();const id=await issued(f);f.data.get('userCoupons/'+id).userId='other';assert.equal((await reserve(f,id)).status,400)});
test('expired template cannot issue new gifts',async()=>{const f=fixture();f.setNow(Date.parse('2026-11-01T12:00:00+08:00'));Object.assign(f.data.get('coupons/reward80'),{expiryMode:'date',expiryDate:'2026-10-31'});assert.equal((await(await f.gift()).json()).results[0].status,'failed');assert.equal(couponKeys(f).length,0)});
test('future payment dates cannot be approved',async()=>{const f=fixture();const id=await issued(f);const o=await(await reserve(f,id)).json();assert.equal((await review(f,o.requestId,{paymentReceivedAtMillis:Date.now()+86400000})).status,400);assert.equal(f.data.get('users/student').points,5);assert.equal(f.data.get('userCoupons/'+id).status,'reserved')});
test('concurrent coupon applications lock exactly once',async()=>{const f=fixture();const id=await issued(f);const results=await Promise.all([reserve(f,id),reserve(f,id,{operationId:'other_operation_123'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400])});
test('concurrent coupon approvals add points once',async()=>{const f=fixture();const id=await issued(f);const o=await(await reserve(f,id)).json();const results=await Promise.all([review(f,o.requestId),review(f,o.requestId)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(f.data.get('users/student').points,17)});
test('tampered price cannot be approved and leaves coupon reserved',async()=>{const f=fixture();const id=await issued(f);const o=await(await reserve(f,id)).json();f.data.get('purchaseRequests/'+o.requestId).finalPrice=1;assert.equal((await review(f,o.requestId)).status,400);assert.equal(f.data.get('userCoupons/'+id).status,'reserved');assert.equal(f.data.get('users/student').points,5)});
test('tampered expiry reservation proof cannot be approved',async()=>{const f=fixture();const id=await issued(f);const o=await(await reserve(f,id)).json();const order=f.data.get('purchaseRequests/'+o.requestId);order.couponExpiresAtMillis=order.couponReservedAtMillis;assert.equal((await review(f,o.requestId)).status,400)});
test('gift snapshots relative expiry and retry does not restart its clock',async()=>{const f=fixture();f.setNow(Date.parse('2026-12-31T23:59:00+08:00'));Object.assign(f.data.get('coupons/reward80'),{expiryMode:'days',validDays:2});await f.gift();const id='userCoupons/gift_operation_12345_student_0';assert.equal(f.data.get(id).expiresOn,'2027-01-01');const deadline=f.data.get(id).expiresAtMillis;f.setNow(Date.parse('2027-01-01T23:00:00+08:00'));await f.gift();assert.equal(f.data.get(id).expiresAtMillis,deadline)});
test('expired redemption does not consume reward balance',async()=>{const f=fixture();f.setNow(Date.parse('2026-11-01T12:00:00+08:00'));Object.assign(f.data.get('coupons/reward80'),{rewardCost:2,expiryMode:'date',expiryDate:'2026-10-31'});const response=await f.load('app/api/rewards/redeem/route.ts').POST(f.request({couponId:'reward80'},'student'));assert.equal(response.status,400);assert.equal(f.data.get('users/student').rewardPoints,3);assert.equal(couponKeys(f).length,0)});
test('reward redemption includes expiry snapshot and package restrictions',async()=>{const f=fixture();f.setNow(Date.parse('2026-11-01T12:00:00+08:00'));Object.assign(f.data.get('coupons/reward80'),{rewardCost:2,expiryMode:'days',validDays:30});const response=await f.load('app/api/rewards/redeem/route.ts').POST(f.request({couponId:'reward80'},'student'));assert.equal(response.status,200);const coupon=f.data.get(couponKeys(f)[0]);assert.equal(coupon.expiresOn,'2026-11-30');assert.equal(coupon.minimumPackagePoints,12);assert.equal(f.data.get('users/student').rewardPoints,1)});

test('server receipt time is retained when authentication crosses expiry',async()=>{const f=fixture();const cutoff=Date.parse('2026-11-01T00:00:00+08:00');f.setNow(cutoff-1);const id=await issued(f,{expiryMode:'date',expiresAtMillis:cutoff});const original=f.auth.verifyIdToken;f.auth.verifyIdToken=async(...args)=>{const result=await original(...args);f.setNow(cutoff+2000);return result};assert.equal((await reserve(f,id)).status,200);assert.equal(f.data.get('userCoupons/'+id).reservedAtMillis,cutoff-1)});
function birthdayFixture(){const f=fixture();f.setNow(Date.parse('2026-10-31T23:59:00+08:00'));f.data.get('users/student').birthdayMonth=10;f.data.set('packages/basic',{name:'12 點課卡',price:1800,points:12,isActive:true});return f;}
test('birthday benefit reserved in birthday month remains valid for later review',async()=>{const f=birthdayFixture();const response=await reserve(f,'birthday_2026',{couponSource:'birthday'});assert.equal(response.status,200);const order=await response.json();assert.equal(order.finalPrice,1260);f.setNow(Date.parse('2026-11-03T12:00:00+08:00'));assert.equal((await review(f,order.requestId)).status,200);assert.equal(f.data.get('users/student').points,17);assert.equal(f.data.get('birthdayCouponUsage/student_2026').status,'used')});
test('birthday reservation blocks duplicate applications within same year',async()=>{const f=birthdayFixture();await reserve(f,'birthday_2026',{couponSource:'birthday'});assert.equal((await reserve(f,'birthday_2026',{couponSource:'birthday',operationId:'new_birthday_operation'})).status,400)});
test('birthday rejection releases annual usage only if a new application is still within month',async()=>{const f=birthdayFixture();const order=await(await reserve(f,'birthday_2026',{couponSource:'birthday'})).json();await review(f,order.requestId,{action:'reject'});assert.equal(f.data.get('birthdayCouponUsage/student_2026').status,'released');assert.equal((await reserve(f,'birthday_2026',{couponSource:'birthday',operationId:'new_birthday_operation'})).status,200)});
test('birthday rejection after month end does not extend entitlement',async()=>{const f=birthdayFixture();const order=await(await reserve(f,'birthday_2026',{couponSource:'birthday'})).json();f.setNow(Date.parse('2026-11-01T00:00:00+08:00'));await review(f,order.requestId,{action:'reject'});assert.equal((await reserve(f,'birthday_2026',{couponSource:'birthday',operationId:'new_birthday_operation'})).status,400)});
test('old completed annual usage cannot be bypassed by new birthday flow',async()=>{const f=birthdayFixture();f.data.set('birthdayCouponUsage/student_2026',{userId:'student',year:2026});assert.equal((await reserve(f,'birthday_2026',{couponSource:'birthday'})).status,400);assert.equal(couponKeys(f).length,0)});
test('birthday request cannot select another year to get extra discount',async()=>{const f=birthdayFixture();assert.equal((await reserve(f,'birthday_2027',{couponSource:'birthday'})).status,400)});
const retainOld=(f,id,extra={})=>f.load('app/api/admin/coupons/retain-legacy/route.ts').POST(f.request({requestId:id,evidence:'已核對原申請與原券期限，申請時間在期限內。',...extra}));
function oldOrder(f,couponId,source='user_coupon',submitted=Date.parse('2026-10-31T20:00:00+08:00')){const rate=source==='birthday'?0.7:0.8;const discount=Math.round(1800*(1-rate));f.data.set('purchaseRequests/old_pending',{userId:'student',packageId:'basic',packageName:'12 點課卡',packagePoints:12,originalPrice:1800,discountAmount:discount,finalPrice:1800-discount,discountValue:rate,couponSource:source,couponName:'舊優惠券',couponId,paymentMethod:'transfer',transferLastFive:'12345',status:'pending',paymentStatus:'unpaid',createdAt:{seconds:submitted/1000,nanoseconds:0}});}
test('manual review can retain genuine pre-expiry old order without resetting expiry',async()=>{const f=fixture();const id=await issued(f,{expiryMode:'date',expiresAtMillis:Date.parse('2026-11-01T00:00:00+08:00'),status:'expired'});oldOrder(f,id);f.setNow(Date.parse('2026-11-03T12:00:00+08:00'));assert.equal((await retainOld(f,'old_pending')).status,200);assert.equal(f.data.get('users/student').points,5);assert.equal((await review(f,'old_pending')).status,200);assert.equal(f.data.get('users/student').points,17)});
test('old order submitted after expiry cannot be grandfathered',async()=>{const f=fixture();const id=await issued(f,{expiryMode:'date',expiresAtMillis:Date.parse('2026-11-01T00:00:00+08:00'),status:'expired'});oldOrder(f,id,'user_coupon',Date.parse('2026-11-02T20:00:00+08:00'));f.setNow(Date.parse('2026-11-03T12:00:00+08:00'));assert.equal((await retainOld(f,'old_pending')).status,400);assert.equal(f.data.get('userCoupons/'+id).status,'expired')});
test('old birthday pending order can be manually retained after month end',async()=>{const f=birthdayFixture();oldOrder(f,null,'birthday');f.setNow(Date.parse('2026-11-03T12:00:00+08:00'));assert.equal((await retainOld(f,'old_pending')).status,200);assert.equal(f.data.get('birthdayCouponUsage/student_2026').status,'reserved');assert.equal((await review(f,'old_pending')).status,200)});
test('legacy retention needs administrator evidence and does not accept missing timestamp',async()=>{const f=fixture();const id=await issued(f);oldOrder(f,id);assert.equal((await retainOld(f,'old_pending',{evidence:'確認'})).status,400);delete f.data.get('purchaseRequests/old_pending').createdAt;assert.equal((await retainOld(f,'old_pending')).status,400);assert.equal(f.data.get('users/student').points,5)});
function diagnosticFixture(){const f=fixture();Object.assign(f.data.get('users/student'),{phoneNormalized:'0912345678',isNewStudent:false,newStudentEligibilityVerified:true,newStudentEligibilityReason:'legacy_member'});Object.assign(f.data.get('legacyMembers/legacy1'),{purchaseHistoryStatus:'never_purchased',purchaseHistoryVerifiedBy:'admin',purchaseHistoryVerifiedAt:1});f.data.set('phoneRegistry/0912345678',{userId:'student'});return f;}
const diagnose=f=>f.load('app/api/admin/new-student-offers/eligibility/route.ts').POST(f.request({legacyMemberId:'legacy1'}));
test('admin eligibility diagnostic reports qualified member without modifying account',async()=>{const f=diagnosticFixture();const before=JSON.stringify([...f.data]);const r=await diagnose(f);assert.equal(r.status,200);const result=await r.json();assert.equal(result.status,'eligible');assert.equal(result.purchasingEnabled,true);assert.equal(result.emailVerified,true);assert.equal(JSON.stringify([...f.data]),before)});
test('diagnostic distinguishes purchasing flag disabled from member eligibility',async()=>{const f=diagnosticFixture();f.env.NAYA_NEW_STUDENT_APPROVAL_ENABLED='false';const result=await(await diagnose(f)).json();assert.equal(result.status,'eligible');assert.equal(result.purchasingEnabled,false)});
test('diagnostic points out phone registry mismatch',async()=>{const f=diagnosticFixture();f.data.get('phoneRegistry/0912345678').userId='other';const result=await(await diagnose(f)).json();assert.equal(result.status,'pending');assert.equal(result.reason,'phone_registry_mismatch')});
test('legacy Firestore microsecond timestamp is retained at millisecond precision',async()=>{const f=fixture();const id=await issued(f,{expiryMode:'date',expiresAtMillis:Date.parse('2026-11-01T00:00:00+08:00')});oldOrder(f,id);f.data.get('purchaseRequests/old_pending').createdAt.nanoseconds=123456;f.setNow(Date.parse('2026-11-03T12:00:00+08:00'));assert.equal((await retainOld(f,'old_pending')).status,200);assert.ok(Number.isSafeInteger(f.data.get('purchaseRequests/old_pending').couponReservedAtMillis))});

test('coupon audit quota error reports resource limit without issuing anything',async()=>{const f=fixture();f.beforeTransaction=()=>{throw Object.assign(Error('Quota exceeded.'),{code:8})};const before=JSON.stringify([...f.data]);const response=await f.audit();assert.equal(response.status,503);assert.equal((await response.json()).code,'FIRESTORE_QUOTA_EXCEEDED');assert.equal(JSON.stringify([...f.data]),before)});
test('paged audit reuses legacy snapshots and existing coupon query results',async()=>{const f=fixture();existing(f,1,'available');existing(f,2,'used');f.reads.length=0;const response=await f.audit();assert.equal(response.status,200);assert.equal((await response.json()).results[0].status,'complete');assert.equal(f.reads.filter(key=>key==='legacyMembers/legacy1').length,0);assert.equal(f.reads.filter(key=>key.startsWith('userCoupons/')).length,0);assert.equal(f.reads.filter(key=>key.startsWith('coupons/')).length,0)});
