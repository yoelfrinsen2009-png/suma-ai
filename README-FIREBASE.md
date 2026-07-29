# Firebase Authentication, Sesi, dan Memori SUMA-AI

Implementasi ini memakai:

- **Firebase Authentication** untuk akun email dan kata sandi.
- **Cloud Firestore** untuk profil, sesi chat, serta pesan.
- **Firebase Security Rules** untuk memastikan setiap akun hanya dapat mengakses datanya sendiri.

> Password tidak disimpan di Firestore. Firebase Authentication mengelola password dan proses login secara aman. Firestore hanya menyimpan profil dan riwayat chat.

## 1. Aktifkan Firebase Authentication

1. Buka [Firebase Console](https://console.firebase.google.com/), lalu pilih proyek yang akan digunakan.
2. Masuk ke **Build > Authentication > Get started**.
3. Buka tab **Sign-in method**.
4. Aktifkan **Email/Password**, lalu simpan.
5. Pada **Settings > Authorized domains**, pastikan domain produksi Anda sudah terdaftar. Domain `localhost` dipakai untuk pengembangan lokal.

Pengguna biasa dapat membuat akun dari tombol **Daftar sekarang** di web. Akun tersebut otomatis muncul pada **Authentication > Users**.

Jika admin ingin membuat akun secara manual:

1. Buka **Authentication > Users**.
2. Klik **Add user**.
3. Isi email dan password awal.
4. Saat pengguna tersebut pertama kali masuk melalui web, dokumen profil Firestore-nya dibuat otomatis.

## 2. Buat Cloud Firestore

1. Masuk ke **Build > Firestore Database**.
2. Klik **Create database**.
3. Pilih **Production mode**.
4. Pilih lokasi database terdekat dengan mayoritas pengguna. Lokasi tidak dapat dipindahkan setelah database dibuat.

Tidak perlu membuat collection secara manual. Web akan membuat struktur berikut saat pengguna mendaftar dan mengirim prompt:

```text
users
└── {uid}
    ├── displayName, email, role, copilot, mood, onboarded, memoryEnabled, memoryDefaultApplied
    ├── memories
    │   └── {memoryId}
    │       └── label, value, category, source, createdAt, updatedAt
    └── sessions
        └── {sessionId}
            ├── title, copilot, mood, messageCount, createdAt, updatedAt
            └── messages
                └── {messageId}
                    └── role, content, time, createdAt, inScope, error
```

Karena sesi berada di bawah `users/{uid}`, akun A dan akun B memiliki daftar sesi yang berbeda.

Memori personal juga berada di bawah UID masing-masing. Security Rules mencegah akun lain membaca, mengubah, atau menghapusnya.

## 3. Hubungkan web app Firebase

1. Buka **Project settings** melalui ikon roda gigi.
2. Pada **Your apps**, klik ikon Web `</>` dan daftarkan aplikasi.
3. Salin nilai pada objek `firebaseConfig`.
4. Salin `.env.example` menjadi `.env.local`.
5. Isi variabel berikut dengan nilai dari Firebase:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Konfigurasi Web Firebase memang terlihat di browser dan bukan password database. Perlindungan data ditentukan oleh Authentication dan `firestore.rules`. Jangan pernah memasukkan private key service account, API key Groq, atau kredensial Google Sheets ke variabel `VITE_*`.

## 4. Pasang dependency dan jalankan lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`, daftar dengan dua email berbeda, lalu pastikan riwayat masing-masing akun tidak tercampur.

## 5. Pasang Security Rules

File `firestore.rules` sudah membatasi akses berdasarkan `request.auth.uid`. Deploy aturan ini sebelum aplikasi dipakai:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest use --add
npm run firebase:rules
```

Jika project ID bukan `sumai-bb116`, ubah argumen `--project` pada script `firebase:deploy` dan `firebase:rules` di `package.json`.

## 6. Build dan deploy web

```bash
npm run check
npm run firebase:deploy
```

Perintah tersebut memeriksa aplikasi Vue, membuat build statis Vite ke folder `dist`, lalu men-deploy Hosting, Firestore Rules, dan konfigurasi index.

## 7. Cara kerja sesi chat

- Sesi baru belum ditulis ke database sampai pengguna mengirim prompt pertama.
- Prompt pertama menjadi judul sesi secara otomatis.
- Prompt dan jawaban AI disimpan sebagai dokumen pesan terpisah.
- Membuka sesi mengambil kembali pesan asli; tidak menjalankan prompt ulang ke n8n.
- Tombol tempat sampah menghapus semua pesan pada sesi, kemudian menghapus dokumen sesinya.
- Listener Firestore hanya membaca maksimal 50 sesi terbaru untuk menjaga biaya dan performa.

## 8. Pemeriksaan setelah deploy

1. Daftar akun A dan kirim dua prompt dalam satu sesi.
2. Klik **Chat baru**, lalu kirim prompt lain.
3. Keluar dan masuk kembali sebagai akun A; kedua sesi harus muncul.
4. Masuk sebagai akun B; sesi akun A tidak boleh terlihat.
5. Hapus satu sesi dan muat ulang halaman; sesi tersebut harus tetap hilang.
6. Di Firebase Console, cek **Firestore Database > Data** untuk melihat dokumen pada path `users/{uid}/sessions`.

## 9. Memori personal per akun

- Memori personal **aktif secara otomatis** untuk akun baru. Akun dari versi lama diaktifkan satu kali ketika login setelah pembaruan.
- Kalimat seperti `nama saya Budi`, `saya tinggal di Bandung`, atau `hobi saya tenis` dapat disimpan ketika fitur memori aktif.
- Perintah eksplisit seperti `ingat bahwa saya lebih suka laporan singkat` akan menyimpan memori dan mengaktifkan personalisasi.
- Pertanyaan seperti `siapa nama saya?` dijawab dari memori akun tanpa menghubungi n8n.
- Saat personalisasi aktif, memori yang tersimpan dikirim sebagai konteks ke workflow n8n/Groq pada percakapan berikutnya. Konteks tersebut ditandai sebagai data, bukan instruksi sistem.
- Buka **menu profil > Memori personal** untuk melihat, menambahkan, menonaktifkan, menghapus satu, atau menghapus semua memori.
- Sistem menolak password, PIN, OTP, token, API key, NIK, nomor rekening, data kartu, dan kredensial berisiko tinggi.
- Menonaktifkan memori menghentikan pemakaian dan penyimpanan otomatis, tetapi tidak langsung menghapus data lama. Gunakan **Hapus semua** jika data harus dihilangkan.

Setelah memperbarui versi lama, deploy kembali Firestore Rules karena koleksi `memories` memerlukan izin owner-only yang baru:

```bash
npm.cmd run firebase:rules
```

Jika muncul `Missing or insufficient permissions`, pastikan pengguna sudah login dan `firestore.rules` terbaru sudah berhasil di-deploy ke project yang sama dengan `VITE_FIREBASE_PROJECT_ID`.
