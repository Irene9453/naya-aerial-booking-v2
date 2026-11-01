const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
test('revenue month follows receipt while today totals remain actual today',()=>{
 const now=Date.parse('2026-11-01T12:00:00+08:00');class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const state=['2026-10',[{id:'oct',status:'completed',price:1000,paymentReceivedAtMillis:Date.parse('2026-10-31T20:00:00+08:00'),createdAt:null},{id:'nov',status:'completed',price:2000,paymentReceivedAtMillis:Date.parse('2026-11-01T08:00:00+08:00'),createdAt:null},{id:'legacy',status:'completed',price:100,paymentReceivedAtMillis:null,createdAt:{toDate:()=>new Date('2026-10-15T10:00:00+08:00')}}],false,''];let index=0;
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/AdminRevenueSummary.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,Date:ClockDate,Intl,require:id=>{
 if(id==='react')return{useState:()=>[state[index++],()=>{}],useEffect:()=>{},useMemo:fn=>fn()};if(id==='react/jsx-runtime')return jsx;if(id==='firebase/firestore')return{};if(id==='@/lib/firebase')return{db:{}};throw Error(id);
 }});
 const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree!=='object'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
 function card(tree,label){if(!tree||typeof tree!=='object')return null;if(Array.isArray(tree))return tree.map(item=>card(item,label)).find(Boolean);if(tree.type==='div'&&Array.isArray(tree.props?.children)&&tree.props.children.some(child=>child?.type==='p'&&text(child)===label))return text(tree);return card(tree.props?.children,label)}
 let tree=module.exports.default();assert.match(card(tree,'選定月份收入'),/1,100/);assert.match(card(tree,'今日收入'),/2,000/);assert.match(card(tree,'累計收入'),/3,100/);
 state[0]='2026-11';index=0;tree=module.exports.default();assert.match(card(tree,'選定月份收入'),/2,000/);assert.match(card(tree,'今日收入'),/2,000/);
});
