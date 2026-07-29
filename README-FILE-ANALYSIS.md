# Upload dan Analisis File

Fitur ini membaca file yang dipilih pengguna, memvalidasi format serta ukuran, lalu mengirim konten yang relevan ke workflow n8n dan Gemini. Isi file tidak disimpan ke Firestore. Riwayat chat hanya menyimpan pertanyaan, nama file, dan ukurannya.

## Format yang didukung

| Format | Cara diproses | Batas |
| --- | --- | ---: |
| PDF | Dikirim sebagai input multimodal agar teks, tabel, gambar, diagram, dan hasil scan dapat dianalisis | 7 MB |
| PNG, JPG, JPEG, WEBP | Dikirim sebagai input multimodal | 7 MB |
| DOCX | Teks paragraf diekstrak di browser dengan Mammoth | 10 MB |
| XLSX | Sel dari seluruh sheet diekstrak di browser dengan `read-excel-file` | 10 MB |
| CSV, TSV, TXT, MD, JSON, HTML, XML | Dibaca sebagai teks | 10 MB |

Ekstraksi teks dibatasi sampai 120.000 karakter. XLSX dibatasi sampai 12 sheet, 500 baris per sheet, dan 50 kolom per baris. Aplikasi memberi label `dipotong` jika hanya sebagian konten yang dikirim.

Format lama `.doc` dan `.xls` tidak diproses. Simpan ulang sebagai `.docx`, `.xlsx`, atau `.csv`. Untuk DOCX yang berisi grafik, gambar, atau tata letak penting, ekspor ke PDF agar Gemini dapat membaca aspek visualnya.

## Memasang workflow Gemini

1. Buka n8n dan pilih **Import from File**.
2. Pilih `n8n/SUM-AI-Analytics-Gemini-Files.workflow.json`.
3. Nonaktifkan workflow lama yang memakai path `sum-ai-copilot-google-sheets-ollama-v1`. Dua workflow aktif tidak boleh memakai path webhook yang sama.
4. Buka setiap node bernama `Gemini ...`.
5. Pilih credential Google Gemini yang aktif.
6. Periksa konfigurasi sumber data pada node **Workflow Configuration**.
7. Simpan dan publikasikan workflow baru.
8. Salin Production URL dari node **SUMA-AI Webhook** ke `.env.local`.

Contoh:

```env
VITE_N8N_WEBHOOK_URL=https://automation.geloraaksarapratama.co.id/webhook/sum-ai-copilot-google-sheets-ollama-v1
VITE_SUMAI_COMPANY_ID=COMPANY-001
```

Path webhook lama tetap dipakai agar frontend yang sudah terpasang tetap kompatibel.

Payload teks contoh tersedia pada `n8n/sample-file-request.json`. Gunakan file ini untuk menguji Test URL atau Production URL sebelum frontend dideploy.

## Menjalankan aplikasi

```bash
npm install
npm run check
npm run dev
```

Origin lokal `http://localhost:5173`, `http://127.0.0.1:5173`, dan origin produksi Firebase sudah tersedia di workflow. Tambahkan domain lain pada **SUMA-AI Webhook > Allowed Origins (CORS)** bila diperlukan.

## Alur data

1. Browser memeriksa ekstensi, ukuran, dan signature PDF atau gambar.
2. DOCX dan XLSX diekstrak di perangkat pengguna. Nilai numerik XLSX dipertahankan sebagai teks agar digit penting tidak berubah akibat pembulatan JavaScript.
3. Frontend mengirim pertanyaan dan satu lampiran ke n8n.
4. n8n memvalidasi ulang metadata, ukuran, MIME type, base64, dan panjang teks.
5. Workflow memisahkan data Analytics API dari data file agar angka kedua sumber tidak tercampur tanpa permintaan pengguna.
6. Gemini menghasilkan respons JSON `{ inScope, answer }`.

## Keamanan produksi

- Batas PDF dan gambar ditetapkan 7 MB karena base64 menambah ukuran sekitar sepertiga, sedangkan webhook n8n memiliki batas bawaan 16 MB.
- Isi file diperlakukan sebagai data tidak tepercaya. Workflow melarang instruksi di dalam file mengganti aturan sistem.
- CORS bukan autentikasi. Lindungi webhook publik dengan Header Auth, JWT, API gateway, rate limit, atau kontrol akses lain.
- n8n dapat menyimpan data eksekusi, termasuk payload file, sesuai pengaturan instance. Atur retensi eksekusi dan penyimpanan data sukses sesuai kebijakan privasi organisasi.
- Jangan unggah password, token, API key, NIK, nomor rekening, data kartu, atau dokumen yang tidak boleh dikirim ke penyedia AI.

## Pemeriksaan cepat

1. Unggah PDF teks dan minta ringkasan.
2. Unggah PDF hasil scan dan pastikan isi visual terbaca.
3. Unggah DOCX lalu tanyakan bagian tertentu.
4. Unggah XLSX dengan beberapa sheet lalu minta tren dan anomali.
5. Coba file lebih besar dari batas dan pastikan aplikasi menolak sebelum mengirim.
6. Coba mengganti ekstensi file secara palsu dan pastikan PDF atau gambar ditolak.
