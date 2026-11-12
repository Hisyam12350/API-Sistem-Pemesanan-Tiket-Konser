# 🎫 API Pemesanan Tiket Konser

Backend REST API untuk sistem **pemesanan tiket konser** — dibangun dengan **Node.js + Express** dan database **Supabase (PostgreSQL)**. API ini menangani autentikasi multi-role, manajemen venue & event, kategori tiket, seat locking, alur checkout dengan **Midtrans Snap**, e-ticket QR Code, hingga validasi check-in tiket oleh scanner.

> Proyek ini merupakan bagian dari ekosistem 3 aplikasi: **API** (backend), **web-tiket-konser** (Next.js), dan **mobile-tiket-konser** (Expo/React Native).

---

## ✨ Fitur Utama

- **Autentikasi & Keamanan Multi-Role** — Register, Login (JWT), dan profil user (`SuperAdmin`, `Admin`, `Customer`, `Scanner`). Registrasi publik aman (default `Customer` dan menolak eskalasi hak akses Admin).
- **Manajemen Event & Banner** — CRUD event konser, upload banner langsung ke Supabase Storage, relasi genre & venue tempat konser.
- **Venue & Tempat Konser** — Master tipe tempat (Stadion, Indoor, Outdoor, Lapangan), katalog tempat dengan filter kategori, pencarian (nama/alamat/kota), dan paginasi.
- **Kategori Tiket & Kuota** — CRUD kategori tiket per event (harga, kuota) dengan penanganan kuota otomatis via DB triggers.
- **Kursi & Seat Locking Otomatis** — Generate nomor kursi massal, penguncian kursi sementara (atomik, anti rebutan), unlock manual, serta auto-release jika masa lock kadaluwarsa (*stale lock recovery*).
- **Checkout & Pemesanan** — Buat pesanan dari kursi yang terkunci, kalkulasi total harga, pembatalan pesanan pending dengan pengembalian kuota & kursi secara otomatis.
- **Payment Gateway Midtrans Snap** — Pembuatan transaksi Snap token, sinkronisasi status pembayaran, dan webhook notification (idempotent, verifikasi signature SHA-512).
- **E-Ticket & QR Code** — Tiket otomatis dibuat setelah pembayaran berhasil. Endpoint detail tiket menyediakan embed kode SVG langsung dan endpoint download file gambar PNG.
- **Scanner Gate Check-In** — Validasi dan check-in QR Code tiket di lokasi konser (role Scanner/Admin), pelacakan riwayat scan tiket per petugas dan per event.
- **Keamanan & Performa** — Rate limiting bertingkat (global, auth, booking, payment, upload, scan), CORS fleksibel (mendukung web & emulator Android `10.0.2.2`), helmet security headers, validasi skema Zod, dan structured JSON logging dengan Pino.
- **Automated Testing** — Suite pengujian otomatis berbasis **Jest & Supertest** yang mencakup pengujian end-to-end seluruh flow utama.

---

## 🧱 Teknologi

| Komponen | Teknologi |
|---|---|
| Runtime | Node.js (v18+) |
| Framework | Express 5 |
| Database | PostgreSQL (Supabase) |
| Akses DB | `@supabase/supabase-js` (REST) & `pg` (Connection Pooling) |
| Auth & Keamanan | JWT (`jsonwebtoken`), `bcryptjs`, `helmet` |
| CORS | `cors` (dengan dukungan dynamic dev & emulator origin) |
| Validasi Input | **Zod** |
| Rate Limiting | `express-rate-limit` |
| Payment Gateway | **Midtrans Snap API** |
| QR Code | `qrcode` (SVG, PNG buffer, Data URL) |
| Upload File | `multer` → Supabase Storage |
| Logging | `pino` & `pino-http` |
| Testing | `jest`, `supertest`, `cross-env` |

---

## 🗄️ Struktur Database

### Tabel Utama
| Tabel | Keterangan |
|---|---|
| `users` | Data akun pengguna, password ter-hash, dan role |
| `events` | Data event konser (`venue_id`, `genre_id`, banner, waktu, deskripsi) |
| `venue_types` | Master tipe tempat (Stadion, Indoor, Outdoor, Lapangan) |
| `venues` | Tempat konser (nama venue, alamat, kota, kapasitas, foto) |
| `genres` | Master genre musik konser (Rock, Pop, Jazz, Dangdut, dll.) |
| `ticket_categories` | Kategori tiket per event (VIP, Festival, Cat 1, dll.) + kuota total & tersedia |
| `seats` | Kursi per kategori + status (`available`, `locked`, `booked`), `locked_by`, `locked_until` |
| `orders` | Pesanan tiket (`cutsomer_id`, status, total bayar, batas waktu bayar) |
| `order_items` | Item dalam pesanan (kategori, jumlah, harga satuan) |
| `order_item_seats` | Junction kursi spesifik yang dipilih untuk setiap order item |
| `payments` | Transaksi pembayaran (Snap token, status, redirect URL, midtrans ID) |
| `tickets` | E-ticket (kode unik `TKT-...`, status, waktu scan, petugas scan) |

### Enum
| Enum | Nilai |
|---|---|
| `Role` | SuperAdmin, Admin, Customer, Scanner |
| `event_status` | upcoming, ongoing, completed |
| `order_status` | pending, paid, expired, cancelled |
| `payment_status` | pending, success, expired, failed |
| `ticket_status` | active, scanned, cancelled |
| `seat_status` | available, locked, booked |

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Prasyarat
- Node.js v18 atau versi lebih tinggi
- Proyek database di [Supabase](https://supabase.com/)
- Akun sandbox [Midtrans](https://app.sandbox.midtrans.com/) (untuk pengujian pembayaran)

### 2. Clone & Install Dependensi
```bash
cd API
npm install
```

### 3. Setup Database (Supabase SQL Editor)
1. Buka dashboard Supabase Anda → masuk ke menu **SQL Editor**.
2. Jalankan isi file [`config/schema.sql`](file:///d:/Folder%20Proyek/Project%20UKK/API/config/schema.sql) untuk inisialisasi tabel, tipe enum, dan trigger fungsi kuota.
3. Jalankan file-file migrasi secara berurutan:
   - `config/migrations/001_add_order_item_seats.sql`
   - `config/migrations/002_venues_google_places.sql`
   - `config/migrations/003_add_locked_by_to_seats.sql`
   - `config/migrations/004_payments_midtrans.sql`
   - `config/migrations/005_scanner_indexes.sql`
   - `config/migrations/006_pg_cron_jobs.sql`

### 4. Konfigurasi Environment (`.env`)
Buat file `.env` di dalam folder `API` berdasarkan contoh di `.env.example`:

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx

# JWT Auth
JWT_SECRET=rahasia_string_jwt_anda_yang_sangat_panjang_dan_aman
JWT_EXPIRES_IN=1d

# PostgreSQL Connection String (Pooler Supabase)
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres

# Port Server (default 5000)
PORT=5000

# CORS Allowed Origins (pisahkan dengan koma)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Midtrans Payment Gateway (Sandbox)
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
MIDTRANS_CLIENT_KEY=Mid-client-xxxx
MIDTRANS_IS_PRODUCTION=false
```

### 5. Menjalankan Server
```bash
# Mode Produksi
npm start

# Mode Development (auto-reload saat ada perubahan file)
npm run dev
```
Server akan aktif di `http://localhost:5000`. Cek `GET http://localhost:5000/` untuk health-check.

### 6. Menjalankan Pengujian Otomatis (Jest)
Backend dilengkapi dengan unit & integration testing:
```bash
# Menjalankan seluruh test suite
npm test

# Menjalankan test dalam mode pantau perubahan (watch mode)
npm run test:watch

# Menghitung coverage pengujian
npm run test:coverage
```

---

## 📡 Daftar Endpoint API Lengkap

Semua endpoint API diawali dengan base path: `/api`

### 🔐 Autentikasi (`/api/auth`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/auth/register` | Publik | Mendaftar akun baru (role default: `Customer`) |
| POST | `/api/auth/login` | Publik | Login & mendapatkan JWT Bearer token |
| GET | `/api/auth/me` | Login | Mendapatkan data profil user yang sedang login |

### 👤 Manajemen User (`/api/users`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/users` | Admin, SuperAdmin | Daftar semua pengguna |
| GET | `/api/users/:id` | Admin, SuperAdmin | Detail data pengguna |
| PUT | `/api/users/:id` | Admin, SuperAdmin, Customer | Update data pengguna |
| DELETE | `/api/users/:id` | SuperAdmin | Hapus akun pengguna |

### 🏟️ Tipe Tempat (`/api/venue-types`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/venue-types` | Publik | Daftar tipe venue (Stadion, Indoor, Outdoor, Lapangan) |
| POST | `/api/venue-types` | Admin, SuperAdmin | Menambah tipe venue baru |
| DELETE | `/api/venue-types/:id` | Admin, SuperAdmin | Menghapus tipe venue (dicegah bila masih dipakai) |

### 📍 Tempat Konser / Venues (`/api/venues`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/venues` | Publik | Daftar venue (filter `?venue_type_id=&search=&kota=&page=&limit=`) |
| GET | `/api/venues/:id` | Publik | Detail informasi venue |
| POST | `/api/venues` | Admin, SuperAdmin | Tambah venue (+ upload file `gambar`) |
| PUT | `/api/venues/:id` | Admin, SuperAdmin | Update venue (+ upload file `gambar` baru) |
| DELETE | `/api/venues/:id` | Admin, SuperAdmin | Hapus venue (dicegah bila terikat event) |

### 🎵 Genre Musik (`/api/genres`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/genres` | Publik | Daftar genre musik konser |
| GET | `/api/genres/:id` | Publik | Detail genre |
| POST | `/api/genres` | Admin, SuperAdmin | Tambah genre musik baru |
| PUT | `/api/genres/:id` | Admin, SuperAdmin | Update data genre |
| DELETE | `/api/genres/:id` | Admin, SuperAdmin | Hapus genre musik |

### 🎤 Event Konser (`/api/events`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/events` | Publik | Daftar semua event konser |
| GET | `/api/events/:id` | Publik | Detail lengkap event (termasuk data venue & genre) |
| POST | `/api/events` | Admin, SuperAdmin | Buat event baru (+ upload banner file) |
| PUT | `/api/events/:id` | Admin, SuperAdmin | Update event konser (+ ganti banner) |
| DELETE | `/api/events/:id` | Admin, SuperAdmin | Hapus event konser |

### 🎟️ Kategori Tiket (`/api/ticket-categories`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/ticket-categories` | Publik | Daftar kategori tiket (filter `?event_id=`) |
| GET | `/api/ticket-categories/:id` | Publik | Detail kategori tiket |
| POST | `/api/ticket-categories` | Admin, SuperAdmin | Tambah kategori tiket baru (harga, kuota) |
| PUT | `/api/ticket-categories/:id` | Admin, SuperAdmin | Update kategori tiket |
| DELETE | `/api/ticket-categories/:id` | Admin, SuperAdmin | Hapus kategori tiket |

### 💺 Kursi / Seats (`/api/seats`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/seats?kategori_id=` | Publik | Daftar kursi per kategori + status (`available`/`locked`/`booked`) |
| POST | `/api/seats/generate` | Admin, SuperAdmin | Generate kursi massal (`{ kategori_id, jumlah, prefix, start_number }`) |
| POST | `/api/seats/lock` | Customer, Admin, SuperAdmin | Kunci kursi sementara saat proses checkout (`{ seat_ids, minutes }`) |
| POST | `/api/seats/unlock` | Customer, Admin, SuperAdmin | Buka kunci kursi yang pernah di-lock (`{ seat_ids }`) |

### 🛒 Pesanan / Orders (`/api/orders`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/orders` | Customer, Admin, SuperAdmin | Buat pesanan dari kursi yang terkunci (`{ seat_ids }`) |
| GET | `/api/orders` | Customer, Admin, SuperAdmin | Daftar pesanan user (Admin melihat semua pesanan) |
| GET | `/api/orders/:id` | Customer, Admin, SuperAdmin | Detail pesanan, rincian tiket kategori, & daftar kursi |
| POST | `/api/orders/:id/cancel` | Customer, Admin, SuperAdmin | Batalkan pesanan pending (kuota & kursi dipulihkan) |

### 💳 Pembayaran Midtrans Snap (`/api/payments`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/payments/:orderId/create` | Customer, Admin, SuperAdmin | Buat transaksi Midtrans Snap token & redirect URL |
| GET | `/api/payments/:orderId` | Customer, Admin, SuperAdmin | Cek status pembayaran & sinkronisasi dengan Midtrans |
| POST | `/api/payments/notification` | Publik | Webhook notifikasi otomatis dari server Midtrans |

### 🎫 E-Ticket & QR Code (`/api/tickets`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/tickets` | Customer, Admin, SuperAdmin | Daftar seluruh tiket resmi milik user yang login |
| GET | `/api/tickets/:id` | Customer, Admin, SuperAdmin | Detail e-ticket lengkap + embedded SVG QR Code |
| GET | `/api/tickets/:id/download` | Customer, Admin, SuperAdmin | Unduh file QR Code tiket langsung sebagai gambar PNG |

### 📱 Petugas Scanner (`/api/scanner`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/scanner/check-in` | Scanner, Admin, SuperAdmin | Check-in pengunjung via QR Code (`{ "kode_unik": "TKT-..." }`) |
| GET | `/api/scanner/scanned-tickets` | Scanner, Admin, SuperAdmin | Riwayat tiket yang sudah dipindai oleh petugas ini |
| GET | `/api/scanner/events/:eventId/scanned` | Scanner, Admin, SuperAdmin | Rekap seluruh tiket yang telah check-in pada event tertentu |

---

## 🛡️ Kebijakan Rate Limiting

Untuk melindungi server dari *brute-force* dan serangan *denial-of-service*, sistem menerapkan pembatasan request per IP:

- **Global Limiter**: 100 request / 15 menit
- **Auth Limiter** (`/api/auth/login`, `/api/auth/register`): 10 request / 15 menit
- **Seat Lock Limiter** (`/api/seats/lock`): 20 request / 5 menit
- **Payment Limiter** (`/api/payments/:orderId/create`): 10 request / 5 menit
- **Seat Generate Limiter** (`/api/seats/generate`): 10 request / 1 jam
- **Order Creation Limiter** (`POST /api/orders`): 10 request / 5 menit
- **Upload File Limiter** (Banner event & Foto venue): 5 request / 10 menit
- **Scanner Check-In Limiter** (`POST /api/scanner/check-in`): 30 request / 1 menit

---

## 📁 Struktur Direktori Proyek

```
API/
├── config/
│   ├── schema.sql                     # Skema database lengkap
│   ├── db.js                          # Koneksi pool PostgreSQL (pg)
│   ├── supabase.js                    # Client instance Supabase
│   ├── jwt.js                         # Konfigurasi secret & masa aktif JWT
│   ├── envValidation.js               # Validasi kelengkapan variabel .env
│   └── migrations/                    # File migrasi database bertahap
│       ├── 001_add_order_item_seats.sql
│       ├── 002_venues_google_places.sql
│       ├── 003_add_locked_by_to_seats.sql
│       ├── 004_payments_midtrans.sql
│       ├── 005_scanner_indexes.sql
│       └── 006_pg_cron_jobs.sql
├── controllers/                       # Handler request/response per domain
│   ├── authController.js
│   ├── userController.js
│   ├── eventsController.js
│   ├── ticketCategoriesController.js
│   ├── seatsController.js
│   ├── ordersController.js
│   ├── paymentsController.js
│   ├── ticketController.js
│   ├── scannerController.js
│   ├── venuesController.js
│   ├── venueTypesController.js
│   └── genresController.js
├── middleware/                        # Middleware Express
│   ├── authMiddleware.js              # Verifikasi token JWT & otorisasi role
│   ├── corsMiddleware.js              # Penanganan CORS dinamis & aman
│   ├── helmetMiddleware.js            # HTTP security headers
│   ├── rateLimiter.js                 # Aturan pembatasan request
│   ├── uploadMiddleware.js            # Konfigurasi multer
│   └── validationMiddleware.js        # Validasi skema Zod
├── models/                            # Abstraksi akses query data
│   ├── userModel.js
│   ├── events.js
│   ├── ticketCategories.js
│   ├── seats.js
│   ├── orders.js
│   ├── payments.js
│   ├── venues.js
│   ├── venueTypes.js
│   └── genres.js
├── routes/                            # Definisi rute URL API
├── validators/                        # Skema validasi input Zod
├── utils/                             # Helper & utilitas
│   ├── logger.js                      # Pino logger & HTTP serializer
│   ├── midtransService.js             # Integrasi Midtrans Snap & Webhook
│   ├── qrCodeGenerator.js             # Generator SVG, PNG Buffer, DataURL
│   └── storageService.js              # Pengunggah file ke Supabase Storage
├── tests/                             # Pengujian otomatis Jest & Supertest
│   ├── auth.test.js
│   ├── orders.test.js
│   ├── payments.test.js
│   ├── seats.test.js
│   ├── setup.js
│   └── utils/testHelpers.js
├── app.js                             # Inisialisasi Express server
├── jest.config.js                     # Konfigurasi Jest
├── package.json                       # Konfigurasi paket & skrip npm
├── README.md                          # Dokumentasi utama proyek
└── TESTING_GUIDE.md                   # Panduan testing langkah-demi-langkah
```

---

## 📄 Lisensi
Proyek ini dibuat untuk keperluan Uji Kompetensi Keahlian (UKK).
