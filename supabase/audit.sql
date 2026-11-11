-- Metadata only: no student/guardian/phone/IP hash values.
-- Run as postgres in SQL Editor AFTER migrations 001 and 002.
begin read only;
select n.nspname as schema,c.relname as object,c.relrowsecurity as rls_enabled
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='public' and c.relname in ('registrations','admin_users'))
 or (n.nspname='pasti_private' and c.relname='registration_limits');
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
 where (schemaname='public' and tablename in ('registrations','admin_users'))
 or schemaname='pasti_private';
select grantee,table_name,privilege_type from information_schema.table_privileges
 where table_schema='public' and table_name in ('registrations','admin_users');
select grantee,table_name,column_name,privilege_type from information_schema.column_privileges
 where table_schema='public' and table_name in ('registrations','admin_users');
select n.nspname,p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as user_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','pasti_private') and p.prosecdef;
-- Any unexpected public view/function needs manual review for RLS bypass.
select schemaname,viewname from pg_views where schemaname='public';
-- Counts only; never print the duplicate keys.
select count(*) as historical_duplicate_groups from (
 select 1 from public.registrations
 group by lower(regexp_replace(btrim(nama),'[[:space:]]+',' ','g')),
 lower(regexp_replace(btrim(cawangan),'[[:space:]]+',' ','g')),
 regexp_replace(tel,'[^0-9]','','g') having count(*)>1
) d;
do $$
declare r text;
begin
 if exists(select 1 from pg_class where oid in ('public.registrations'::regclass,'public.admin_users'::regclass,'pasti_private.registration_limits'::regclass) and not relrowsecurity)
 then raise exception 'RLS disabled';end if;
 if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
 then raise exception 'Public/user role bypasses RLS';end if;
 foreach r in array array['anon','authenticated'] loop
  if pg_has_role(r,'service_role','USAGE') then raise exception 'Public/user inherits server role';end if;
  if has_table_privilege(r,'public.registrations','INSERT') or has_any_column_privilege(r,'public.registrations','INSERT')
   then raise exception 'Direct INSERT still granted to %',r;end if;
  if has_table_privilege(r,'public.registrations','DELETE') then raise exception 'DELETE still granted';end if;
  if (has_any_column_privilege(r,'public.admin_users','SELECT,INSERT,UPDATE') or has_table_privilege(r,'public.admin_users','DELETE')) then raise exception 'Membership access granted';end if;
  if has_function_privilege(r,'public.submit_registration(jsonb)','EXECUTE') or has_function_privilege(r,'public.consume_registration_rate(text)','EXECUTE')
   then raise exception 'Privileged RPC exposed to %',r;end if;
 end loop;
 if has_any_column_privilege('anon','public.registrations','SELECT,UPDATE') then raise exception 'Anon read/update grant';end if;
 if (select count(*) from pg_policies where schemaname='public' and tablename='registrations')<>2
  or exists(select 1 from pg_policies where schemaname='public' and tablename='registrations' and
   (policyname not in ('admin_read','admin_update') or cmd not in ('SELECT','UPDATE') or roles<>array['authenticated']::name[]
    or regexp_replace(replace(qual,'public.',''),'[[:space:]]','','g') <> '(SELECTis_admin()ASis_admin)'
    or (cmd='UPDATE' and regexp_replace(replace(with_check,'public.',''),'[[:space:]]','','g') <> '(SELECTis_admin()ASis_admin)')))
 then raise exception 'Unexpected registration policy; inspect policy definitions';end if;
 if not has_function_privilege('service_role','public.submit_registration(jsonb)','EXECUTE')
  or not has_function_privilege('service_role','public.consume_registration_rate(text)','EXECUTE')
 then raise exception 'Server role RPC grant missing';end if;
 if not exists(select 1 from pg_index where indexrelid='public.registrations_duplicate_guard'::regclass and indisunique and indisvalid)
 then raise exception 'Duplicate guard missing';end if;
 if has_function_privilege('anon','public.is_admin()','EXECUTE') or not has_function_privilege('authenticated','public.is_admin()','EXECUTE')
 then raise exception 'Admin helper grant mismatch';end if;
 if has_column_privilege('authenticated','public.registrations','id','UPDATE')
 or has_column_privilege('authenticated','public.registrations','masa','UPDATE')
 or has_column_privilege('authenticated','public.registrations','updated_at','UPDATE')
 then raise exception 'Generated field UPDATE grant';end if;
 if exists(select 1 from pg_proc where oid in ('public.is_admin()'::regprocedure,
 'public.submit_registration(jsonb)'::regprocedure,'public.consume_registration_rate(text)'::regprocedure)
 and (not prosecdef or not coalesce(proconfig @> array['search_path=""'],false)))
 then raise exception 'Privileged RPC security/search_path mismatch';end if;
 if has_schema_privilege('anon','pasti_private','USAGE') or has_schema_privilege('authenticated','pasti_private','USAGE')
 then raise exception 'Private rate schema exposed';end if;
 raise notice 'PASS: metadata audit gates';
end $$;
commit;
