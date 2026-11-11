-- Run as postgres in Supabase SQL Editor on a staging project after migration.
-- Assertions execute as the selected role, NOT as a security-definer owner.
-- Failure aborts the transaction. Issue ROLLBACK before retrying after an error.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %', label; end if;
 raise notice 'PASS: %', label;
end $$;
create function pg_temp.expect_error(statement text, expected_state text, label text) returns void
language plpgsql as $$
declare actual_state text;
begin
 begin
  execute statement;
 exception when others then
  get stacked diagnostics actual_state = returned_sqlstate;
 end;
 perform pg_temp.assert_true(actual_state = expected_state, label || ' (SQLSTATE ' || coalesce(actual_state, 'no error') || ')');
end $$;

-- Random fixtures avoid collisions and all changes roll back.
select set_config('test.admin_id', gen_random_uuid()::text, true);
select set_config('test.user_id', gen_random_uuid()::text, true);
select set_config('test.marker', 'rls-' || gen_random_uuid()::text, true);
insert into auth.users(id) values
 (current_setting('test.admin_id')::uuid),
 (current_setting('test.user_id')::uuid);
insert into public.admin_users(user_id) values (current_setting('test.admin_id')::uuid);

-- ANON: insert succeeds without SELECT/RETURNING, all other access denied.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.assert_true(current_user = 'anon' and auth.uid() is null, 'anon identity');
insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu)
values (current_setting('test.marker'),'BJ','Hadir sahaja','Penjaga','012-3456789',2);
select pg_temp.expect_error('select * from public.registrations', '42501', 'anon cannot read');
select pg_temp.expect_error('update public.registrations set nama = ''BAD''', '42501', 'anon cannot update');
select pg_temp.expect_error('delete from public.registrations', '42501', 'anon cannot delete');
select pg_temp.expect_error('select public.is_admin()', '42501', 'anon cannot call admin helper');
select pg_temp.expect_error('select * from public.admin_users', '42501', 'anon cannot list admins');
select pg_temp.expect_error(
 'insert into public.admin_users values (current_setting(''test.user_id'')::uuid)', '42501', 'anon cannot self-promote');
select pg_temp.expect_error(
 'insert into public.registrations(id,nama,cawangan,kategori,penjaga,tel,tetamu) values (gen_random_uuid(),''A'',''BJ'',''Hadir sahaja'',''P'',''0123456789'',2)',
 '42501', 'anon cannot supply generated ID');
select pg_temp.expect_error(
 'insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu) values (''A'',''BJ'',''Hadir sahaja'',''P'',''abc123456'',2)',
 '23514', 'anon invalid telephone rejected');
select pg_temp.expect_error(
 'insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu) values (''A'',''BJ'',''Hadir sahaja'',''P'',''0123456789'',11)',
 '23514', 'anon invalid guest count rejected');
reset role;

-- AUTHENTICATED NON-ADMIN: can register, sees zero rows and cannot update.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_id'), true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('test.user_id'),'role','authenticated')::text, true);
select pg_temp.assert_true(current_user = 'authenticated' and auth.uid() = current_setting('test.user_id')::uuid, 'ordinary user identity');
select pg_temp.assert_true(not public.is_admin(), 'ordinary user is not admin');
insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu)
values (current_setting('test.marker') || '-user','BJ','Hadir sahaja','Penjaga','0123456789',0);
select pg_temp.assert_true((select count(*) = 0 from public.registrations), 'ordinary user sees zero rows');
do $$ declare changed integer;
begin
 update public.registrations set nama='BAD' where nama=current_setting('test.marker');
 get diagnostics changed = row_count;
 perform pg_temp.assert_true(changed = 0, 'ordinary user updates zero rows');
end $$;
select pg_temp.expect_error('delete from public.registrations', '42501', 'ordinary user cannot delete');
select pg_temp.expect_error('select * from public.admin_users', '42501', 'ordinary user cannot list admins');
select pg_temp.expect_error(
 'insert into public.admin_users values (current_setting(''test.user_id'')::uuid)', '42501', 'ordinary user cannot self-promote');
reset role;

-- ADMIN: sees both fixtures, updates one, constraints/column grants still apply.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.admin_id'), true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('test.admin_id'),'role','authenticated')::text, true);
select pg_temp.assert_true(current_user = 'authenticated' and auth.uid() = current_setting('test.admin_id')::uuid, 'admin identity');
select pg_temp.assert_true(public.is_admin(), 'admin authorized');
select pg_temp.assert_true(
 (select count(*) = 2 from public.registrations where nama in (current_setting('test.marker'),current_setting('test.marker') || '-user')),
 'admin sees anon and ordinary user registrations');
do $$ declare before_row public.registrations%rowtype; after_row public.registrations%rowtype; changed integer;
begin
 select * into strict before_row from public.registrations where nama=current_setting('test.marker');
 update public.registrations set tetamu=3,khas='Dikemas kini' where id=before_row.id;
 get diagnostics changed = row_count;
 select * into strict after_row from public.registrations where id=before_row.id;
 perform pg_temp.assert_true(changed=1 and after_row.tetamu=3 and after_row.khas='Dikemas kini', 'admin updates exactly one row');
 perform pg_temp.assert_true(after_row.updated_at > before_row.updated_at and after_row.masa=before_row.masa, 'timestamp trigger preserves creation time');
end $$;
select pg_temp.expect_error(
 'update public.registrations set tel=''01234567'' where nama=current_setting(''test.marker'')', '23514', 'short telephone rejected');
select pg_temp.expect_error(
 'update public.registrations set tel=''0123456789012345'' where nama=current_setting(''test.marker'')', '23514', 'long telephone rejected');
select pg_temp.expect_error(
 'update public.registrations set tel=''0123A56789'' where nama=current_setting(''test.marker'')', '23514', 'telephone letters rejected');
select pg_temp.expect_error(
 'update public.registrations set tetamu=-1 where nama=current_setting(''test.marker'')', '23514', 'negative guests rejected');
select pg_temp.expect_error(
 'update public.registrations set updated_at=now()', '42501', 'admin cannot forge timestamp');
select pg_temp.expect_error('delete from public.registrations', '42501', 'admin cannot delete registrations');
select pg_temp.expect_error(
 'insert into public.admin_users values (current_setting(''test.user_id'')::uuid)', '42501', 'admin cannot grant membership');
select pg_temp.expect_error(
 'delete from public.admin_users where user_id=current_setting(''test.admin_id'')::uuid', '42501', 'admin cannot modify membership');
-- Test valid phone boundaries as well, not just rejection.
update public.registrations set tel='012345678' where nama=current_setting('test.marker');
update public.registrations set tel='+60 12-34567890' where nama=current_setting('test.marker');
reset role;

-- Revoke admin via trusted owner; same JWT must immediately lose access.
delete from public.admin_users where user_id=current_setting('test.admin_id')::uuid;
set local role authenticated;
select pg_temp.assert_true(not public.is_admin(), 'revoked membership with unchanged JWT');
select pg_temp.assert_true((select count(*)=0 from public.registrations), 'revoked admin cannot read');
do $$ declare changed integer;
begin
 update public.registrations set tetamu=1 where nama=current_setting('test.marker');
 get diagnostics changed = row_count;
 perform pg_temp.assert_true(changed=0, 'revoked admin cannot update');
end $$;
reset role;
rollback;

