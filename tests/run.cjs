const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const p=require('../common.js');
const valid={nama:'Aisyah',cawangan:'PASTI BJ',kategori:'Hadir sahaja',penjaga:'Ahmad',tel:'012-3456789',tetamu:2,khas:''};
test('valid registration and guest boundaries',()=>{p.validate(valid);p.validate({...valid,tetamu:0});p.validate({...valid,tetamu:10});});
test('reject invalid/missing fields and bounds',()=>{for(const change of [{nama:''},{cawangan:'x'.repeat(151)},{kategori:'invalid'},{tel:'abc'},{tetamu:11},{tetamu:-1},{tetamu:1.5},{khas:'a'.repeat(501)}])assert.throws(()=>p.validate({...valid,...change}));});
test('CSV quoting Unicode and formula protection',()=>{const s=p.csv([{...valid,nama:'=1+1',khas:'Koma, "petikan"\nbaris'}]);assert(s.startsWith('\uFEFF'));assert(s.includes('"\'=1+1"'));assert(s.includes('""petikan""'));assert(s.includes('012-3456789'));});
test('all scripts parse',()=>{for(const name of ['common.js','registration.js','admin.js','config.js','api/register.js'])new vm.Script(fs.readFileSync(path.join(root,name),'utf8'),{filename:name});});
test('no original runtime dependency and original responsive style retained',()=>{const html=fs.readFileSync(path.join(root,'pendaftaran-anugerah-pasti.html'),'utf8');assert(!/claude\.use/.test(html));assert(html.includes('max-width:560px'));assert(html.includes('--green:#1f4d3a'));assert(html.includes('prefers-color-scheme:dark'));assert(html.includes('min-height:44px'));});
function dom(){const nodes={};function el(){return {value:'',textContent:'',disabled:false,hidden:false,classList:{add(){},remove(){}},appendChild(){},focus(){},querySelector(){return el();}};}return {nodes,getElementById(id){return nodes[id]||(nodes[id]=el());},createElement:el};}
(async()=>{
let requests=[],document=dom(),c={document,console,Number,JSON,Error,window:null,PASTI_CONFIG:{url:'https://test.supabase.co',key:'sb_publishable_test'},fetch:async(url,o)=>{requests.push({url,o});return {ok:true,status:204,headers:{get(){return null;}},text:async()=>''};}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'common.js'),'utf8'),c);
await c.Pasti.api('/rest/v1/registrations',{method:'POST'});
test('publishable key never sent as bearer',()=>{assert.equal(requests[0].o.headers.apikey,'sb_publishable_test');assert.equal(requests[0].o.headers.Authorization,undefined);});
await c.Pasti.api('/rest/v1/registrations',{},'user-jwt');
test('admin JWT sent as bearer',()=>assert.equal(requests[1].o.headers.Authorization,'Bearer user-jwt'));
c.PASTI_CONFIG.key='sb_secret_bad';await assert.rejects(c.Pasti.api('/rest/v1/registrations'));passed++;console.log('PASS secret key rejected');
c.PASTI_CONFIG.key='sb_publishable_test';c.PASTI_CONFIG.turnstileSiteKey='PUBLIC_TEST_SITEKEY';c.turnstile={render:()=>1,getResponse:()=> 'UNIT_TEST_TOKEN',reset:()=>{}};vm.runInContext(fs.readFileSync(path.join(root,'registration.js'),'utf8'),c);c.pastiTurnstileReady();
Object.keys(valid).filter(k=>k!=='tetamu').forEach(k=>document.getElementById(k).value=valid[k]);
await document.getElementById('hantar').onclick();
test('registration uses same-origin protected endpoint and Turnstile token',()=>{const req=requests[requests.length-1];assert.equal(req.url,'/api/register');assert.equal(req.o.method,'POST');assert.equal(req.o.headers.apikey,undefined);assert.equal(JSON.parse(req.o.body).turnstileToken,'UNIT_TEST_TOKEN');assert.equal(JSON.parse(req.o.body).nama,'Aisyah');assert.equal(document.getElementById('hantar').disabled,false);});
let before=requests.length;c.turnstile.getResponse=()=>'';await document.getElementById('hantar').onclick();test('missing widget token sends no request',()=>assert.equal(requests.length,before));c.turnstile.getResponse=()=>'UNIT_TEST_TOKEN';
c.fetch=async()=>{throw Error('offline');};await document.getElementById('hantar').onclick();
test('network failure displays error and permits retry',()=>{assert.equal(document.getElementById('err').textContent,'offline');assert.equal(document.getElementById('hantar').disabled,false);});
let adminCalls=[],allowed=true,adminDoc=dom();
let a={document:adminDoc,console,setTimeout:()=>1,clearTimeout(){},Number,JSON,Error,Pasti:{categories:p.categories,validate:p.validate,csv:p.csv,api:async(url,o,t)=>{adminCalls.push({url,o,t});if(url.includes('/auth/'))return {access_token:'admin-jwt',expires_in:3600};if(url.includes('is_admin'))return allowed;if(o&&o.method==='PATCH')return [{...valid,id:'record-1'}];return [{...valid,id:'record-1',updated_at:'2026-11-11T00:00:00Z'}];}}};vm.createContext(a);vm.runInContext(fs.readFileSync(path.join(root,'admin.js'),'utf8'),a);
await adminDoc.getElementById('login').onsubmit({preventDefault(){}});
test('admin login loads records and accurate totals',()=>{assert.equal(adminDoc.getElementById('dashboard').hidden,false);assert.equal(adminDoc.getElementById('students').textContent,1);assert.equal(adminDoc.getElementById('guests').textContent,2);assert.equal(adminDoc.getElementById('total').textContent,3);});
adminDoc.getElementById('search').value='missing';adminDoc.getElementById('search').oninput();
test('search filters records',()=>assert.equal(a.filtered.length,0));
a.openEdit(a.records[0]);Object.keys(valid).forEach(k=>adminDoc.getElementById('edit-'+k).value=String(valid[k]));adminDoc.getElementById('edit-nama').value='Nama baru';await adminDoc.getElementById('edit').onsubmit({preventDefault(){}});
test('admin update uses record id and concurrency timestamp',()=>{const call=adminCalls.find(x=>x.o&&x.o.method==='PATCH');assert(call.url.includes('id=eq.record-1&updated_at=eq.'));assert.equal(JSON.parse(call.o.body).nama,'Nama baru');assert.equal(call.t,'admin-jwt');});
allowed=false;await adminDoc.getElementById('reload').onclick();
test('revoked admin access clears sensitive records',()=>{assert.equal(a.token,null);assert.equal(a.records.length,0);assert.equal(adminDoc.getElementById('dashboard').hidden,true);});
test('Vercel Preview Git integration and Turnstile CSP',()=>{const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json')));assert.equal(config.git.deploymentEnabled,true);const csp=config.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;assert(csp.includes("connect-src 'self'"));assert(csp.includes('frame-src https://challenges.cloudflare.com'));assert(csp.includes("script-src 'self' https://challenges.cloudflare.com"));});
console.log(passed+' tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
