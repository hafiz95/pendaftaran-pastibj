const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const root=path.join(__dirname,'..');
const bootstrap=[
"create role anon nologin nobypassrls;",
"create role authenticated nologin nobypassrls;",
"create role service_role nologin bypassrls;",
"create schema auth; create table auth.users(id uuid primary key);",
"create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$;",
"grant usage on schema public,auth to anon,authenticated,service_role;",
"grant execute on function auth.uid() to anon,authenticated,service_role;"
].join("\n");
const base=fs.readFileSync(path.join(root,'supabase/migrations/001_registrations.sql'),'utf8');
const secure=fs.readFileSync(path.join(root,'supabase/migrations/002_secure_registration.sql'),'utf8');
const suite=fs.readFileSync(path.join(root,'supabase/tests/rls.sql'),'utf8');
const audit=fs.readFileSync(path.join(root,'supabase/audit.sql'),'utf8');
async function run(first=base,second=secure){
 const db=new PGlite(),notices=[];
 try{
  await db.exec(bootstrap);await db.exec(first);await db.exec(fs.readFileSync(path.join(root,'supabase/preflight.sql'),'utf8'));await db.exec(second);await db.exec(audit);
  await db.exec(suite,{onNotice:n=>notices.push(n.message)});
  const result=await db.query('select (select count(*) from auth.users) as users,(select count(*) from public.registrations) as registrations,(select count(*) from public.admin_users) as admins,(select count(*) from pasti_private.registration_limits) as limits');
  assert.deepEqual(result.rows[0],{users:0,registrations:0,admins:0,limits:0});
  return notices.filter(n=>n.startsWith('PASS:'));
 }finally{await db.close();}
}
(async()=>{
 for(const migration of [base,secure]){assert.equal((migration.match(/^commit;/gmi)||[]).length,1);assert.match(migration,/commit;\s*$/i);}
 const historical=new PGlite();
 try {
  await historical.exec(bootstrap);await historical.exec(base);
  await historical.exec("insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu) select 'UJIAN','BJ','Hadir sahaja','UJIAN','0000000000',2 from generate_series(1,2)");
  await assert.rejects(historical.exec(secure),e=>e.code==='23505');
  await historical.exec('rollback;');
  assert.equal((await historical.query('select count(*)::int as n from public.registrations')).rows[0].n,2);
  assert.equal((await historical.query("select count(*)::int as n from pg_policies where policyname='public_registration'")).rows[0].n,1);
  console.log('PASS: historical duplicate blocks migration with no data deletion or partial cutover');
 } finally {await historical.close();}
 const notices=await run();notices.forEach(n=>console.log(n));assert(notices.length>=45);
 console.log('PASS: metadata audit and all fixtures rolled back');
 await assert.rejects(run(base.replace('using ((select public.is_admin()));',()=> 'using (true);')),/Unexpected registration policy|ordinary user sees zero rows/);
 console.log('PASS: mutation detects exposed SELECT policy');
 await assert.rejects(run(base.replace("check (tel ~ '^[0-9+[:space:]-]{9,15}$')",()=> 'check (true)')),/invalid telephone rejected/);
 console.log('PASS: mutation detects missing telephone constraint');
 await assert.rejects(run(base,secure.replace('revoke all on function public.submit_registration(jsonb) from public, anon, authenticated;',()=> 'grant execute on function public.submit_registration(jsonb) to anon;')),/Privileged RPC exposed/);
 console.log('PASS: mutation detects exposed submit RPC');
 console.log(notices.length+' SQL assertions passed, metadata audit passed, rollback verified, 3 mutation checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
