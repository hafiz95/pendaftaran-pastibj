const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const root = path.join(__dirname, '..');
// Minimal Supabase Auth contract for local PostgreSQL tests, NOT a migration.
const bootstrap = `
create role anon nologin nobypassrls;
create role authenticated nologin nobypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;
async function run(migration, sql) {
 const db = new PGlite();
 const notices = [];
 try {
  await db.exec(bootstrap);
  await db.exec(migration); // Entire, unmodified migration, including BEGIN/COMMIT.
  await db.exec(sql, { onNotice: n => notices.push(n.message) });
  // ROLLBACK in the suite must remove every generated fixture.
  const result = await db.query('select (select count(*) from auth.users) as users, (select count(*) from public.registrations) as registrations, (select count(*) from public.admin_users) as admins');
  assert.deepEqual(result.rows[0], {users:0,registrations:0,admins:0});
  return notices.filter(n => n.startsWith('PASS:'));
 } finally { await db.close(); }
}
(async () => {
 const migration = fs.readFileSync(path.join(root,'supabase/migrations/001_registrations.sql'),'utf8');
 const sql = fs.readFileSync(path.join(root,'supabase/tests/rls.sql'),'utf8');
 assert.equal((migration.match(/^commit;/gmi)||[]).length,1,'Exactly one COMMIT');
 assert.match(migration,/commit;\s*$/i,'No code after COMMIT');
 const notices = await run(migration,sql);
 notices.forEach(n=>console.log(n));
 assert(notices.length >= 30, 'RLS assertions actually executed');
 console.log('PASS: fixtures rolled back');
 // Prove that the suite detects broken security and constraints.
 await assert.rejects(run(migration.replace(
  'using ((select public.is_admin()));',
  'using (true);'),sql), /ordinary user sees zero rows/);
 console.log('PASS: mutation test detects exposed SELECT policy');
 await assert.rejects(run(migration.replace(
  "check (tel ~ '^[0-9+[:space:]-]{9,15}$')",
  'check (true)'),sql), /anon invalid telephone rejected/);
 console.log('PASS: mutation test detects missing phone constraint');
 console.log(notices.length+' SQL assertions passed, rollback verified, 2 mutation checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

