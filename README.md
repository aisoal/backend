<pre align="center">
   ░███   ░██████                             ░██ 
  ░██░██    ░██                               ░██ 
 ░██  ░██   ░██  ░███████  ░███████  ░██████  ░██ 
░█████████  ░██ ░██       ░██    ░██      ░██ ░██ 
░██    ░██  ░██  ░███████ ░██    ░██ ░███████ ░██ 
░██    ░██  ░██        ░██░██    ░██░██   ░██ ░██ 
░██    ░██░██████░███████  ░███████  ░█████░██░██ 
</pre>

# Backend Layer

> _Sudah berhasil buat jalanin AI layer? Jika belum [📄 Lihat Panduan](https://github.com/aisoal/ai) terlebih dahulu._

Modul ini adalah **Backend Layer** berbasis Node.js (Express) yang berfungsi sebagai otak pusat dalam ekosistem AIsoal. Modul ini bertanggung jawab mengelola alur kerja dari pengguna (Frontend) menuju mesin kecerdasan (AI Layer) dan menyimpannya secara permanen ke Database.

Backend ini menangani:

1.  **Orkestrasi Sesi**: Mengelola alur generasi soal dari awal hingga akhir.
2.  **Pemrosesan PDF**: Melakukan pemotongan (_cropping_) halaman PDF menggunakan `pdf-lib`.
3.  **Prompt Engineering**: Menyusun instruksi cerdas berdasarkan Taksonomi Bloom (LOTS/MOTS/HOTS) via `template.js`.
4.  **Robust JSON Extraction**: Menjamin validitas data output menggunakan _Regex Extraction_ dan _JSON Repair_.
5.  **User Management**: Autentikasi keamanan menggunakan JWT dan Bcrypt.

---

## 🚀 Persiapan & Instalasi

Backend ini membutuhkan **AI Layer** dan **Database** berjalan agar dapat berfungsi sepenuhnya.

### 1. Konfigurasi Environment (`.env`)

Buat file `.env` di root folder backend dan sesuaikan konfigurasinya:

```env
PORT=7645
JWT_SECRET=isi_secret_acak_disini
URL_AI=http://localhost:8000

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_DATABASE=aisoal_db
DB_PORT=3306
```

### 2. Instalasi Dependensi

Pastikan Node.js (v16+) telah terinstall di sistem Anda.

```bash
# Install package
yarn install

# Menjalankan dalam mode development (dengan nodemon)
yarn start
```

---

## 🏗️ Arsitektur Logika

Backend mengimplementasikan alur **Post-Processing** yang ketat untuk memastikan hasil AI dapat dibaca oleh sistem:

- **Cleaning**: Menghapus sitasi model seperti `[1]`, `[2]` yang sering muncul.
- **Regex Match**: Mencari pola `[...]` (array) di dalam teks naratif AI.
- **JSON Repair**: Memperbaiki sintaks JSON yang rusak (kurang koma, tanda petik salah, dll) menggunakan library `jsonrepair`.

---

## 📡 API Endpoints

### 🔐 Authentication (`/api/auth`)

- `POST /register` - Pendaftaran pengguna baru.
- `POST /login` - Masuk dan mendapatkan Token JWT.
- `GET /me` - Mendapatkan informasi profil pengguna saat ini.

### 📤 Generation & Upload (`/api/upload`)

- `POST /` - Proses utama: Unggah PDF, Crop Halaman, Panggil AI, dan Simpan Hasil.
- `POST /add-to-session/:sessionId` - Menambah soal baru ke dalam sesi yang sudah ada.

### 📁 History & Sessions (`/api/sessions`)

- `GET /` - Mengambil daftar semua sesi generasi milik pengguna.
- `GET /:id` - Mengambil detail soal dan log telemetri dari satu sesi tertentu.
- `PUT /:id/title` - Mengubah judul sesi.
- `DELETE /:id` - Menghapus sesi beserta seluruh soal dan log terkait.

### 📊 Statistics (`/api/stats`)

- `GET /` - Mengambil data agregat dari semua user (Rata-rata Latensi, Confidence Score, Token Usage).

---

## 📂 Struktur Folder Utama

```text
backend/
├── app/
│   ├── index.js          # Entry point aplikasi
│   ├── routes.js         # Central routing
│   ├── upload.routes.js  # Logika utama pemrosesan AI & PDF
│   ├── auth.routes.js    # Logika autentikasi
│   ├── sessions.routes.js# Logika riwayat data
│   └── stats.routes.js   # Logika metrik penelitian (Bab 4)
├── utils/
│   ├── dbConnect.js      # Pool koneksi MySQL
│   ├── extractJSONArray.js # Mesin pembersihan JSON AI
│   ├── template.js       # Prompt Engineering (Bloom's Taxonomy)
│   └── uploadMateri.js   # Konfigurasi penyimpanan file Multer
├── uploads/              # Folder penyimpanan sementara PDF
└── .env                  # Konfigurasi sistem
```

## ⚙️ Konfigurasi Frontend

Lanjut [📄 Lihat Panduan](https://github.com/aisoal/frontend)
