# Menjalankan SUMA-AI dengan Docker

Stack ini menjalankan:

- frontend Vue pada Nginx;
- n8n `2.31.7`;
- external task runner n8n dengan versi yang sama;
- PostgreSQL 16;
- proxy webhook satu-origin pada Nginx.

Firebase Authentication dan Firestore tetap memakai proyek Firebase yang sudah
ada. API Analytics serta Google Gemini juga tetap diakses melalui internet.

## Persyaratan

- Docker Engine 28+ atau Docker Desktop yang setara;
- Docker Compose 2.33.1+ (`docker compose version`);
- koneksi keluar HTTPS dari host ke Firebase, API Analytics, dan Google Gemini.

## 1. Buat konfigurasi `.env`

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-docker.ps1
```

Linux atau macOS:

```bash
sh scripts/setup-docker.sh
```

Script membuat password PostgreSQL, encryption key n8n, dan token task runner
secara acak. Jika `.env.local` tersedia, konfigurasi Firebase otomatis disalin
ke `.env`. Script tidak akan menimpa `.env` yang sudah ada, tetapi akan berhenti
dengan error jika tiga secret wajib duplikat, kurang dari 32 karakter, kosong,
atau masih berupa placeholder.

Periksa `.env`, terutama:

```env
VITE_N8N_WEBHOOK_URL=http://localhost:8080/webhook/sum-ai-copilot-google-sheets-ollama-v1
VITE_SUMAI_COMPANY_ID=COMPANY-001
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Jangan mengunggah `.env` ke Git atau membagikannya. `N8N_ENCRYPTION_KEY` harus
tetap sama selama instance dipakai; perubahan kunci membuat credential yang
tersimpan tidak dapat dibaca.

## 2. Bangun dan jalankan stack

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Perintah pertama memeriksa semua variabel wajib sebelum image dibangun. Tunggu
sampai `postgres`, `n8n`, `n8n-runner`, dan `frontend` berstatus healthy.

- Aplikasi: <http://localhost:8080>
- Editor n8n: <http://localhost:5678>

Port editor n8n hanya di-bind ke `127.0.0.1` secara default. PostgreSQL tidak
dipublikasikan ke host.

## 3. Buat akun owner n8n

Buka <http://localhost:5678> dan selesaikan pembuatan akun owner pada penggunaan
pertama. Langkah ini wajib dilakukan sebelum menjalankan import CLI karena n8n
perlu menempatkan workflow pada project milik owner.

## 4. Impor workflow

Jalankan sekali setelah n8n healthy dan akun owner sudah dibuat:

```bash
docker compose --profile tools run --rm n8n-import
```

Impor CLI membuat workflow dalam keadaan nonaktif. File yang diimpor sudah
dibersihkan dari pin data, metadata instance lama, dan referensi ID credential
lama.

Jika sebelumnya workflow sudah diimpor, jangan menjalankan perintah ini lagi
tanpa memeriksa workflow di editor karena dapat membuat salinan baru.
Nonaktifkan workflow lama yang memakai method dan path webhook POST yang sama
sebelum mengaktifkan hasil impor.

## 5. Pasang credential Gemini

1. Buka **Credentials** dan buat **Google Gemini(PaLM) API**.
2. Isi API key Gemini.
3. Buka workflow **SUM-AI | Analytics API + File Analysis → Gemini Fallback → Webhook**.
4. Buka node **Workflow Configuration**. Pastikan `companyId` sama dengan
   `VITE_SUMAI_COMPANY_ID` pada `.env`, lalu periksa `analyticsUrl`,
   `analyticsCompanyId`, `analyticsSystemName`, dan `analyticsCustomerName`.
   Nilai bawaan mengarah ke `COMPANY-001` dan konfigurasi Toko Singgalang.
5. Pilih credential yang sama pada keenam node `Gemini 1`, `Gemini 3`,
   `Gemini 5`, `Gemini 6`, `Gemini 7`, dan `Gemini 8`.
6. Simpan, uji workflow, lalu aktifkan/publish.

Workflow memakai path produksi:

```text
/webhook/sum-ai-copilot-google-sheets-ollama-v1
```

Nama path lama dipertahankan agar frontend tetap kompatibel. Workflow aktual
memakai Analytics API dan Gemini, bukan Ollama.

## 6. Uji

Health check:

```bash
curl http://localhost:8080/healthz
curl http://localhost:5678/healthz/readiness
```

Lihat log:

```bash
docker compose logs -f frontend n8n n8n-runner postgres
```

Setelah workflow aktif, login ke aplikasi dan kirim pertanyaan sederhana.

## Akses dari perangkat lain di LAN

Konfigurasi bawaan hanya membuka aplikasi dan editor pada `127.0.0.1`, sehingga
aman untuk penggunaan lokal di host Docker. Untuk akses dari perangkat lain di
LAN, ubah dengan sengaja:

```env
APP_BIND_ADDRESS=0.0.0.0
N8N_BIND_ADDRESS=0.0.0.0
N8N_HOST=192.0.2.10
N8N_EDITOR_BASE_URL=http://192.0.2.10:5678/
N8N_WEBHOOK_URL=http://192.0.2.10:8080/
VITE_N8N_WEBHOOK_URL=http://192.0.2.10:8080/webhook/sum-ai-copilot-google-sheets-ollama-v1
```

Ganti `192.0.2.10` dengan alamat host Docker, batasi akses dengan firewall, lalu
jalankan `docker compose up -d --build`. Tambahkan hostname/IP ke Firebase
Authorized Domains dan, jika API key memakai pembatasan HTTP referrer, ke daftar
referrer yang diizinkan.

Login Firebase pada UI tidak melindungi URL webhook n8n. Siapa pun yang dapat
mencapai port aplikasi dapat memanggil webhook, jadi gunakan LAN tepercaya dan
firewall. Membuka editor n8n ke seluruh LAN juga memperbesar permukaan serangan.

## Konfigurasi produksi

Topologi yang disarankan memakai reverse proxy TLS sebagai satu-satunya jalur
publik:

- `app.example.com/webhook/` diteruskan langsung ke `127.0.0.1:5678`;
- `app.example.com/webhook-test/` diteruskan ke target yang sama hanya saat
  pengujian dan wajib diberi kontrol akses ketat;
- semua path lain pada `app.example.com` diteruskan ke `127.0.0.1:8080`;
- `n8n.example.com` diteruskan ke `127.0.0.1:5678` dengan autentikasi tambahan
  atau allowlist IP.

Gunakan konfigurasi:

```env
APP_BIND_ADDRESS=127.0.0.1
N8N_BIND_ADDRESS=127.0.0.1
N8N_HOST=n8n.example.com
N8N_PROTOCOL=https
N8N_EDITOR_BASE_URL=https://n8n.example.com/
N8N_WEBHOOK_URL=https://app.example.com/
N8N_PROXY_HOPS=1
N8N_SECURE_COOKIE=true
VITE_N8N_WEBHOOK_URL=https://app.example.com/webhook/sum-ai-copilot-google-sheets-ollama-v1
```

`N8N_PROXY_HOPS=1` sesuai karena reverse proxy publik meneruskan webhook
langsung ke n8n. Jika topologi diubah, nilainya harus sama dengan jumlah proxy
tepercaya yang benar-benar dilewati.

Karena nilai `VITE_*` dimasukkan saat build, perubahan domain atau konfigurasi
Firebase membutuhkan build ulang:

```bash
docker compose up -d --build frontend
```

Tambahkan domain aplikasi ke **Firebase Authentication → Authorized domains**.
Reverse proxy publik wajib menerapkan TLS, batas body 20 MiB, timeout sedikitnya
610 detik, rate limit, dan autentikasi server-side. Jangan membuka PostgreSQL ke
internet.

Proxy Nginx bawaan membatasi body menjadi 20 MiB, memberi timeout 610 detik, dan
membatasi webhook per IP untuk pemakaian lokal. Rate limiting dan CORS bukan
autentikasi. Sebelum membuka webhook ke internet publik, pasang gateway yang
memverifikasi Firebase ID token pada server atau kontrol autentikasi server-side
lain. Stack ini belum menyertakan gateway tersebut dan frontend saat ini belum
mengirim Firebase ID token pada request webhook. Jadi deployment publik belum
aman hanya dengan mengubah `.env`: implementasikan header token + verifikasi
server, atau lindungi seluruh aplikasi dan webhook dengan access proxy/session
auth. Token statis di bundle frontend bukan solusi karena dapat dibaca browser.

Jaga kesesuaian konfigurasi berikut:

- jika domain atau `APP_PORT` berubah, perbarui `N8N_WEBHOOK_URL` dan
  `VITE_N8N_WEBHOOK_URL`, lalu build ulang frontend;
- jika `N8N_PORT` berubah, perbarui URL editor dan target reverse proxy;
- jika batas upload diubah, samakan `N8N_PAYLOAD_SIZE_MAX` pada `compose.yaml`,
  `client_max_body_size` pada `docker/nginx.conf`, dan konfigurasi proxy publik.

## Data, backup, dan update

Data persisten berada pada dua named volume:

- `postgres_data`: database workflow, user, dan execution;
- `n8n_data`: konfigurasi instance, encryption metadata, dan data n8n.

Pertahankan `COMPOSE_PROJECT_NAME`; perubahan nama membuat Compose memakai named
volume lain sehingga data lama tampak hilang. Nilai user/database/password
PostgreSQL juga tidak menginisialisasi ulang volume yang sudah ada ketika hanya
diubah di `.env`.

Buat backup logis database tanpa redirection host sehingga aman dipakai dari
Bash maupun Windows PowerShell. Perintah berikut memakai nilai bawaan
`POSTGRES_USER=n8n` dan `POSTGRES_DB=n8n`; sesuaikan jika Anda mengubahnya:

```text
docker compose exec -T postgres pg_dump -U n8n -d n8n -f /tmp/n8n-backup.sql
docker compose cp postgres:/tmp/n8n-backup.sql ./n8n-backup.sql
docker compose exec -T postgres rm -f /tmp/n8n-backup.sql
```

Mode binary n8n memakai filesystem, jadi backup SQL saja belum lengkap. Hentikan
n8n dan runner, lalu arsipkan volume `n8n_data`:

```text
docker compose stop n8n n8n-runner
docker volume inspect suma-ai_n8n_data
docker run --rm --mount source=suma-ai_n8n_data,target=/source,readonly --mount "type=bind,source=${PWD},target=/backup" alpine:3.22 tar -czf /backup/n8n-data-backup.tar.gz -C /source .
docker compose start n8n n8n-runner
```

Satu set backup lengkap terdiri dari `n8n-backup.sql`,
`n8n-data-backup.tar.gz`, dan salinan `.env` yang disimpan secara aman. Uji
restore pada stack kosong/non-produksi: pulihkan arsip ke volume
`suma-ai_n8n_data`, jalankan PostgreSQL, salin SQL ke container dengan
`docker compose cp`, lalu impor memakai `psql -U n8n -d n8n -f <path-container>`.
Jangan impor SQL ke database aktif yang sudah berisi data.

Untuk update image, ubah `N8N_VERSION` ke versi stabil yang sudah ditinjau, lalu
buat backup lengkap baru, kemudian jalankan:

```bash
docker compose pull postgres n8n n8n-runner
docker compose up -d
docker compose ps
```

Versi `n8n` dan `n8n-runner` harus selalu sama. Setelah kode frontend berubah,
gunakan `docker compose up -d --build frontend`. Jangan downgrade n8n pada
database yang sudah dimigrasikan kecuali prosedur rilis n8n menyatakannya aman.

## Perintah operasional

```bash
# Hentikan tanpa menghapus data
docker compose stop

# Jalankan kembali
docker compose start

# Hapus container dan network, tetapi pertahankan named volume
docker compose down

# PERINGATAN: opsi -v menghapus database dan seluruh data n8n
docker compose down -v
```

## Troubleshooting

- **Compose meminta variabel**: jalankan script setup atau lengkapi `.env`.
- **Frontend gagal dibangun**: periksa seluruh Firebase `VITE_*` wajib.
- **Webhook 404**: workflow belum diimpor atau belum aktif.
- **Gemini credential merah**: buat credential baru dan pilih ulang pada enam
  node Gemini.
- **Login Firebase menolak domain**: tambahkan hostname ke Authorized domains.
- **502/504 dari frontend**: periksa health dan log `n8n`; fallback penuh dapat
  memakan waktu beberapa menit.
- **429 dari Nginx**: batas request per IP tercapai; tunggu sebelum mencoba lagi.

## Referensi resmi

- [Install n8n with Docker](https://docs.n8n.io/deploy/host-n8n/install-options/install-with-docker/)
- [Official n8n + PostgreSQL Compose example](https://github.com/n8n-io/n8n-hosting/tree/main/docker-compose/withPostgres)
- [External task runners](https://docs.n8n.io/deploy/host-n8n/configure-n8n/set-up-task-runners/)
- [Reverse proxy and webhook URL](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/configuration-examples/configure-webhook-urls-with-reverse-proxy/)
- [n8n CLI import](https://docs.n8n.io/deploy/host-n8n/configure-n8n/use-the-command-line/)
- [Docker Compose gateway priority](https://docs.docker.com/reference/compose-file/services/#gw_priority)
