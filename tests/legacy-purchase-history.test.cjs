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
const updatePurchaseHistory=(f,extra={},token='admin')=>f.load('app/api/admin/legacy-members/purchase-history/route.ts').POST(f.request({legacyMemberId:'legacy1',status:'never_purchased',evidence:'已核對舊系統完整交易紀錄，只有註冊沒有購課。',...extra},token));
test('admin can verify no historical purchases for an already claimed member',async()=>{
 const f=fixture();assert.equal((await updatePurchaseHistory(f)).status,200);const record=f.data.get('legacyMembers/legacy1');assert.equal(record.purchaseHistoryStatus,'never_purchased');assert.equal(record.purchaseHistoryVerifiedBy,'admin');assert.equal(f.data.get('users/student').points,5);assert.equal([...f.data.keys()].filter(key=>key.startsWith('legacyPurchaseHistoryLogs/')).length,1);
});
test('students cannot declare their own legacy account never-purchased',async()=>{const f=fixture();assert.equal((await updatePurchaseHistory(f,{},'student')).status,403);assert.equal(f.data.get('legacyMembers/legacy1').purchaseHistoryStatus,undefined)});
test('verification requires a detailed source, not a zero balance assertion',async()=>{const f=fixture();assert.equal((await updatePurchaseHistory(f,{evidence:'零點'})).status,400)});
for(const sale of [{studentId:'student'},{studentId:'legacy1'},{legacyMemberId:'legacy1'}])test('actual purchase blocks no-purchase verification '+JSON.stringify(sale),async()=>{const f=fixture();f.data.set('packageSales/proof',sale);assert.equal((await updatePurchaseHistory(f)).status,409);assert.equal(f.data.get('legacyMembers/legacy1').purchaseHistoryStatus,undefined)});
test('independent new student offers do not block remaining offers',async()=>{const f=fixture();f.data.set('packageSales/new-offer',{studentId:'student',offerType:'new_student'});assert.equal((await updatePurchaseHistory(f)).status,200)});
test('verification rechecks admin authority inside the transaction',async()=>{const f=fixture();f.beforeTransaction=()=>{f.data.get('users/admin').role='student'};assert.equal((await updatePurchaseHistory(f)).status,403);assert.equal(f.data.get('legacyMembers/legacy1').purchaseHistoryStatus,undefined)});
