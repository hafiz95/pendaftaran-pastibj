# Pendaftaran Majlis Anugerah Pelajar PASTI

Aplikasi statik tanpa dependency atau build step. Laluan / memaparkan borang asal; /admin.html untuk admin.

## Analisis asal
HTML satu fail menggunakan CSS hijau/emas, font Bricolage Grotesque dan Source Sans 3, mod gelap automatik, lebar 560px, safe-area telefon dan sasaran sentuhan 44px. Semua CSS borang dikekalkan. Kod asal memerlukan identiti Claude dan menyimpan anak dalam dokumen pengguna; admin bergantung kepada canEdit dan CSV kepada downloads. Semua panggilan tersebut diganti dengan Supabase REST/Auth dan Blob pelayar. Data lama tidak dipindahkan secara automatik.

## Persediaan Supabase (belum dijalankan)
1. Cipta projek Supabase. Jalankan supabase/migrations/001_registrations.sql sekali di SQL Editor.
2. Matikan public sign-up di Authentication. Cipta pengguna admin secara manual dengan e-mel disahkan dan kata laluan kuat. Konfigurasikan polisi kata laluan dan rate limit Auth.
3. Tambah UUID pengguna melalui SQL Editor sahaja:
   `insert into public.admin_users(user_id) values ('UUID-DARI-AUTH-USERS');`
   Tarik balik akses: `delete from public.admin_users where user_id = 'UUID';`
4. Isi config.js dengan URL projek https://PROJECT.supabase.co dan publishable key (sb_publishable_...) atau legacy anon key. Ini konfigurasi awam; jangan masukkan service_role, sb_secret, kata laluan atau database connection string.
5. Admin menggunakan e-mel/kata laluan. Access token hanya di memori, tiada localStorage/cookie; reload atau tamat token memerlukan login semula. Tiada signup atau fungsi pemberian akses admin dari frontend.
6. Jalankan SQL keselamatan dalam supabase/tests/rls.sql di projek ujian selepas migration.

Anon boleh INSERT medan borang sahaja; tiada SELECT/UPDATE/DELETE. Akaun authenticated biasa juga tidak boleh membaca atau mengemas kini. Admin membership tersimpan dalam jadual RLS tanpa grant kepada pengguna. is_admin ialah fungsi security definer dengan search_path kosong dan akses authenticated sahaja. ID dan timestamp dijana database. Kemaskini menggunakan updated_at untuk mengesan perubahan serentak. Semua paparan data menggunakan textContent. CSV neutralize formula spreadsheet dan eksport hasil carian.

## Jalankan dan uji
Gunakan Node.js 22+: `npm test` atau `node tests/run.cjs`. Hidangkan fail statik melalui HTTP; buka /pendaftaran-anugerah-pasti.html dan /admin.html. Root rewrite hanya melalui Vercel.
Uji di Supabase staging: pendaftaran tanpa login, kegagalan sambungan, admin sah/tidak sah, carian, edit serentak, eksport dan tamat sesi. Jangan gunakan data keluarga sebenar untuk ujian.

## Vercel (jangan deploy lagi)
Import repository hanya selepas semakan diluluskan. Framework preset Other, tiada build command, output directory akar. config.js mesti diisi dengan konfigurasi awam sebelum release. vercel.json mematikan auto deployment Git dengan git.deploymentEnabled=false; kekalkan sehingga dibenarkan deploy dan ubah kepada true dalam perubahan berasingan. Tiada deployment dibuat oleh perubahan ini.

## Had operasi
Satu rekod = satu pelajar; tetamu tidak termasuk pelajar. Statistik seluruh senarai, CSV mengikut carian. Pendaftaran kedua ialah rekod baharu, bukan overwrite nama sama. Tiada CAPTCHA/rate limiter untuk endpoint insert awam; sebelum membuka kepada umum, tentukan perlindungan spam di gateway/Edge Function (RLS sahaja tidak menghadkan kadar). Senarai dipaginasi ketika dimuat turun, kemudian carian berlaku dalam pelayar. Untuk jumlah data besar, gunakan pagination/carían server. Data lama Claude memerlukan eksport/import yang diluluskan. Tiada projek Supabase atau kelayakan staging diberikan, jadi ujian pangkalan data sebenar perlu dijalankan selepas konfigurasi.

Rujukan: https://supabase.com/docs/guides/database/postgres/row-level-security dan https://supabase.com/docs/guides/getting-started/api-keys serta https://vercel.com/docs/project-configuration/git-configuration.
