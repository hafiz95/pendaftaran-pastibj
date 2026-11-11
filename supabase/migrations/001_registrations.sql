begin;
create table public.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admin_users where user_id = (select auth.uid())); $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table public.registrations (
 id uuid primary key default gen_random_uuid(),
 nama text not null check (length(trim(nama)) between 1 and 150),
 cawangan text not null check (length(trim(cawangan)) between 1 and 150),
 kategori text not null check (kategori in ('Pelajar cemerlang','Hafazan terbaik','Sahsiah terpuji','Hadir sahaja')),
 penjaga text not null check (length(trim(penjaga)) between 1 and 150),
 tel text not null check (tel ~ '^[0-9+[:space:]-]{9,15}$'),
 tetamu integer not null check (tetamu between 0 and 10),
 khas text not null default '' check (length(khas) <= 500),
 masa timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.registrations enable row level security;
revoke all on public.registrations from public, anon, authenticated;
grant insert (nama,cawangan,kategori,penjaga,tel,tetamu,khas) on public.registrations to anon, authenticated;
grant select on public.registrations to authenticated;
grant update (nama,cawangan,kategori,penjaga,tel,tetamu,khas) on public.registrations to authenticated;
create policy public_registration on public.registrations for insert to anon, authenticated with check (true);
create policy admin_read on public.registrations for select to authenticated using ((select public.is_admin()));
create policy admin_update on public.registrations for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create function public.registration_timestamp() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end; $$;
revoke all on function public.registration_timestamp() from public, anon, authenticated;
create trigger registration_timestamp before update on public.registrations for each row execute function public.registration_timestamp();
create index registrations_masa_id on public.registrations (masa desc, id);
commit;
