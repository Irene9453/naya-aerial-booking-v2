const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function harness(file){
 const states=[],effects=[],pending=[],timers=new Map(),listeners=[],snapshots=[],redirects=[];let cursor=0,effectCursor=0,timerId=0;
 const auth={currentUser:null};const router={replace:value=>redirects.push(value),push:value=>redirects.push(value)};
 const Link=()=>null;const imports={};let docResult=()=>Promise.resolve({exists:()=>true,data:()=>({role:'student'})});
 const setTimer=fn=>{const id=++timerId;timers.set(id,fn);return id};const clearTimer=id=>timers.delete(id);
 const react={useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}]},
 useEffect(fn,deps){const index=effectCursor++;const prior=effects[index];if(!prior||deps.some((v,i)=>v!==prior.deps[i]))pending.push(()=>{prior?.cleanup?.();effects[index]={deps,cleanup:fn()}})},useMemo:fn=>fn(),useCallback:fn=>fn};
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const firestore={doc:(_db,collection,id)=>({path:`${collection}/${id}`}),collection:(_db,name)=>({path:name}),query:ref=>ref,where:()=>null,
 getDoc:ref=>docResult(ref),onSnapshot:(ref,next,error)=>{const record={ref,next,error,active:true};snapshots.push(record);return()=>{record.active=false}},Timestamp:class{}};
 const firebaseAuth={onAuthStateChanged:(_auth,next,error)=>{const record={next,error,active:true};listeners.push(record);return()=>record.active=false},reload:async()=>{},sendEmailVerification:async()=>{},signOut:async()=>{}};
 function load(name){if(imports[name])return imports[name];const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,Error,setTimeout:setTimer,clearTimeout:clearTimer,AbortSignal,Date,URLSearchParams,process:{env:{}},console:{error(){}},require:id=>{
  if(id==='react')return react;if(id==='react/jsx-runtime')return jsx;if(id==='next/link')return Link;if(id==='next/image')return()=>null;if(id==='next/navigation')return{useRouter:()=>router};
  if(id==='firebase/auth')return firebaseAuth;if(id==='firebase/firestore')return firestore;if(id==='@/lib/firebase')return{auth,db:{}};
  if(id==='@/lib/clientConnection')return load('lib/clientConnection.ts');
  if(id.startsWith('@/components/'))return new Proxy(()=>null,{get:()=>()=>null});
  if(id.startsWith('@/lib/'))return new Proxy(()=>null,{get:()=>()=>null});
  throw Error(id);
 }},{filename:name});return imports[name]=module.exports;
 }
 const Component=load(file).default;
 const render=()=>{cursor=effectCursor=0;const tree=Component();pending.splice(0).forEach(fn=>fn());return tree};
 function nodes(tree,filter){if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(item=>nodes(item,filter));return[...(filter(tree)?[tree]:[]),...nodes(tree.props?.children,filter)]}
 const text=tree=>{if(tree==null||typeof tree==='boolean')return'';if(typeof tree!=='object')return String(tree);return Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children)};
 const emit=async user=>{auth.currentUser=user;for(const listener of listeners.filter(x=>x.active))await listener.next(user)};
 render();return{render,emit,auth,states,listeners,snapshots,timers,redirects,nodes,text,Link,setDoc:fn=>{docResult=fn},unmount:()=>effects.forEach(effect=>effect?.cleanup?.()),fireTimers:()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn()}}};
}
const admin={uid:'admin',emailVerified:true};const student={uid:'student',emailVerified:true};
const profile=(f,uid)=>f.snapshots.findLast(x=>x.ref.path===`users/${uid}`&&x.active);
const snapshot=role=>({exists:()=>true,data:()=>({role})});
test('navbar always has a clickable login link before auth resolves',()=>{const f=harness('components/Navbar.tsx');assert.ok(f.nodes(f.render(),n=>n.type===f.Link&&n.props.href==='/login').length);f.unmount()});
test('navbar keeps signed-in member link clickable during role loading',async()=>{const f=harness('components/Navbar.tsx');await f.emit(admin);assert.ok(f.nodes(f.render(),n=>n.type===f.Link&&n.props.href==='/member').length);assert.ok(f.nodes(f.render(),n=>n.type===f.Link&&n.props.href==='/login').length);f.unmount()});
test('failed role fetch never assigns student and can recover to admin',async()=>{const f=harness('components/Navbar.tsx');await f.emit(admin);const p=profile(f,'admin');p.error(Error('offline'));assert.equal(f.states[1],null);assert.ok(f.nodes(f.render(),n=>n.type===f.Link&&n.props.href==='/login').length);p.next(snapshot('admin'));assert.ok(f.nodes(f.render(),n=>n.type===f.Link&&n.props.href==='/admin').length);f.unmount()});
test('navbar unsubscribes former account and ignores stale admin result',async()=>{const f=harness('components/Navbar.tsx');await f.emit(admin);const old=profile(f,'admin');await f.emit(student);assert.equal(old.active,false);old.next(snapshot('admin'));assert.equal(f.states[1],null);profile(f,'student').next(snapshot('student'));assert.equal(f.states[1],'student');f.unmount();assert.ok(f.snapshots.every(x=>!x.active))});
test('admin guard renders recovery screen on profile error, not admin tools',async()=>{const f=harness('app/admin/page.tsx');await f.emit(admin);profile(f,'admin').error({code:'unavailable'});const text=f.text(f.render());assert.match(text,/暫時無法開啟管理後台/);assert.doesNotMatch(text,/收入統計/);assert.ok(f.nodes(f.render(),n=>n.type===f.Link&&n.props.href==='/login?redirect=/admin').length);f.unmount()});
test('admin account change clears old profile and collection subscriptions',async()=>{const f=harness('app/admin/page.tsx');await f.emit(admin);profile(f,'admin').next(snapshot('admin'));const old=[...f.snapshots];await f.emit(student);assert.ok(old.every(x=>!x.active));old[0].next(snapshot('admin'));assert.match(f.text(f.render()),/管理後台載入中/);profile(f,'student').next(snapshot('student'));assert.ok(f.redirects.includes('/member'));f.unmount();assert.ok(f.snapshots.every(x=>!x.active))});
test('admin does not duplicate collection subscriptions after profile refresh',async()=>{const f=harness('app/admin/page.tsx');await f.emit(admin);const p=profile(f,'admin');p.next(snapshot('admin'));const count=f.snapshots.length;p.next(snapshot('admin'));assert.equal(f.snapshots.length,count);f.unmount()});
test('admin loading deadline exposes retry and login without granting admin access',async()=>{const f=harness('app/admin/page.tsx');await f.emit(admin);f.fireTimers();assert.match(f.text(f.render()),/暫時無法開啟管理後台/);assert.match(f.text(f.render()),/重新載入/);f.unmount()});
test('member profile offline failure displays retry and login',async()=>{const f=harness('app/member/page.tsx');f.setDoc(async()=>{throw Object.assign(Error('offline'),{code:'unavailable'})});await f.emit(student);const text=f.text(f.render());assert.match(text,/目前無法連線/);assert.match(text,/重新載入/);assert.ok(f.nodes(f.render(),n=>n.type===f.Link&&n.props.href==='/login').length);f.unmount()});
test('member ignores initial profile request from a previous account',async()=>{const f=harness('app/member/page.tsx');let resolve;f.setDoc(()=>new Promise(r=>{resolve=r}));const previous=f.emit(admin);await Promise.resolve();await f.emit(null);resolve(snapshot('admin'));await previous;assert.equal(f.snapshots.length,0);assert.ok(f.redirects.includes('/login'));f.unmount()});
test('member loading deadline gives recovery even if auth never responds',()=>{const f=harness('app/member/page.tsx');f.fireTimers();assert.match(f.text(f.render()),/無法顯示會員資料/);assert.match(f.text(f.render()),/前往登入頁/);f.unmount()});
