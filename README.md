# Pendaftaran Majlis Anugerah Pelajar PASTI

Borang asal, tema hijau/emas, mod gelap dan CSS telefon dikekalkan. Satu-satunya penambahan visual ialah widget Turnstile bersaiz compact. Dashboard Supabase Auth mengekalkan senarai, statistik, carian, kemas kini dan eksport CSV.

## Laluan pendaftaran
Pelayar menghantar borang dan token Turnstile ke endpoint Vercel `POST /api/register`. Tiada lagi INSERT Supabase terus daripada borang. Endpoint:
- Mengehadkan origin tepat, saiz JSON 8 KiB dan medan borang.
- Menggunakan IP daripada X-Forwarded-For yang ditulis semula oleh Vercel; dalam mod tempatan, menggunakan socket.remoteAddress dan mengabaikan header klien. Jangan letak reverse proxy luar di hadapan Vercel tanpa menyemak semula model IP.
- Memanggil RPC had kadar secara berasingan sebelum Siteverify: 10 cubaan/IP/tetingkap tetap 10 minit dan 300 cubaan global/minit. Semua cubaan borang sah, termasuk token gagal, dikira. Tetingkap tetap membenarkan burst merentas sempadan tetingkap; pengguna berkongsi IP berkongsi kuota.
- Mengesahkan token sekali melalui Cloudflare, termasuk success, hostname yang sepadan dengan origin, action pasti_registration dan umur maksimum 300 saat. Kegagalan provider/database menutup pendaftaran dengan respons umum.
- Menyimpan melalui RPC service_role sahaja. SQL UNIQUE index menolak pendua secara atomik. Respons 202 untuk rekod baharu dan pendua adalah sama dan tidak mengandungi data keluarga atau ID.

Pendua ditakrifkan sebagai gabungan nama pelajar + cawangan (huruf kecil, ruang dinormalkan) + telefon (digit sahaja). Penukaran telefon menghasilkan identiti pendua berbeza; ini bukan pengesahan identiti. Endpoint tidak memadam atau menimpa rekod lama. Kemaskini admin yang menghasilkan pendua juga ditolak oleh database.

Had kadar disimpan dalam schema pasti_private, bukan memori fungsi. IP dipseudonimkan menggunakan HMAC-SHA256; alamat IP asal tidak disimpan. Bucket lebih sejam dibersihkan apabila endpoint dipanggil. HMAC masih data pseudonim; hadkan akses pemilik projek. Tiada payload, token, kata laluan atau error database dilog oleh kod aplikasi. Jangan aktifkan log badan permintaan pada platform.

## Migration dan RLS
001 ialah migration asal untuk pemasangan baharu. Projek yang sudah menjalankannya hanya memerlukan 002_secure_registration.sql pada masa cutover yang dirancang. Jangan jalankan semula 001.
002 menarik balik grant INSERT per jadual DAN per kolum daripada PUBLIC/anon/authenticated, membuang polisi INSERT/ALL, menambah unique index, bucket kadar dan dua RPC yang hanya service_role boleh execute. Polisi SELECT/UPDATE admin dikekalkan; tiada perubahan admin_users oleh frontend.

Jika pendua sejarah wujud, unique index membatalkan keseluruhan migration; tiada data dipadam automatik. supabase/preflight.sql mengira kumpulan pendua tanpa memaparkan nama/telefon. supabase/audit.sql membaca metadata RLS/grant/polisi/RPC/index sahaja dan mengandungi assertion; ia juga menyenaraikan view/security-definer untuk semakan manual. Ia bukan pengganti suite behavioral supabase/tests/rls.sql atau ujian JWT sebenar.

Jangan jalankan 002 pada Production sekarang. Ia akan memutuskan borang lama yang masih membuat INSERT terus. Cutover memerlukan endpoint/widget yang dikonfigurasi dan tersedia dalam Preview serta penjadualan perubahan DB/versi frontend; gunakan projek staging dahulu. Tiada migration jauh dijalankan oleh PR ini.

## Konfigurasi rujukan (nilai sebenar tidak disertakan)
Frontend config.js mengekalkan URL dan publishable key sedia ada dan menambah turnstileSiteKey kosong. Site key Turnstile adalah awam. Nilai kosong membuat borang gagal secara selamat sehingga dikonfigurasi.

| Pembolehubah pelayan | Kegunaan |
| --- | --- |
| SUPABASE_URL | URL projek yang sama dengan frontend |
| SUPABASE_SERVER_KEY | Supabase secret key sb_secret_ atau legacy service_role JWT; server sahaja |
| TURNSTILE_SECRET_KEY | Secret key Cloudflare; server sahaja |
| RATE_LIMIT_SECRET | Rahsia rawak sekurang-kurangnya 32 aksara untuk HMAC IP; server sahaja |
| REGISTRATION_ORIGINS | Origin tepat dipisahkan koma, tiada wildcard; origin Preview yang dibenarkan |

Simpan pembolehubah hanya dalam persekitaran Vercel Preview atau .env tempatan yang diabaikan Git. Jangan isi config.js dengan mana-mana rahsia pelayan. .env.example mempunyai nama sahaja. Turnstile hostname allowlist dan origin perlu sepadan dengan domain Preview sebenar. Jangan gunakan test key Cloudflare untuk Production.

## Panduan konfigurasi semasa: satu langkah sahaja
Langkah pertama ialah menjalankan supabase/preflight.sql sebagai postgres di SQL Editor projek staging sedia ada. Laporkan hanya dua boolean kewujudan jadual dan bilangan kumpulan pendua; jangan hantar rekod murid/ibu bapa. Selepas keputusan itu, konfigurasi Cloudflare, environment Preview dan cutover akan dipandu satu langkah pada satu masa. Jangan jalankan 002 atau deploy Production dahulu.

## Ujian dan pembangunan
Gunakan Node.js 22.x. npm ci kemudian npm test menjalankan ujian aplikasi, endpoint (Cloudflare/Supabase disimulasi) dan PostgreSQL PGlite dengan migration 001+002, audit metadata, RLS behavioral, had kadar dan pendua. Fixture semuanya di-ROLLBACK. PGlite ialah devDependency sahaja. Tiada servis luar dipanggil oleh npm test.

Vercel Git Preview kekal enabled; ujian tidak lagi memerlukan deploymentEnabled=false. Push ke branch PR boleh mencetuskan Preview automatik; itu bukan merge atau arahan deploy Production. Endpoint akan memberi 503/borang tidak boleh dihantar sehingga konfigurasi rahsia dan sitekey disediakan. Production tidak dilancarkan oleh tugas ini.

Untuk ujian penuh tempatan selepas konfigurasi, gunakan npx vercel dev; pelayan statik biasa tidak menjalankan /api/register. npm run dev menggunakan Vercel CLI, bukan arahan deploy. Root / kekal memaparkan fail HTML asal. admin.html terus menggunakan Supabase REST dengan JWT; token hanya dalam memori dan reload memerlukan login semula.

## Belum disahkan pada servis sebenar
Belum disahkan: migration 002 dan audit pada Supabase sebenar; login/JWT bukan admin sebenar; Cloudflare widget/Siteverify termasuk replay token; origin dan IP pada Vercel Preview; had kadar, request serentak dan pendua pada Supabase sebenar; keseluruhan aliran pelayar dan kemaskini admin apabila unique constraint aktif. Ujian mock/PGlite tidak membuktikan konfigurasi servis sebenar.

Had kadar ini mengurangkan spam pendaftaran, bukan perlindungan DDoS volumetrik. Serangan permintaan tidak sah masih boleh menggunakan sumber platform; semak WAF/quotas di Vercel sebelum pelancaran. Semak juga public signup Supabase dimatikan, polisi kata laluan dan rate limit Auth. MFA belum diwajibkan oleh frontend/RLS. Data lama Claude tidak dimigrasikan automatik.

Rujukan:
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://vercel.com/docs/headers/request-headers
- https://supabase.com/docs/guides/database/postgres/row-level-security
