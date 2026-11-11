-- Run after migration in a disposable Supabase project. Always rolled back.
begin;
insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002');
insert into public.admin_users values ('10000000-0000-0000-0000-000000000001');
set local role anon;
insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu)
values ('Ujian','BJ','Hadir sahaja','Penjaga','0123456789',2);
do $$ begin
 begin perform * from public.registrations; raise exception 'Anon read unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin update public.registrations set nama='BAD'; raise exception 'Anon update unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.admin_users values ('10000000-0000-0000-0000-000000000002'); raise exception 'Self promotion allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$ begin
 if public.is_admin() then raise exception 'Non-admin authorized'; end if;
 if exists(select 1 from public.registrations) then raise exception 'Non-admin read allowed'; end if;
 update public.registrations set nama='BAD';
 if found then raise exception 'Non-admin update allowed'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$ begin
 if not public.is_admin() then raise exception 'Admin denied'; end if;
 if not exists(select 1 from public.registrations where nama='Ujian') then raise exception 'Admin cannot read'; end if;
 update public.registrations set nama='Dikemas kini' where nama='Ujian';
 if not found then raise exception 'Admin cannot update'; end if;
 begin update public.registrations set tetamu=11; raise exception 'Invalid guests accepted'; exception when check_violation then null; end;
 begin delete from public.registrations; raise exception 'Delete allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
