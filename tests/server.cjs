const assert=require('node:assert/strict'),{createHandler}=require('../api/register.js'),{createHmac}=require('node:crypto');
const env={VERCEL:'1',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVER_KEY:'sb_secret_UNIT_TEST_ONLY',TURNSTILE_SECRET_KEY:'UNIT_TEST_ONLY',RATE_LIMIT_SECRET:'unit-test-only-32-characters-long-value',REGISTRATION_ORIGINS:'https://example.test'};
const registration={nama:'UJIAN',cawangan:'BJ',kategori:'Hadir sahaja',penjaga:'UJIAN',tel:'0000000000',tetamu:2,khas:'',turnstileToken:'UNIT_TEST_TOKEN'};
const verdict=()=>({success:true,hostname:'example.test',action:'pasti_registration',challenge_ts:new Date().toISOString()});
async function invoke(options={}){
 const calls=[],req={method:'POST',headers:{},socket:{remoteAddress:'127.0.0.1'},body:{...registration}};
 Object.assign(req,options.req);req.headers={origin:'https://example.test','content-type':'application/json','x-forwarded-for':'203.0.113.1',...options.headers};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};
 const request=async(url,o)=>{
  calls.push({url,options:o});if(options.throwFetch)throw Error('simulated transport failure');
  let data=true,ok=true;
  if(url.includes('consume_registration_rate')){data=options.rate??true;ok=!options.rateFailure;}
  else if(url.includes('siteverify')){data=options.verdict??verdict();ok=!options.verifyFailure;}
  else if(url.includes('submit_registration')){data=options.saved??true;ok=!options.saveFailure;}
  else throw Error('Unexpected network call');
  return {ok,json:async()=>data};
 };
 await createHandler({...env,...options.env},request)(req,res);return {res,calls};
}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
 await test('verify before saving; response contains no PII; ignore generated fields',async()=>{
  const {res,calls}=await invoke({req:{body:{...registration,id:'ATTACK',masa:'ATTACK'}}});
  assert.equal(res.code,202);assert.equal(calls.length,3);
  assert(calls[0].url.includes('consume_registration_rate'));assert(calls[1].url.includes('siteverify'));assert(calls[2].url.includes('submit_registration'));
  const d=JSON.parse(calls[2].options.body).p_data;assert(!('id'in d));assert(!('masa'in d));assert(!('turnstileToken'in d));
  assert(!JSON.stringify(res.body).includes(registration.nama));assert(!JSON.stringify(res.body).includes(registration.tel));
  assert.equal(calls[0].options.headers.Authorization,undefined);
  assert.equal(JSON.parse(calls[0].options.body).p_key,createHmac('sha256',env.RATE_LIMIT_SECRET).update('203.0.113.1').digest('hex'));
 });
 for(const [name,options,status] of [
  ['method',{req:{method:'GET'}},405],
  ['wrong origin',{headers:{origin:'https://attacker.test'}},403],
  ['missing origin',{headers:{origin:undefined}},403],
  ['content type',{headers:{'content-type':'text/plain'}},415],
  ['oversized body',{req:{body:{...registration,khas:'x'.repeat(9000)}}},413],
  ['malformed JSON',{req:{body:'{'}},400],
  ['missing token',{req:{body:{...registration,turnstileToken:''}}},400],
  ['invalid data',{req:{body:{...registration,tetamu:11}}},400],
  ['missing secrets',{env:{TURNSTILE_SECRET_KEY:''}},503],
  ['unsafe deployment origin',{headers:{origin:'http://example.test'},env:{REGISTRATION_ORIGINS:'http://example.test'}},503],
  ['missing trusted IP',{headers:{'x-forwarded-for':undefined}},503],
  ['spoofed IP chain',{headers:{'x-forwarded-for':'1.2.3.4, 5.6.7.8'}},503]
 ])await test('reject '+name,async()=>{const r=await invoke(options);assert.equal(r.res.code,status);assert.equal(r.calls.length,0);});
 await test('rate blocks before verification',async()=>{const r=await invoke({rate:false});assert.equal(r.res.code,429);assert.equal(r.res.headers['Retry-After'],'600');assert.equal(r.calls.length,1);});
 await test('rate backend fails closed',async()=>{const r=await invoke({rateFailure:true});assert.equal(r.res.code,503);assert.equal(r.calls.length,1);});
 for(const [name,v] of [
  ['invalid or reused token',{...verdict(),success:false}],
  ['hostname',{...verdict(),hostname:'attacker.test'}],
  ['action',{...verdict(),action:'other'}],
  ['expired token',{...verdict(),challenge_ts:new Date(Date.now()-301000).toISOString()}],
  ['future token',{...verdict(),challenge_ts:new Date(Date.now()+60000).toISOString()}],
  ['missing timestamp',{...verdict(),challenge_ts:undefined}]
 ])await test('reject '+name,async()=>{const r=await invoke({verdict:v});assert.equal(r.res.code,400);assert.equal(r.calls.length,2);});
 await test('Cloudflare outage fails closed',async()=>{const r=await invoke({verifyFailure:true});assert.equal(r.res.code,503);assert.equal(r.calls.length,2);});
 await test('transport failure fails closed',async()=>{const r=await invoke({throwFetch:true});assert.equal(r.res.code,503);});
 await test('duplicates have identical generic response',async()=>{const a=await invoke(),b=await invoke({saved:false});assert.equal(b.res.code,202);assert.deepEqual(a.res.body,b.res.body);});
 await test('database errors are sanitized',async()=>{const r=await invoke({saveFailure:true});assert.equal(r.res.code,503);assert.deepEqual(Object.keys(r.res.body),['message']);});
 await test('local mode ignores forwarded IP',async()=>{
  const r=await invoke({env:{VERCEL:''},headers:{'x-forwarded-for':'203.0.113.9'}});
  assert.equal(JSON.parse(r.calls[0].options.body).p_key,createHmac('sha256',env.RATE_LIMIT_SECRET).update('127.0.0.1').digest('hex'));
 });
 console.log(passed+' server tests passed (mock Cloudflare/Supabase).');
})().catch(e=>{console.error(e);process.exitCode=1;});
