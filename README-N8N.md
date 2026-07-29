# SUMA-AI Copilot — n8n + Google Sheets + Groq

> Untuk pendaftaran akun serta penyimpanan sesi chat per pengguna, baca `README-FIREBASE.md`.
>
> Untuk workflow Gemini terbaru yang mendukung PDF, DOCX, XLSX, CSV, teks, JSON, dan gambar, baca `README-FILE-ANALYSIS.md`.

Alur aplikasi:

`Frontend SUMA-AI → Webhook n8n → Google Sheets → Groq → respons chat`

Workflow membaca baris perusahaan berdasarkan `company_id`, menyusun konteks terkontrol, lalu meminta Groq mengembalikan JSON `{ inScope, answer }`.

## Keamanan terlebih dahulu

API key yang pernah ditempel ke chat atau tempat publik harus dianggap bocor. Lakukan ini sebelum menjalankan workflow:

1. Buka Groq Console → **API Keys**.
2. Hapus/revoke key yang sudah terekspos.
3. Buat API key baru.
4. Simpan key baru hanya di **Credentials n8n**.

API key tidak ada di workflow, ZIP, frontend, atau variabel `VITE_*`.

## Berkas utama

- `n8n/SUM-AI-Google-Sheets-Groq.workflow.json` — workflow yang diimpor ke n8n.
- `n8n/Google-Sheets-Data_Perusahaan-template.csv` — contoh header dan data Google Sheets.
- `n8n/sample-request.json` — payload pengujian webhook.
- `src/lib/n8n-ai.ts` — klien frontend untuk memanggil webhook.
- `.env.example` — URL webhook produksi dan ID perusahaan.

## 1. Siapkan Google Sheets

Workflow sudah diarahkan ke:

- Spreadsheet ID: `1Mxw6r8-F5Ac24gtXihwfL9pzdyrmfSnu7E1cE2plTi0`
- Sheet/tab ID: `1829379905`

Pastikan tab tersebut memiliki header `company_id`. Nilai yang dipakai paket ini adalah `COMPANY-001`. Kolom lain bebas dan akan menjadi konteks AI. Kolom opsional `active` dapat berisi `TRUE` atau `FALSE`; baris `FALSE` tidak dikirim ke AI.

## 2. Impor dan hubungkan Google Sheets

1. Di n8n pilih **Import from File**.
2. Pilih `n8n/SUM-AI-Google-Sheets-Groq.workflow.json`.
3. Buka node **Get Company Rows**.
4. Pilih atau buat credential Google Sheets OAuth2.
5. Jalankan **Test step** pada node tersebut.
6. Pastikan baris dengan `company_id = COMPANY-001` terbaca.

Credential sengaja tidak disertakan dalam JSON agar workflow aman dan dapat dipindahkan antar-instance n8n.

## 3. Hubungkan Groq

1. Buka node **Groq Chat**.
2. Pilih **Authentication → Generic Credential Type**.
3. Pilih **Generic Auth Type → Bearer Auth**.
4. Klik **Create New Credential**.
5. Isi **Bearer Token** dengan API key Groq yang baru. Tempel key saja; jangan menambahkan key ke JSON Body.
6. Simpan credential dan pilih credential tersebut pada node.

Konfigurasi bawaan:

```text
URL: https://api.groq.com/openai/v1/chat/completions
Model: openai/gpt-oss-20b
Temperature: 0.2
Maximum completion: 1200 token
Structured output: JSON Schema strict
```

## 4. Simpan dan publikasikan workflow

1. Pastikan tidak ada node merah.
2. Klik **Save**.
3. Klik **Publish** atau aktifkan workflow.
4. Buka node **SUMA-AI Webhook** dan salin **Production URL**.

Jangan memakai URL editor seperti
`https://automation.geloraaksarapratama.co.id/workflow/<workflow-id>`.
Frontend harus menggunakan URL produksi node Webhook yang berawalan
`https://automation.geloraaksarapratama.co.id/webhook/`.

Path webhook sengaja dipertahankan agar cocok dengan frontend Firebase yang sudah dibuat:

```text
sum-ai-copilot-google-sheets-ollama-v1
```

Walaupun path lama masih mengandung kata `ollama`, pemrosesan AI di workflow ini sudah sepenuhnya menggunakan Groq. Mempertahankan path mencegah frontend produksi putus dan menghindari deploy ulang yang tidak perlu.

## 5. Uji webhook

Untuk Test URL, klik **Listen for test event** terlebih dahulu. URL `/webhook-test/` hanya aktif saat mode test menunggu request.

Contoh PowerShell:

```powershell
$body = Get-Content .\n8n\sample-request.json -Raw

Invoke-RestMethod `
  -Method Post `
  -Uri "https://automation.geloraaksarapratama.co.id/webhook-test/sum-ai-copilot-google-sheets-ollama-v1" `
  -ContentType "text/plain;charset=UTF-8" `
  -Body $body
```

Setelah workflow dipublikasikan, gunakan Production URL `/webhook/`:

```text
https://automation.geloraaksarapratama.co.id/webhook/sum-ai-copilot-google-sheets-ollama-v1
```

Respons sukses:

```json
{
  "answer": "Jawaban berdasarkan data perusahaan...",
  "inScope": true,
  "requestId": "uji-sumai-001",
  "companyId": "COMPANY-001",
  "dataRows": 5,
  "model": "openai/gpt-oss-20b"
}
```

## 6. Jalankan dan deploy frontend

Buat `.env.local`:

```env
VITE_N8N_WEBHOOK_URL=https://automation.geloraaksarapratama.co.id/webhook/sum-ai-copilot-google-sheets-ollama-v1
VITE_SUMAI_COMPANY_ID=COMPANY-001
```

Kemudian:

```powershell
npm install
npm run check
npm run dev
```

Deploy ulang ke Firebase hanya jika kode atau nilai `.env.local` berubah:

```powershell
npm run build
npx.cmd firebase-tools@latest deploy --only hosting --project sumai-bb116
```

## CORS

Webhook mengizinkan origin berikut:

```text
http://localhost:3000
http://127.0.0.1:3000
https://sumai-bb116.web.app
https://sumai-bb116.firebaseapp.com
```

Jika memakai domain atau port lain, tambahkan origin lengkap pada **SUMA-AI Webhook → Allowed Origins (CORS)**, lalu publish ulang workflow.

## Troubleshooting

- **Webhook is not registered**: workflow belum dipublikasikan atau URL/path salah.
- **401 dari Groq**: key tidak valid, sudah dicabut, atau credential belum dipilih.
- **429 dari Groq**: rate limit; tunggu lalu coba kembali.
- **Google Sheets tidak ditemukan**: pilih credential yang memiliki akses ke spreadsheet.
- **Data perusahaan tidak ditemukan**: pastikan header `company_id` dan nilai `COMPANY-001` tersedia pada sheet ID `1829379905`.
- **Browser gagal tetapi PowerShell berhasil**: origin frontend belum masuk daftar CORS.

## Batas dan keamanan produksi

- Pesan maksimal 4.000 karakter.
- Riwayat maksimal 10 pesan terakhir dan sekitar 8.000 karakter.
- Konteks Sheet maksimal 200 baris dan sekitar 20.000 karakter.
- Isi sel diperlakukan sebagai data tidak tepercaya, bukan instruksi sistem.
- Workflow tidak menulis hasil AI kembali ke Google Sheets.
- Untuk data sensitif, tempatkan gateway autentikasi dan rate-limit di depan webhook. CORS bukan autentikasi.
