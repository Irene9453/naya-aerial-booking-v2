const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function fixture() {
  let now = Date.parse('2026-11-02T00:00:00Z'), counter = 0, queue = Promise.resolve();
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  class Timestamp { constructor(ms) { this.ms = ms; } toMillis() { return this.ms; } static fromMillis(ms) { return new Timestamp(ms); } }
  const clone = value => value instanceof Timestamp ? new Timestamp(value.ms) : Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,clone(v)])) : value;
  const data = new Map();
  function snap(key) { return { id: key.split('/').at(-1), ref: ref(key), exists: data.has(key), data: () => clone(data.get(key)) }; }
  function ref(key) { return { key, id: key.split('/').at(-1), get: async () => snap(key) }; }
  function collection(name) { return { name, filters: [], doc: (id = `auto_${++counter}`) => ref(`${name}/${id}`), where(field, op, wanted) { return { ...this, filters: [...this.filters, [field,wanted]] }; } }; }
  function read(value) {
    if (f.readError) throw f.readError;
    if (value.key) return snap(value.key);
    // Fixture intentionally has no custom composite indexes.
    if (value.filters.length > 1) throw Object.assign(Error('query requires index'), { code: 9 });
    const docs = [...data].filter(([key, valueData]) => key.split('/').length === 2 && key.startsWith(`${value.name}/`) && value.filters.every(([field,wanted]) => valueData[field] === wanted)).map(([key]) => snap(key));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
  const db = { collection, runTransaction(fn) {
    const run = queue.then(async () => {
      f.beforeTransaction?.(); const writes = [];
      const tx = { get: async value => { if(writes.length) throw Error('READ_AFTER_WRITE'); return read(value); },
        update: (r,v) => writes.push(['update',r.key,v]), create: (r,v) => writes.push(['create',r.key,v]) };
      const result = await fn(tx);
      for(const [type,key] of writes) { if(type === 'update' && !data.has(key)) throw Error('MISSING_DOCUMENT'); if(type === 'create' && data.has(key)) throw Error('DUPLICATE_DOCUMENT'); }
      for(const [type,key,value] of writes) data.set(key,type === 'update' ? {...data.get(key),...clone(value)} : clone(value));
      return result;
    }); queue = run.catch(() => {}); return run;
  } };
  const auth = { verifyIdToken: async token => { if(token !== 'admin' && token !== 'student') throw Error('invalid token'); return { uid: token }; } };
  const load = name => {
    const module = { exports: {} };
    const js = ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(js,{module,exports:module.exports,Date:ClockDate,Error,console:{error(){}},require:id=>{
      if(id==='next/server')return {NextResponse:{json:(value,options)=>new Response(JSON.stringify(value),options)}};
      if(id==='firebase-admin/firestore')return {Timestamp,FieldValue:{serverTimestamp:()=>Timestamp.fromMillis(now)}};
      if(id==='@/lib/firebaseAdmin')return {adminAuth:auth,adminDb:db};
      throw Error(id);
    }});return module.exports;
  };
  const request = (body,token='admin') => new Request('http://localhost/test',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
  const start = now+3600000, end = start+3600000;
  const f = { data, Timestamp, start, end, beforeTransaction:null, readError:null, load, request,
    cancel:(token='admin')=>load('app/api/admin/classes/cancel/route.ts').POST(request({classId:'course'},token)),
    schedule:(patch={},token='admin')=>load('app/api/admin/classes/schedule/route.ts').POST(request({classId:'course',startTimeMillis:start+86400000,endTimeMillis:end+86400000,expectedStartTimeMillis:start,expectedEndTimeMillis:end,reason:'老師調整時間',operationId:'test-operation',...patch},token)) };
  data.set('users/admin',{role:'admin'});data.set('users/student',{role:'student',points:5});
  data.set('classes/course',{courseName:'空中瑜珈 Lv.0–1',startTime:Timestamp.fromMillis(start),endTime:Timestamp.fromMillis(end),status:'open',bookedCount:0});
  f.booking=(id='booking',patch={})=>{data.set(`bookings/${id}`,{userId:'student',classId:'course',status:'booked',pointsUsed:3,paymentType:'points',classStartTime:Timestamp.fromMillis(start),...patch});data.get('classes/course').bookedCount++;};
  return f;
}
test('empty future class cancels with zero refunds and no custom index',async()=>{const f=fixture(),r=await f.cancel();assert.equal(r.status,200);const b=await r.json();assert.equal(b.cancelledBookings,0);assert.equal(b.refundedPoints,0);assert.equal(f.data.get('classes/course').status,'cancelled');assert.equal(f.data.get('users/student').points,5)});
test('point refunds and waiting cancellation are atomic; unrelated statuses remain',async()=>{const f=fixture();f.booking();f.data.set('waitlists/w',{classId:'course',userId:'other',status:'waiting'});f.data.set('waitlists/old',{classId:'course',status:'converted'});f.data.set('bookings/old',{classId:'course',status:'cancelled',userId:'student',pointsUsed:3});const r=await f.cancel();assert.equal(r.status,200);assert.equal(f.data.get('users/student').points,8);assert.equal(f.data.get('bookings/booking').status,'admin_cancelled');assert.equal(f.data.get('waitlists/w').status,'cancelled');assert.equal(f.data.get('waitlists/old').status,'converted');assert.equal(f.data.get('bookings/old').status,'cancelled')});
test('trial voucher refund restores voucher without adding points',async()=>{const f=fixture();f.booking('booking',{paymentType:'trial_voucher',pointsUsed:0,trialVoucherId:'voucher'});f.data.set('trialVouchers/voucher',{userId:'student',status:'used',bookingId:'booking',quantity:0});const r=await f.cancel();assert.equal(r.status,200);assert.equal((await r.json()).refundedTrialVouchers,1);assert.equal(f.data.get('trialVouchers/voucher').status,'available');assert.equal(f.data.get('users/student').points,5)});
test('concurrent cancellation never refunds twice',async()=>{const f=fixture();f.booking();const rs=await Promise.all([f.cancel(),f.cancel()]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);assert.equal(f.data.get('users/student').points,8)});
for(const kind of ['duplicate','missing-user','invalid-count','voucher-mismatch'])test('invalid cancellation remains fully unchanged: '+kind,async()=>{const f=fixture();f.booking();if(kind==='duplicate')f.booking('duplicate');if(kind==='missing-user')f.data.delete('users/student');if(kind==='invalid-count')f.data.get('classes/course').bookedCount=0;if(kind==='voucher-mismatch')Object.assign(f.data.get('bookings/booking'),{paymentType:'trial_voucher',pointsUsed:0,trialVoucherId:'missing'});const before=JSON.stringify([...f.data]);assert.equal((await f.cancel()).status,409);assert.equal(JSON.stringify([...f.data]),before)});
test('started and already cancelled classes cannot be whole-cancelled',async()=>{for(const patch of [{startTime:null},{status:'cancelled'}]){const f=fixture();Object.assign(f.data.get('classes/course'),patch.startTime===null?{startTime:f.Timestamp.fromMillis(1)}:patch);assert.equal((await f.cancel()).status,409)}});
test('unauthorized users cannot cancel or change schedule',async()=>{const f=fixture();for(const token of ['student','expired']){assert.ok([401,403].includes((await f.cancel(token)).status));assert.ok([401,403].includes((await f.schedule({},token)).status))}});
test('unknown database failure returns safe diagnostic code',async()=>{const f=fixture();f.readError=Object.assign(Error('private internal query'),{code:9});const r=await f.cancel();assert.equal(r.status,500);const b=await r.json();assert.equal(b.code,'DATABASE_PRECONDITION');assert.ok(!b.error.includes('private internal'))});
test('published class schedule updates bookings, waiting and lesson records together',async()=>{const f=fixture();f.booking();f.data.set('waitlists/w',{classId:'course',userId:'student',status:'waiting'});f.data.set('studentLessonRecords/record',{classId:'course',studentId:'student',lessonContent:'A013'});const r=await f.schedule();assert.equal(r.status,200);assert.equal((await r.json()).notifiedStudents,1);for(const key of ['classes/course','bookings/booking','waitlists/w','studentLessonRecords/record'])assert.equal(f.data.get(key)[key.startsWith('classes')?'startTime':'classStartTime'].toMillis(),f.start+86400000);assert.equal(f.data.get('users/student').points,5);assert.equal(f.data.get('bookings/booking').status,'booked');assert.equal(f.data.get('studentLessonRecords/record').lessonContent,'A013');assert.equal([...f.data.keys()].filter(k=>k.startsWith('notifications/')).length,1)});
test('schedule of already started class can be corrected without resetting attendance',async()=>{const f=fixture();f.booking('booking',{attendanceStatus:'present'});f.data.get('classes/course').startTime=f.Timestamp.fromMillis(f.start-86400000);const r=await f.schedule({expectedStartTimeMillis:f.start-86400000});assert.equal(r.status,200);assert.equal(f.data.get('bookings/booking').attendanceStatus,'present');assert.equal(f.data.get('users/student').points,5)});
test('schedule retry idempotency avoids duplicate logs and notices',async()=>{const f=fixture();f.booking();const rs=await Promise.all([f.schedule(),f.schedule()]);assert.deepEqual(rs.map(r=>r.status),[200,200]);assert.equal([...f.data.keys()].filter(k=>k.startsWith('classScheduleChanges/')).length,1);assert.equal([...f.data.keys()].filter(k=>k.startsWith('notifications/')).length,1);assert.equal((await f.schedule({reason:'不同修改原因'})).status,409)});
test('stale editor and cancelled classes cannot change time',async()=>{for(const patch of [{expectedStartTimeMillis:0},{expectedStartTimeMillis:null}]){const f=fixture();const before=JSON.stringify([...f.data]);assert.ok([400,409].includes((await f.schedule(patch)).status));assert.equal(JSON.stringify([...f.data]),before)}const f=fixture();f.data.get('classes/course').status='cancelled';assert.equal((await f.schedule()).status,409)});
for(const patch of [{endTimeMillis:1},{startTimeMillis:'tomorrow'},{reason:''},{classId:'../bad'},{endTimeMillis:Date.UTC(2101,0,1)},{endTimeMillis:Date.parse('2026-11-05T00:00:00Z')}])test('reject invalid schedule input '+JSON.stringify(patch),async()=>{const f=fixture();const before=JSON.stringify([...f.data]);assert.equal((await f.schedule(patch)).status,400);assert.equal(JSON.stringify([...f.data]),before)});
test('role is rechecked inside schedule transaction',async()=>{const f=fixture();f.beforeTransaction=()=>{f.data.get('users/admin').role='student'};assert.equal((await f.schedule()).status,403)});
test('cross-midnight schedule is saved exactly in Taipei time',async()=>{const f=fixture();const startTimeMillis=Date.parse('2026-11-03T23:30:00+08:00'),endTimeMillis=Date.parse('2026-11-04T00:30:00+08:00');assert.equal((await f.schedule({startTimeMillis,endTimeMillis})).status,200);assert.equal(f.data.get('classes/course').endTime.toMillis()-f.data.get('classes/course').startTime.toMillis(),3600000)});
function editorFixture(props = {}) {
  const values = []; let cursor = 0, requests = [], confirmed = true;
  const jsx = { jsx:(type,props)=>({type,props}), jsxs:(type,props)=>({type,props}) };
  const cache = {};
  function load(name) {
    if(cache[name])return cache[name];const loaded={exports:{}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:loaded,exports:loaded.exports,Date,Error,crypto:{randomUUID:()=> 'operation-fixed'},window:{confirm:()=>confirmed},fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({success:true,notifiedStudents:1})}},require:id=>{
      if(id==='react')return {useState:initial=>{const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next}];}};
      if(id==='react/jsx-runtime')return jsx;
      if(id==='@/lib/firebase')return {auth:{currentUser:{getIdToken:async()=> 'token'}}};
      if(id==='@/lib/classScheduleDefaults')return load('lib/classScheduleDefaults.ts');
      throw Error(id);
    }});return cache[name]=loaded.exports;
  }
  const Component=load('components/AdminEditClassSchedule.tsx').default;
  const courseProps={classId:'course',startTimeMillis:Date.parse('2026-11-02T19:00:00+08:00'),endTimeMillis:Date.parse('2026-11-02T20:00:00+08:00'),status:'open',...props};
  const render=()=>{cursor=0;return Component(courseProps)};
  function nodes(tree,type){if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(n=>nodes(n,type));return [...(tree.type===type?[tree]:[]),...nodes(tree.props?.children,type)]}
  return {render,nodes,requests,confirm:value=>{confirmed=value}};
}
test('schedule editor opens in Taipei time and start change defaults to one hour with manual override',()=>{const f=editorFixture();f.nodes(f.render(),'button')[0].props.onClick();let tree=f.render();const inputs=f.nodes(tree,'input');assert.equal(inputs.find(n=>n.props.type==='date').props.value,'2026-11-02');assert.equal(inputs.filter(n=>n.props.type==='time')[0].props.value,'19:00');inputs.filter(n=>n.props.type==='time')[0].props.onChange({target:{value:'23:30'}});tree=f.render();assert.equal(f.nodes(tree,'input').filter(n=>n.props.type==='time')[1].props.value,'00:30');assert.equal(f.nodes(tree,'input').find(n=>n.props.type==='checkbox').props.checked,true);f.nodes(tree,'input').filter(n=>n.props.type==='time')[1].props.onChange({target:{value:'01:00'}});assert.equal(f.nodes(f.render(),'input').filter(n=>n.props.type==='time')[1].props.value,'01:00')});
test('actual schedule form submits original timestamps, reason and idempotency key',async()=>{const f=editorFixture();f.nodes(f.render(),'button')[0].props.onClick();let tree=f.render();f.nodes(tree,'input').find(n=>n.props.type==='date').props.onChange({target:{value:'2026-11-03'}});f.nodes(tree,'input').find(n=>n.props.placeholder).props.onChange({target:{value:'老師調整時間'}});await f.nodes(f.render(),'form')[0].props.onSubmit({preventDefault(){}});assert.equal(f.requests.length,1);assert.equal(f.requests[0].startTimeMillis,Date.parse('2026-11-03T19:00:00+08:00'));assert.equal(f.requests[0].expectedStartTimeMillis,Date.parse('2026-11-02T19:00:00+08:00'));assert.equal(f.requests[0].operationId,'operation-fixed');assert.equal(f.nodes(f.render(),'form').length,0)});
test('declining confirmation never submits a schedule update',async()=>{const f=editorFixture();f.nodes(f.render(),'button')[0].props.onClick();f.nodes(f.render(),'input').find(n=>n.props.placeholder).props.onChange({target:{value:'老師調整時間'}});f.confirm(false);await f.nodes(f.render(),'form')[0].props.onSubmit({preventDefault(){}});assert.equal(f.requests.length,0)});

test('cancellation rechecks role inside the transaction',async()=>{const f=fixture();f.beforeTransaction=()=>{f.data.get('users/admin').role='student'};assert.equal((await f.cancel()).status,403);assert.equal(f.data.get('classes/course').status,'open')});
test('two independent schedule editors cannot silently overwrite each other',async()=>{const f=fixture();const rs=await Promise.all([f.schedule(),f.schedule({operationId:'another-operation',startTimeMillis:f.start+172800000,endTimeMillis:f.end+172800000})]);assert.deepEqual(rs.map(r=>r.status),[200,409]);assert.equal(f.data.get('classes/course').startTime.toMillis(),f.start+86400000)});
test('large schedule changes stop before any writes',async()=>{const f=fixture();for(let i=0;i<451;i++)f.data.set('studentLessonRecords/r'+i,{classId:'course'});const before=JSON.stringify([...f.data]);assert.equal((await f.schedule()).status,409);assert.equal(JSON.stringify([...f.data]),before)});
