-- FIRST setup step. Read-only and contains no student/guardian values.
-- Run on the existing staging project as postgres BEFORE considering migration 002.
begin read only;
select to_regclass('public.registrations') is not null as registration_table_exists,
 to_regclass('public.admin_users') is not null as admin_table_exists;
select count(*) as historical_duplicate_groups from (
 select 1 from public.registrations
 group by lower(regexp_replace(btrim(nama),'[[:space:]]+',' ','g')),
 lower(regexp_replace(btrim(cawangan),'[[:space:]]+',' ','g')),
 regexp_replace(tel,'[^0-9]','','g')
 having count(*)>1
) d;
commit;
