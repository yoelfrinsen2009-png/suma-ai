# SUMA-AI Copilot — Vue 3 + Firebase

Frontend SUMA-AI ini menggunakan **Vue 3**, **TypeScript**, dan **Vite**. Firebase Authentication, Cloud Firestore, workflow n8n/AI, sesi chat per akun, dan memori personal tetap dipertahankan.

## Fitur

- Register, login, lupa kata sandi, dan logout dengan Firebase Authentication.
- Sesi chat tersimpan dan terpisah berdasarkan UID akun.
- Sesi dapat dibuka kembali atau dihapus dari web.
- Memori personal otomatis aktif per akun, tetap dapat dinonaktifkan, dilihat, dan dihapus.
- Data sensitif seperti password, PIN, OTP, NIK, rekening, kartu, dan token ditolak dari memori.
- Upload dan analisis PDF, DOCX, XLSX, CSV, teks, JSON, serta gambar.
- PDF dan gambar dianalisis secara multimodal. DOCX dan XLSX diekstrak di browser.
- Frontend statis Vue dapat langsung di-host di Firebase Hosting.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Vite akan menampilkan alamat lokal, biasanya `http://localhost:5173`.

## Deploy cepat di Windows

1. Ekstrak ZIP proyek.
2. Klik dua kali `DEPLOY_FIREBASE.bat`.
3. Script memasang dependency jika belum ada, menjalankan pemeriksaan, membangun folder `dist`, lalu men-deploy Firebase Hosting dan Firestore Rules.

Konfigurasi Firebase proyek `sumai-bb116` sudah tersedia dalam `.env.local`.

## Panduan

- [Menjalankan seluruh stack dengan Docker](./DOCKER.md)
- [Firebase, akun, sesi, dan memori](./README-FIREBASE.md)
- [Workflow n8n, Google Sheets, dan Groq](./README-N8N.md)
- [Upload file dan workflow Gemini](./README-FILE-ANALYSIS.md)
