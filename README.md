# Pendaftaran Majlis Anugerah Pelajar PASTI

Aplikasi statik tanpa dependency runtime atau build step. PGlite hanya dependency pembangunan untuk ujian PostgreSQL. Laluan / memaparkan borang asal; /admin.html untuk admin.

## Analisis asal
HTML satu fail menggunakan CSS hijau/emas, font Bricolage Grotesque dan Source Sans 3, mod gelap automatik, lebar 560px, safe-area telefon dan sasaran sentuhan 44px. Semua CSS borang dikekalkan. Kod asal memerlukan identiti Claude dan menyimpan anak dalam dokumen pengguna; admin bergantung kepada canEdit dan CSV kepada downloads. Semua panggilan tersebut diganti dengan Supabase REST/Auth dan Blob pelayar. Data lama tidak dipindahkan secara automatik.

## Persediaan Supabase langkah demi langkah
1. Checkout branch `codex/supabase-registration-admin` (PR #1). Gunakan projek Supabase staging baharu terlebih dahulu; belum perlu deploy Vercel.
2. Di Supabase Dashboard, cipta projek dan tunggu database sedia. Buka SQL Editor sebagai peranan postgres.
3. Jika pernah mencuba migration rosak, jalankan `rollback;` dalam sesi berkenaan. Semak keadaan:
   ```sql
   select to_regclass('public.registrations'), to_regclass('public.admin_users');
   ```
   Kedua-duanya mestilah NULL untuk migration awal ini. Jika objek sudah wujud (contohnya sebahagian SQL pernah dijalankan), jangan DROP atau jalankan semula secara membuta tuli; guna projek staging baharu atau semak schema/data dahulu.
4. Buka `supabase/migrations/001_registrations.sql` dari branch PR. Salin SELURUH fail ke SQL Editor dan Run sekali. Fail bermula BEGIN dan berakhir dengan satu COMMIT; jangan jalankan cebisan SQL. Migration ini untuk schema baharu, bukan skrip idempotent.
5. Dalam SQL Editor, jalankan SELURUH `supabase/tests/rls.sql` sebagai postgres. Ia mencipta fixture rawak, bertukar kepada role anon/authenticated, mengesahkan akses dan berakhir ROLLBACK. Kejayaan: tiada ralat assertion, dan NOTICE PASS jika dipaparkan oleh klien. Jika gagal, jalankan ROLLBACK sebelum mencuba lagi. Ujian tidak menyimpan pengguna atau pendaftaran contoh.
6. Di Authentication, matikan pendaftaran akaun baharu/public signup. Kekalkan kaedah email/password. Di Users, tambah pengguna admin secara manual, tandakan e-mel disahkan dan tetapkan kata laluan kuat. Salin UUID pengguna. Jangan guna akaun fixture ujian.
7. Dalam SQL Editor sebagai postgres, beri akses:
   ```sql
   insert into public.admin_users(user_id)
   values ('GANTIKAN-DENGAN-UUID-ADMIN'::uuid);
   ```
   Keahlian mesti ditambah oleh pemilik projek, bukan melalui frontend. Untuk menarik balik akses:
   ```sql
   delete from public.admin_users
   where user_id = 'GANTIKAN-DENGAN-UUID-ADMIN'::uuid;
   ```
8. Salin Project URL dan publishable key daripada tetapan projek/API Keys. Isi `config.js`:
   ```js
   window.PASTI_CONFIG = {
     url: "https://PROJECT-REF.supabase.co",
     key: "sb_publishable_GANTIKAN"
   };
   ```
   Legacy anon key juga disokong. Jangan guna service_role, sb_secret, kata laluan database atau connection string dalam frontend.
9. Hidangkan fail secara HTTP melalui pelayan statik tempatan (contohnya `npx --yes serve .` dari akar repository), buka `/pendaftaran-anugerah-pasti.html`, hantar data contoh tanpa login. Buka `/admin.html`, login dengan admin dan semak senarai, jumlah pelajar/tetamu, carian, edit dan CSV. Akaun biasa tidak mendapat akses admin. Reload halaman atau token tamat memerlukan login semula kerana token hanya disimpan dalam memori.
10. Selepas semua ujian staging lulus, konfigurasi projek sebenar dengan langkah yang sama. Kekalkan `git.deploymentEnabled=false`; jangan deploy sehingga dibenarkan.


Anon boleh INSERT medan borang sahaja; tiada SELECT/UPDATE/DELETE. Akaun authenticated biasa juga tidak boleh membaca atau mengemas kini. Admin membership tersimpan dalam jadual RLS tanpa grant kepada pengguna. is_admin ialah fungsi security definer dengan search_path kosong dan akses authenticated sahaja. ID dan timestamp dijana database. Kemaskini menggunakan updated_at untuk mengesan perubahan serentak. Semua paparan data menggunakan textContent. CSV neutralize formula spreadsheet dan eksport hasil carian.

## Jalankan dan uji
Node.js 22+:
```sh
npm ci
npm test
```
`npm run test:app`: 15 ujian JavaScript dengan mock API/DOM.
`npm run test:db`: jalankan keseluruhan migration dalam PostgreSQL terbenam PGlite, kemudian 33 assertion SQL RLS, pengesahan rollback fixture dan 2 mutation check. Mutation check sengaja membuka polisi SELECT atau membuang constraint telefon dan memastikan suite gagal.

Bootstrap tests/database.cjs menyediakan kontrak minimum Supabase Auth (auth.users, auth.uid, role anon/authenticated) dalam database sementara. Ia tidak menggantikan ujian Supabase sebenar: Auth service, PostgREST dan konfigurasi projek sebenar masih perlu diuji mengikut langkah setup. `supabase/tests/rls.sql` boleh dijalankan terus dalam Supabase SQL Editor; tiada PGlite atau pgTAP diperlukan di Supabase.

## Vercel (jangan deploy lagi)
Import repository hanya selepas semakan diluluskan. Framework preset Other, tiada build command, output directory akar. config.js mesti diisi dengan konfigurasi awam sebelum release. vercel.json mematikan auto deployment Git dengan git.deploymentEnabled=false; kekalkan sehingga dibenarkan deploy dan ubah kepada true dalam perubahan berasingan. Tiada deployment dibuat oleh perubahan ini.

## Had operasi
Satu rekod = satu pelajar; tetamu tidak termasuk pelajar. Statistik seluruh senarai, CSV mengikut carian. Pendaftaran kedua ialah rekod baharu, bukan overwrite nama sama. Tiada CAPTCHA/rate limiter untuk endpoint insert awam; sebelum membuka kepada umum, tentukan perlindungan spam di gateway/Edge Function (RLS sahaja tidak menghadkan kadar). Senarai dipaginasi ketika dimuat turun, kemudian carian berlaku dalam pelayar. Untuk jumlah data besar, gunakan pagination/carían server. Data lama Claude memerlukan eksport/import yang diluluskan. Tiada projek Supabase atau kelayakan staging diberikan, jadi ujian pangkalan data sebenar perlu dijalankan selepas konfigurasi.

Rujukan: https://supabase.com/docs/guides/database/postgres/row-level-security dan https://supabase.com/docs/guides/getting-started/api-keys serta https://vercel.com/docs/project-configuration/git-configuration.
