const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require('typescript');
const root=process.env.NAYA_TEST_SOURCE_ROOT || path.resolve(__dirname,'..');
const clone=x=>structuredClone(x);

function fixture(){
 const data=new Map();let queue=Promise.resolve();let tick=0;
 const env={NAYA_NEW_STUDENT_APPROVAL_ENABLED:'true',NAYA_LEGACY_HISTORY_COMPLETE:'true'};
 const snap=key=>({id:key.split('/').at(-1),exists:data.has(key),data:()=>clone(data.get(key))});
 const query=(collection,field,value)=>({collection,field,value,query:true,get:async()=>read({collection,field,value,query:true})});
 const read=ref=>ref.query?{get empty(){return this.docs.length===0},docs:[...data].filter(([k,v])=>k.startsWith(ref.collection+'/')&&v[ref.field]===ref.value).map(([k])=>snap(k))}:snap(ref.key);
 const db={collection:name=>({doc:id=>({key:name+'/'+id,get:async()=>snap(name+'/'+id)}),where:(f,op,v)=>query(name,f,v)}),runTransaction:fn=>{
  const job=queue.then(async()=>{const writes=[];const result=await fn({get:async ref=>{if(writes.length)throw Error('Read after write');return read(ref)},set:(r,v)=>writes.push(['set',r.key,v]),create:(r,v)=>writes.push(['create',r.key,v]),update:(r,v)=>writes.push(['update',r.key,v])});
   for(const [kind,key,value] of writes){
    if(kind==='create'&&data.has(key))throw Error('Already exists');
    if(kind==='update'&&!data.has(key))throw Error('Not found');
   }
   for(const [kind,key,value] of writes){
    const next=kind==='update'?clone(data.get(key)):{};
    for(const [field,v] of Object.entries(value)){
     const parts=field.split('.');let target=next;
     for(const p of parts.slice(0,-1))target=target[p]??=( {} );
     target[parts.at(-1)]=clone(v);
    }
    data.set(key,next);
   }
   return result;
  });queue=job.catch(()=>{});return job;
 }};
 const auth={verifyIdToken:async token=>{if(!['student','admin'].includes(token))throw Object.assign(Error('invalid'),{code:'auth/id-token-expired'});return{uid:token}},getUser:async()=>({emailVerified:true})};
 const cache={};
 function load(name){if(cache[name])return cache[name];const source=fs.readFileSync(path.join(root,name),'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(js,{module,exports:module.exports,require:id=>{
  if(id==='next/server')return{NextResponse:{json:(body,opt)=>new Response(JSON.stringify(body),opt)}};
  if(id==='firebase-admin/firestore')return{FieldValue:{serverTimestamp:()=>++tick}};
  if(id==='@/lib/firebaseAdmin')return{adminDb:db,adminAuth:auth};
  if(id.startsWith('@/lib/'))return load(id.slice(2)+'.ts');
  throw Error('Unknown module '+id);
 },process:{env},console:{error:()=>{}}},{filename:name});
 return cache[name]=module.exports;
 }
 const purchase=load('app/api/new-student-offers/purchase/route.ts').POST;
 const approve=load('app/api/admin/new-student-offers/approve/route.ts').POST;
 const request=(body,token)=>new Request('http://localhost/test',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
 const buy=(offerId='trial_yoga',extra={},token='student')=>purchase(request({offerId,paymentMethod:'transfer',transferLastFive:'12345',...extra},token));
 const finish=(offerId='trial_yoga',token='admin')=>approve(request({requestId:`new_student_student_${offerId}`},token));
 data.set('users/student',{role:'student',isNewStudent:true,newStudentEligibilityVerified:true,points:0});
 data.set('users/admin',{role:'admin'});
 data.get('users/student').phoneNormalized='0912345678';
 data.set('phoneRegistry/0912345678',{userId:'student'});
 return{data,auth,env,buy,finish,purchase,approve,request,eligibility:load('app/api/new-student-offers/eligibility/route.ts').POST};
}

for(const [offerId,price,points,kind] of [['trial_yoga',320,0,'yoga'],['trial_aerial',450,0,'aerial'],['starter_12',1260,12,null]]){
 test(offerId+' purchase and approval issue correct entitlement exactly once',async()=>{
  const f=fixture();const r=await f.buy(offerId);assert.equal(r.status,200);assert.equal((await r.json()).finalPrice,price);
  assert.equal((await f.finish(offerId)).status,200);
  assert.equal(f.data.get('users/student').points,points);
  assert.equal(f.data.get('users/student').isNewStudent,true);
  assert.equal(f.data.get('users/student').newStudentOfferPurchases[offerId],true);
  if(kind)assert.equal(f.data.get(`trialVouchers/new_student_student_${offerId}`).kind,kind);
  assert.equal((await f.finish(offerId)).status,400);
  assert.equal((await f.buy(offerId)).status,400);
 });
}
test('all three offers are independently purchasable',async()=>{const f=fixture();for(const id of ['trial_yoga','trial_aerial','starter_12']){assert.equal((await f.buy(id)).status,200);assert.equal((await f.finish(id)).status,200)}assert.equal(f.data.get('users/student').points,12)});
test('concurrent submissions create one pending order',async()=>{const f=fixture();const rs=await Promise.all([f.buy(),f.buy()]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,400])});
test('concurrent approvals add points once',async()=>{const f=fixture();await f.buy('starter_12');const rs=await Promise.all([f.finish('starter_12'),f.finish('starter_12')]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,400]);assert.equal(f.data.get('users/student').points,12)});
test('eligibility is derived from history rather than an unverified signup flag',async()=>{const f=fixture();f.data.get('users/student').isNewStudent=false;f.data.get('users/student').newStudentEligibilityVerified=false;assert.equal((await f.buy()).status,200);assert.equal((await f.finish()).status,200)});
test('incomplete history blocks creation and approval',async()=>{const f=fixture();await f.buy();f.env.NAYA_LEGACY_HISTORY_COMPLETE='false';assert.equal((await f.finish()).status,400);assert.equal((await f.buy('starter_12')).status,400)});
for(const field of ['legacyMemberId','legacyClaimedAt','legacyStatus'])test('rejects linked legacy member '+field,async()=>{const f=fixture();await f.buy();f.data.get('users/student')[field]=field==='legacyStatus'?'claimed':'legacy';assert.equal((await f.finish()).status,400);assert.equal((await f.buy('starter_12')).status,400)});
test('regular purchase between submission and approval denies entitlement',async()=>{const f=fixture();await f.buy();f.data.set('packageSales/regular',{studentId:'student',packageId:'new_student_forged'});assert.equal((await f.finish()).status,400);assert.equal((await f.buy('starter_12')).status,400)});
test('durable per-offer claim prevents repurchase after request deletion',async()=>{const f=fixture();await f.buy();await f.finish();f.data.delete('purchaseRequests/new_student_student_trial_yoga');f.data.delete('packageSales/request_new_student_student_trial_yoga');f.data.delete('trialVouchers/new_student_student_trial_yoga');assert.equal((await f.buy()).status,400)});
test('rejected unpaid application can be submitted again',async()=>{const f=fixture();await f.buy();f.data.get('purchaseRequests/new_student_student_trial_yoga').status='rejected';assert.equal((await f.buy()).status,200)});
for(const patch of [{finalPrice:1},{finalPrice:'320'},{couponCode:'extra'},{discountValue:.5},{paymentMethod:'unknown'},{paymentMethod:'transfer',transferLastFive:'123'}])test('approval rejects tampering '+JSON.stringify(patch),async()=>{const f=fixture();await f.buy();Object.assign(f.data.get('purchaseRequests/new_student_student_trial_yoga'),patch);assert.equal((await f.finish()).status,400);assert.equal(f.data.has('trialVouchers/new_student_student_trial_yoga'),false)});
test('server ignores caller-supplied prices and coupons at creation',async()=>{const f=fixture();await f.buy('starter_12',{finalPrice:1,couponCode:'fake'});const o=f.data.get('purchaseRequests/new_student_student_starter_12');assert.equal(o.finalPrice,1260);assert.equal(o.couponCode,null)});
test('nonadmin cannot approve',async()=>{const f=fixture();await f.buy();assert.equal((await f.finish('trial_yoga','student')).status,403)});
test('unverified email cannot purchase',async()=>{const f=fixture();f.auth.getUser=async()=>({emailVerified:false});assert.equal((await f.buy()).status,403)});
test('invalid token returns 401',async()=>{const f=fixture();assert.equal((await f.buy('trial_yoga',{},'invalid')).status,401);assert.equal((await f.finish('trial_yoga','invalid')).status,401)});
test('malformed JSON returns 400',async()=>{const f=fixture();assert.equal((await f.purchase(f.request('{','student'))).status,400);assert.equal((await f.approve(f.request('{','admin'))).status,400)});

test('matching old phone denies eligibility even before a claim',async()=>{const f=fixture();f.data.set('legacyMembers/old',{phoneNormalized:'0912345678'});assert.equal((await f.buy()).status,400)});
test('another registry owner blocks eligibility',async()=>{const f=fixture();f.data.set('phoneRegistry/0912345678',{userId:'other'});assert.equal((await f.buy()).status,400)});
test('pending legacy claim blocks eligibility',async()=>{const f=fixture();f.data.set('legacyClaimRequests/student',{status:'pending'});assert.equal((await f.buy()).status,400)});
test('eligibility refresh writes server-owned flags for a new registration',async()=>{const f=fixture();Object.assign(f.data.get('users/student'),{isNewStudent:false,newStudentEligibilityVerified:false});const r=await f.eligibility(f.request({},'student'));assert.equal(r.status,200);assert.equal((await r.json()).status,'eligible');assert.equal(f.data.get('users/student').isNewStudent,true)});
test('eligibility refresh does not revive consumed eligibility',async()=>{const f=fixture();f.data.get('users/student').isNewStudent=false;const r=await f.eligibility(f.request({},'student'));assert.equal((await r.json()).status,'ineligible')});
test('closed rollout rejects new purchases and approvals',async()=>{const f=fixture();await f.buy();f.env.NAYA_NEW_STUDENT_APPROVAL_ENABLED='false';assert.equal((await f.buy('starter_12')).status,503);assert.equal((await f.finish()).status,503)});

for(const offerId of ['trial_yoga','trial_aerial','starter_12']) {
 test(offerId+' rejects cash at submission',async()=>{const f=fixture();assert.equal((await f.buy(offerId,{paymentMethod:'cash'})).status,400);assert.equal(f.data.has(`purchaseRequests/new_student_student_${offerId}`),false)});
 test(offerId+' rejects existing cash order at approval',async()=>{const f=fixture();await f.buy(offerId);f.data.get(`purchaseRequests/new_student_student_${offerId}`).paymentMethod='cash';assert.equal((await f.finish(offerId)).status,400);assert.equal(f.data.has(`packageSales/request_new_student_student_${offerId}`),false);assert.equal(f.data.get('users/student').points,0)});
}
test('LINE Pay Money is rejected for new submissions',async()=>{const f=fixture();assert.equal((await f.buy('starter_12',{paymentMethod:'linepay_money'})).status,400)});

const ids=['trial_yoga','trial_aerial','starter_12'];
const key=items=>'new_student_student_'+[...items].sort().join('+');
const basket=(f,items,extra={})=>f.purchase(f.request({offerIds:items,paymentMethod:'transfer',transferLastFive:'12345',...extra},'student'));
const approveBasket=(f,items)=>f.approve(f.request({requestId:key(items)},'admin'));
test('all three: one order, NT2030, one approval, two vouchers and twelve points',async()=>{
 const f=fixture();const r=await basket(f,ids);assert.equal(r.status,200);assert.equal((await r.json()).finalPrice,2030);
 assert.equal([...f.data.keys()].filter(k=>k.startsWith('purchaseRequests/')).length,1);
 assert.equal(f.data.get('users/student').points,0);assert.equal([...f.data.keys()].filter(k=>k.startsWith('trialVouchers/')).length,0);
 assert.equal((await approveBasket(f,ids)).status,200);
 assert.equal(f.data.get('users/student').points,12);
 assert.equal([...f.data.keys()].filter(k=>k.startsWith('trialVouchers/')).length,2);
 assert.equal([...f.data.keys()].filter(k=>k.startsWith('packageSales/')).length,3);
 assert.equal([...f.data.keys()].filter(k=>k.startsWith('pointTransactions/')).length,1);
 assert.equal([...f.data.keys()].filter(k=>k.startsWith('notifications/')).length,1);
 assert.equal((await approveBasket(f,ids)).status,400);
 assert.equal(f.data.get('users/student').points,12);
});
for(const items of [[],['bad'],['trial_yoga','trial_yoga'],['trial_yoga','trial_aerial','starter_12','trial_yoga'],null,'trial_yoga'])test('invalid basket '+JSON.stringify(items),async()=>{
 const f=fixture();assert.equal((await basket(f,items)).status,400);assert.equal([...f.data.keys()].some(k=>k.startsWith('purchaseRequests/')),false);
});
test('selection order does not change basket identity',async()=>{const f=fixture();const a=await basket(f,ids);const body=await a.json();assert.equal(body.requestId,key(ids));assert.equal((await basket(f,[...ids].reverse())).status,400)});
test('overlapping concurrent baskets cannot reserve the same offer twice',async()=>{const f=fixture();const results=await Promise.all([basket(f,['trial_yoga','starter_12']),basket(f,['trial_aerial','starter_12'])]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal([...f.data.keys()].filter(k=>k.startsWith('purchaseRequests/')).length,1)});
test('concurrent approvals issue all entitlements once',async()=>{const f=fixture();await basket(f,ids);const results=await Promise.all([approveBasket(f,ids),approveBasket(f,ids)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(f.data.get('users/student').points,12)});
test('old pending single offer blocks overlapping basket',async()=>{const f=fixture();await f.buy('trial_yoga');f.data.delete('newStudentOfferClaims/new_student_student_trial_yoga');assert.equal((await basket(f,ids)).status,400)});
test('pending basket blocks old single submission',async()=>{const f=fixture();await basket(f,ids);assert.equal((await f.buy('trial_yoga')).status,400)});
test('rejected basket releases availability for new selection',async()=>{const f=fixture();await basket(f,ids);f.data.get('purchaseRequests/'+key(ids)).status='rejected';assert.equal((await basket(f,['trial_yoga','starter_12'])).status,200);assert.equal((await approveBasket(f,['trial_yoga','starter_12'])).status,200);assert.equal(f.data.get('users/student').points,12)});
test('unselected offer can be purchased later',async()=>{const f=fixture();await basket(f,['trial_yoga','trial_aerial']);await approveBasket(f,['trial_yoga','trial_aerial']);assert.equal((await f.buy('starter_12')).status,200);assert.equal((await f.finish('starter_12')).status,200)});
test('server computes aggregate price and rejects approval after tampering',async()=>{const f=fixture();await basket(f,ids,{finalPrice:1});const order=f.data.get('purchaseRequests/'+key(ids));assert.equal(order.finalPrice,2030);order.finalPrice=1;assert.equal((await approveBasket(f,ids)).status,400);assert.equal(f.data.get('users/student').points,0);assert.equal([...f.data.keys()].some(k=>k.startsWith('trialVouchers/')),false)});
test('eligibility returns pending items and releases rejected ones',async()=>{const f=fixture();await basket(f,['trial_yoga','starter_12']);let r=await f.eligibility(f.request({},'student'));assert.deepEqual((await r.json()).unavailableOfferIds.sort(),['starter_12','trial_yoga']);f.data.get('purchaseRequests/'+key(['trial_yoga','starter_12'])).status='rejected';r=await f.eligibility(f.request({},'student'));assert.deepEqual((await r.json()).unavailableOfferIds,[])});
test('legacy order without offerIds or claims still approves',async()=>{const f=fixture();await f.buy();const order=f.data.get('purchaseRequests/new_student_student_trial_yoga');delete order.offerIds;order.offerId='trial_yoga';f.data.delete('newStudentOfferClaims/new_student_student_trial_yoga');assert.equal((await f.finish()).status,200)});
test('an error in one basket item prevents partial issuance',async()=>{const f=fixture();await basket(f,ids);f.data.set('trialVouchers/new_student_student_trial_aerial',{status:'used'});assert.equal((await approveBasket(f,ids)).status,400);assert.equal(f.data.get('users/student').points,0);assert.equal(f.data.has('trialVouchers/new_student_student_trial_yoga'),false);assert.equal(f.data.get('purchaseRequests/'+key(ids)).status,'pending')});

function renderOffers(eligibility,selected=[]){
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const state=[eligibility,'',false,false,selected,'12345'];let index=0;
 const js=ts.transpileModule(fs.readFileSync(path.join(root,'components/NewStudentOffers.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const offersJs=ts.transpileModule(fs.readFileSync(path.join(root,'lib/newStudentOffers.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const offerModule={exports:{}};vm.runInNewContext(offersJs,{module:offerModule,exports:offerModule.exports});
 const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:id=>{
  if(id==='react')return {...React,useState:()=>[state[index++],()=>{}],useEffect:()=>{},useCallback:fn=>fn};
  if(id==='react/jsx-runtime')return require('react/jsx-runtime');
  if(id==='firebase/auth')return {onAuthStateChanged:()=>{}};
  if(id==='@/lib/firebase')return {auth:{}};
  if(id==='@/lib/newStudentOffers')return offerModule.exports;
  throw Error('Unknown module '+id);
 }});
 return renderToStaticMarkup(React.createElement(module.exports.default));
}
test('basket UI shows three selections and correct NT2030 combined total',()=>{
 const html=renderOffers({status:'eligible',purchasingEnabled:true},ids);
 assert.equal((html.match(/type="checkbox"/g)||[]).length,3);
 assert.match(html,/2,030/);assert.match(html,/一次送出購買申請/);
 assert.equal((html.match(/轉出帳號末五碼/g)||[]).length,2); // instruction and one input label
 assert.match(html,/888501184231/);assert.doesNotMatch(html,/LINE Pay/);
});
test('ineligible and checking members do not see offers',()=>{
 assert.equal(renderOffers({status:'ineligible'}),'');assert.equal(renderOffers(null),'');
});
test('pending or purchased offer checkbox is disabled',()=>{
 const html=renderOffers({status:'eligible',purchasingEnabled:true,unavailableOfferIds:['trial_yoga']});
 assert.match(html,/已申請或已購買/);assert.match(html,/type="checkbox"[^>]* disabled=""/);
});

function verifiedLegacy(f, patch={}) {
 Object.assign(f.data.get('users/student'), { legacyMemberId:'old',legacyClaimedAt:1,isNewStudent:false,newStudentEligibilityVerified:true,newStudentEligibilityReason:'legacy_member' });
 f.data.set('legacyMembers/old',{phoneNormalized:'0912345678',status:'claimed',claimedBy:'student',purchaseHistoryStatus:'never_purchased',purchaseHistoryVerifiedBy:'admin',purchaseHistoryVerifiedAt:1,...patch});
 f.data.set('legacyClaimRequests/student',{uid:'student',status:'approved',legacyMemberId:'old'});
}
test('registered-only legacy member can buy and receive all new-student offers once',async()=>{
 const f=fixture();verifiedLegacy(f);const r=await basket(f,ids);assert.equal(r.status,200);assert.equal((await approveBasket(f,ids)).status,200);
 assert.equal(f.data.get('users/student').points,12);assert.equal((await f.buy('trial_yoga')).status,400);
});
test('legacy identity does not block confirmed never-purchased account eligibility',async()=>{
 const f=fixture();verifiedLegacy(f);const r=await f.eligibility(f.request({},'student'));assert.equal((await r.json()).status,'eligible');assert.equal(f.data.get('users/student').isNewStudent,true);
});
test('unverified historical purchase status stays pending even when balance is zero',async()=>{
 const f=fixture();verifiedLegacy(f,{purchaseHistoryStatus:'unknown'});const r=await f.eligibility(f.request({},'student'));const result=await r.json();assert.equal(result.status,'pending');assert.equal(result.reason,'legacy_purchase_history_pending');assert.equal((await f.buy()).status,400);
});
test('a never-purchased status without verification provenance is not sufficient',async()=>{
 const f=fixture();verifiedLegacy(f);delete f.data.get('legacyMembers/old').purchaseHistoryVerifiedBy;const result=await (await f.eligibility(f.request({},'student'))).json();assert.equal(result.status,'pending');
});
test('legacy purchaser remains ineligible even after using every point',async()=>{
 const f=fixture();verifiedLegacy(f,{purchaseHistoryStatus:'purchased'});const result=await (await f.eligibility(f.request({},'student'))).json();assert.equal(result.status,'ineligible');assert.equal(result.reason,'legacy_purchase');assert.equal((await f.buy()).status,400);
});
test('old general purchases found by legacy ID override no-purchase assertion',async()=>{
 const f=fixture();verifiedLegacy(f);f.data.set('packageSales/old-sale',{studentId:'old'});assert.equal((await f.buy()).status,400);
});
test('old general purchases linked by legacyMemberId override assertion at approval',async()=>{
 const f=fixture();verifiedLegacy(f);assert.equal((await f.buy()).status,200);f.data.set('packageSales/old-sale',{legacyMemberId:'old'});assert.equal((await f.finish()).status,400);assert.equal(f.data.has('trialVouchers/new_student_student_trial_yoga'),false);
});
test('historical purchase discovered between submission and approval prevents issuance',async()=>{
 const f=fixture();verifiedLegacy(f);await f.buy('starter_12');f.data.get('legacyMembers/old').purchaseHistoryStatus='purchased';assert.equal((await f.finish('starter_12')).status,400);assert.equal(f.data.get('users/student').points,0);
});
test('all matching legacy records must have verified no-purchase history',async()=>{
 const f=fixture();verifiedLegacy(f);f.data.set('legacyMembers/other-old',{phoneNormalized:'0912345678'});assert.equal((await f.buy()).status,400);
});
test('approved claim of another member cannot establish eligibility',async()=>{
 const f=fixture();verifiedLegacy(f,{claimedBy:'other'});assert.equal((await f.buy()).status,400);
});
test('pending claim still requires identity review even with no-purchase history',async()=>{
 const f=fixture();verifiedLegacy(f);f.data.get('legacyClaimRequests/student').status='pending';const result=await (await f.eligibility(f.request({},'student'))).json();assert.equal(result.reason,'legacy_claim_review');assert.equal((await f.buy()).status,400);
});
test('missing linked legacy record remains pending rather than becoming new',async()=>{
 const f=fixture();verifiedLegacy(f);f.data.delete('legacyMembers/old');const result=await (await f.eligibility(f.request({},'student'))).json();assert.equal(result.status,'pending');
});
test('verified legacy history does not reset a consumed general benefit',async()=>{
 const f=fixture();verifiedLegacy(f);f.data.get('users/student').newStudentEligibilityReason='eligibility_consumed';assert.equal((await f.buy()).status,400);
});
