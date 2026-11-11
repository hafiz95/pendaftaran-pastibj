-- Run as postgres in SQL Editor AFTER migrations 001 and 002. All fixtures roll back.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.expect_error(statement text, expected_state text, label text) returns void language plpgsql as $$
declare actual text;
begin begin execute statement; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 perform pg_temp.assert_true(actual=expected_state,label||' (SQLSTATE '||coalesce(actual,'no error')||')'); end $$;
select set_config('test.admin_id',gen_random_uuid()::text,true);
select set_config('test.user_id',gen_random_uuid()::text,true);
select set_config('test.marker','rls-'||gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.admin_id')::uuid),(current_setting('test.user_id')::uuid);
insert into public.admin_users values(current_setting('test.admin_id')::uuid);
select set_config('test.payload',json_build_object('nama',current_setting('test.marker'),'cawangan','BJ','kategori','Hadir sahaja','penjaga','UJIAN','tel','0123456789','tetamu',2,'khas','')::text,true);

set local role service_role;
select pg_temp.assert_true(public.submit_registration(current_setting('test.payload')::jsonb),'service submits registration');
select pg_temp.assert_true(not public.submit_registration(current_setting('test.payload')::jsonb),'duplicate returns false');
select pg_temp.assert_true(not public.submit_registration(
 current_setting('test.payload')::jsonb||jsonb_build_object('nama','  '||upper(current_setting('test.marker'))||'  ','cawangan',' bj ','tel','012-3456789')),
 'normalized duplicate returns false');
select pg_temp.assert_true(public.submit_registration(current_setting('test.payload')::jsonb||
 jsonb_build_object('nama',current_setting('test.marker')||'-second')),'second distinct registration accepted');
do $$ declare i integer;
begin
 for i in 1..10 loop perform pg_temp.assert_true(public.consume_registration_rate(repeat('a',64)),'rate allows attempt '||i); end loop;
 perform pg_temp.assert_true(not public.consume_registration_rate(repeat('a',64)),'rate blocks attempt 11');
 perform pg_temp.assert_true(public.consume_registration_rate(repeat('b',64)),'separate IP bucket allowed');
end $$;
reset role;
-- Test the global cap without sending hundreds of requests.
insert into pasti_private.registration_limits(scope,bucket,key_hash,hits)
 values('global',date_trunc('minute',clock_timestamp()),'global',300)
 on conflict(scope,bucket,key_hash) do update set hits=300;
set local role service_role;
select pg_temp.assert_true(not public.consume_registration_rate(repeat('c',64)),'global cap blocks additional attempt');
reset role;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.assert_true(current_user='anon' and auth.uid() is null,'anon identity');
select pg_temp.expect_error('select * from public.registrations','42501','anon cannot read');
select pg_temp.expect_error('update public.registrations set nama=''BAD''','42501','anon cannot update');
select pg_temp.expect_error('delete from public.registrations','42501','anon cannot delete');
select pg_temp.expect_error(
 'insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu) values (''A'',''BJ'',''Hadir sahaja'',''P'',''0123456789'',2)',
 '42501','anon cannot bypass endpoint with direct INSERT');
select pg_temp.expect_error('select public.submit_registration(current_setting(''test.payload'')::jsonb)','42501','anon cannot call submit RPC');
select pg_temp.expect_error('select public.consume_registration_rate(repeat(''a'',64))','42501','anon cannot call rate RPC');
select pg_temp.expect_error('select public.is_admin()','42501','anon cannot call admin helper');
select pg_temp.expect_error('select * from public.admin_users','42501','anon cannot list admins');
select pg_temp.expect_error('select * from pasti_private.registration_limits','42501','anon cannot read rate hashes');
select pg_temp.expect_error(
 'insert into public.admin_users values(current_setting(''test.user_id'')::uuid)','42501','anon cannot self-promote');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user_id'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.user_id'),'role','authenticated')::text,true);
select pg_temp.assert_true(auth.uid()=current_setting('test.user_id')::uuid and not public.is_admin(),'ordinary user identity');
select pg_temp.assert_true((select count(*)=0 from public.registrations),'ordinary user sees zero rows');
do $$ declare n integer;
begin update public.registrations set nama='BAD';get diagnostics n=row_count;perform pg_temp.assert_true(n=0,'ordinary user updates zero rows');end $$;
select pg_temp.expect_error(
 'insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu) values (''A'',''BJ'',''Hadir sahaja'',''P'',''0123456789'',2)',
 '42501','ordinary user cannot bypass endpoint with INSERT');
select pg_temp.expect_error('select public.submit_registration(current_setting(''test.payload'')::jsonb)','42501','ordinary user cannot call submit RPC');
select pg_temp.expect_error('select public.consume_registration_rate(repeat(''a'',64))','42501','ordinary user cannot call rate RPC');
select pg_temp.expect_error('delete from public.registrations','42501','ordinary user cannot delete');
select pg_temp.expect_error('select * from public.admin_users','42501','ordinary user cannot list admins');
select pg_temp.expect_error(
 'insert into public.admin_users values(current_setting(''test.user_id'')::uuid)','42501','ordinary user cannot self-promote');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.admin_id'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.admin_id'),'role','authenticated')::text,true);
select pg_temp.assert_true(public.is_admin(),'admin authorized');
select pg_temp.assert_true((select count(*)=2 from public.registrations where nama like current_setting('test.marker')||'%'),'admin reads both fixtures');
do $$ declare b public.registrations%rowtype;a public.registrations%rowtype;n integer;
begin select * into strict b from public.registrations where nama=current_setting('test.marker');
 update public.registrations set tetamu=3,khas='UJIAN' where id=b.id;get diagnostics n=row_count;
 select * into strict a from public.registrations where id=b.id;
 perform pg_temp.assert_true(n=1 and a.tetamu=3,'admin updates exactly one row');
 perform pg_temp.assert_true(a.updated_at>b.updated_at and a.masa=b.masa,'timestamp trigger works');
end $$;
select pg_temp.expect_error(
 'update public.registrations set nama=current_setting(''test.marker'') where nama=current_setting(''test.marker'')||''-second''',
 '23505','admin cannot create duplicate via edit');
select pg_temp.expect_error(
 'update public.registrations set tel=''0123A56789'' where nama=current_setting(''test.marker'')','23514','invalid telephone rejected');
select pg_temp.expect_error(
 'update public.registrations set tetamu=11 where nama=current_setting(''test.marker'')','23514','invalid guest count rejected');
select pg_temp.expect_error('update public.registrations set updated_at=now()','42501','admin cannot forge timestamp');
select pg_temp.expect_error('delete from public.registrations','42501','admin cannot delete');
select pg_temp.expect_error(
 'insert into public.admin_users values(current_setting(''test.user_id'')::uuid)','42501','admin cannot grant membership');
select pg_temp.expect_error(
 'delete from public.admin_users where user_id=current_setting(''test.admin_id'')::uuid','42501','admin cannot modify membership');
reset role;
delete from public.admin_users where user_id=current_setting('test.admin_id')::uuid;
set local role authenticated;
select pg_temp.assert_true(not public.is_admin(),'revoked membership with unchanged JWT');
select pg_temp.assert_true((select count(*)=0 from public.registrations),'revoked admin cannot read');
do $$ declare n integer;
begin update public.registrations set tetamu=1;get diagnostics n=row_count;perform pg_temp.assert_true(n=0,'revoked admin cannot update');end $$;
reset role;
rollback;
