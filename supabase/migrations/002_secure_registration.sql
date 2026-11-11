begin;
-- Existing installations: apply AFTER 001. Never remove family records automatically.
-- If existing normalized duplicates exist, this index aborts the transaction for manual review.
create unique index registrations_duplicate_guard on public.registrations (
 lower(regexp_replace(btrim(nama), '[[:space:]]+', ' ', 'g')),
 lower(regexp_replace(btrim(cawangan), '[[:space:]]+', ' ', 'g')),
 regexp_replace(tel, '[^0-9]', '', 'g')
);
revoke insert on public.registrations from public, anon, authenticated;
revoke insert (id,nama,cawangan,kategori,penjaga,tel,tetamu,khas,masa,updated_at)
 on public.registrations from public, anon, authenticated;
do $$ declare p record;
begin
 for p in select policyname from pg_policies
  where schemaname='public' and tablename='registrations' and cmd in ('INSERT','ALL')
 loop execute format('drop policy %I on public.registrations',p.policyname); end loop;
end $$;

create schema if not exists pasti_private;
revoke all on schema pasti_private from public, anon, authenticated;
create table pasti_private.registration_limits (
 scope text not null,
 bucket timestamptz not null,
 key_hash text not null,
 hits integer not null,
 primary key (scope,bucket,key_hash)
);
alter table pasti_private.registration_limits enable row level security;
revoke all on pasti_private.registration_limits from public, anon, authenticated;
create index registration_limits_expiry on pasti_private.registration_limits(bucket);

-- Separate committed RPC call BEFORE CAPTCHA verification: failed attempts also count.
create function public.consume_registration_rate(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare t timestamptz := clock_timestamp(); n integer;
begin
 if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'Invalid rate key'; end if;
 delete from pasti_private.registration_limits where bucket < t - interval '1 hour';
 insert into pasti_private.registration_limits(scope,bucket,key_hash,hits)
 values ('global',date_trunc('minute',t),'global',1)
 on conflict (scope,bucket,key_hash) do update
 set hits=least(pasti_private.registration_limits.hits+1,301)
 returning hits into n;
 if n > 300 then return false; end if;
 insert into pasti_private.registration_limits(scope,bucket,key_hash,hits)
 values ('ip',date_trunc('hour',t)+floor(extract(minute from t)/10)*interval '10 minutes',p_key,1)
 on conflict (scope,bucket,key_hash) do update
 set hits=least(pasti_private.registration_limits.hits+1,11)
 returning hits into n;
 return n <= 10;
end $$;
revoke all on function public.consume_registration_rate(text) from public, anon, authenticated;
grant execute on function public.consume_registration_rate(text) to service_role;

create function public.submit_registration(p_data jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
 insert into public.registrations(nama,cawangan,kategori,penjaga,tel,tetamu,khas)
 values (p_data->>'nama',p_data->>'cawangan',p_data->>'kategori',
 p_data->>'penjaga',p_data->>'tel',(p_data->>'tetamu')::integer,coalesce(p_data->>'khas',''))
 on conflict do nothing returning id into saved;
 return saved is not null;
end $$;
revoke all on function public.submit_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_registration(jsonb) to service_role;
commit;
