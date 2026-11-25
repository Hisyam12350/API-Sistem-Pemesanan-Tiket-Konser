# 🎫 API Pemesanan Tiket Konser

Backend REST API untuk sistem **pemesanan tiket konser** — dibangun dengan **Node.js + Express** dan database **Supabase (PostgreSQL)**. API ini menangani autentikasi multi-role, manajemen venue & event, kategori tiket, seat locking, alur checkout dengan **Midtrans Snap**, e-ticket QR Code, hingga validasi check-in tiket oleh scanner.

> Proyek ini merupakan bagian dari ekosistem 3 aplikasi: **API** (backend), **web-tiket-konser** (Next.js), dan **mobile-tiket-konser** (Expo/React Native).

---

## ✨ Fitur Utama

- **Autentikasi & Keamanan Multi-Role** — Register, Login (JWT), dan profil user (`SuperAdmin`, `Admin`, `Customer`, `Scanner`). Registrasi publik **selalu** menghasilkan `Customer` (field `role` diabaikan). Role `Scanner`/`Admin` hanya diberikan lewat `PUT /api/users/:id` oleh SuperAdmin (Admin hanya boleh Customer ⇄ Scanner).
- **Manajemen Event & Banner** — CRUD event konser, upload banner langsung ke Supabase Storage, relasi genre & venue tempat konser.
- **Venue & Tempat Konser** — Master tipe tempat (Stadion, Indoor, Outdoor, Lapangan), katalog tempat dengan filter kategori, pencarian (nama/alamat/kota), dan paginasi.
- **Kategori Tiket & Kuota** — CRUD kategori tiket per event (harga, kuota) dengan penanganan kuota otomatis via DB triggers.
- **Kursi & Seat Locking Otomatis** — Generate nomor kursi massal, penguncian kursi sementara (atomik, anti rebutan), unlock manual, serta auto-release jika masa lock kadaluwarsa (*stale lock recovery*).
- **Checkout & Pemesanan** — Buat pesanan dari kursi yang terkunci, kalkulasi total harga, pembatalan pesanan pending dengan pengembalian kuota & kursi secara otomatis.
- **Payment Gateway Midtrans Snap** — Pembuatan transaksi Snap token, sinkronisasi status pembayaran, dan webhook notification (idempotent, verifikasi signature SHA-512).
- **E-Ticket & QR Code** — Tiket otomatis dibuat setelah pembayaran berhasil. Endpoint detail tiket menyediakan embed kode SVG langsung dan endpoint download file gambar PNG.
- **Scanner Gate Check-In** — Validasi dan check-in QR Code tiket di lokasi konser. Scanner hanya dapat memindai dan melihat rekap event yang ditugaskan Admin; Admin/SuperAdmin tetap dapat menangani semua event.
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
| `scanner_event_assignments` | Penugasan akun Scanner ke event yang boleh ditangani |
| `tickets` | E-ticket (kode unik `TKT-...`, status, waktu scan, petugas scan) |

### Enum
| Enum | Nilai |
|---|---|
| `Role` | SuperAdmin, Admin, Customer, Scanner |
| `event_status` | upcoming, ongoing, completed |
| `order_status` | pending, paid, expired, cancelled |
| `payment_status` | pending, success, expired, failed, refunded |
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
2. Jalankan isi file [`config/schema.sql`](config/schema.sql) untuk inisialisasi tabel, tipe enum, dan trigger fungsi kuota.
3. Jalankan file-file migrasi secara berurutan:
   - `config/migrations/001_add_order_item_seats.sql`
   - `config/migrations/002_venues_google_places.sql`
   - `config/migrations/003_add_locked_by_to_seats.sql`
   - `config/migrations/004_payments_midtrans.sql`
   - `config/migrations/005_scanner_indexes.sql`
   - `config/migrations/006_pg_cron_jobs.sql`
   - `config/migrations/007_security_hardening.sql` — **wajib** (unique tiket per kursi + Row Level Security). Jalankan **sebelum** men-deploy kode backend terbaru.
   - `config/migrations/008_business_rules_and_hardening.sql` — **wajib**, jalankan setelah 007 dan **sebelum** deploy kode terbaru. Isinya: status pembayaran `refunded` + kolom `needs_refund`, email unik tanpa membedakan huruf besar/kecil, constraint data (harga/kuota), index, fungsi pemeliharaan, dan jadwal pg_cron baru (melepas lock kursi dengan aman & mengubah status event otomatis). Aman dijalankan berulang. Menggantikan job pg_cron versi 006.
   - `config/migrations/009_scanner_event_assignments.sql` — **wajib** untuk membatasi Scanner ke event yang ditugaskan.
4. Buka menu **Storage** di dashboard Supabase → pastikan terdapat 2 **Public Bucket** berikut untuk fitur unggah gambar:
   - **`events`** (Public) — tempat penyimpanan gambar banner konser (`banners/...`).
   - **`venues`** (Public) — tempat penyimpanan foto tempat konser (`venues/...`).

> ⚠️ `schema.sql` hanya untuk database **kosong**. Baris `DROP TABLE` di dalamnya sengaja di-comment karena menghapus semua data.

### 4. Konfigurasi Environment (`.env`)
Buat file `.env` di dalam folder `API` berdasarkan contoh di `.env.example`.

> ⚠️ **Variabel Wajib**: Server akan menolak berjalan (`process.exit(1)`) apabila salah satu dari 5 variabel wajib berikut belum diisi: `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, dan `MIDTRANS_SERVER_KEY`.

```env
# Supabase (SUPABASE_URL & SUPABASE_SECRET_KEY WAJIB)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx

# JWT Auth — WAJIB, minimal 32 karakter acak (server tidak mau start jika kosong/lemah)
# Buat: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=isi_dengan_string_acak_hasil_perintah_di_atas
JWT_EXPIRES_IN=1d

# PostgreSQL Connection String (Pooler Supabase) — WAJIB
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres

# Port Server (default 5000)
PORT=5000

# CORS Allowed Origins (pisahkan dengan koma)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Midtrans Payment Gateway (Sandbox) — MIDTRANS_SERVER_KEY WAJIB
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
MIDTRANS_CLIENT_KEY=Mid-client-xxxx
MIDTRANS_SIGNATURE_KEY=SB-Mid-server-xxxx
MIDTRANS_IS_PRODUCTION=false

# Development lokal. Gunakan NODE_ENV=production hanya pada deployment production.
NODE_ENV=development
# Lokal tanpa reverse proxy: 0. Di production, sesuaikan dengan jumlah proxy tepercaya.
TRUST_PROXY=0

# DATABASE_URL menggunakan TLS. Verifikasi sertifikat otomatis aktif di production,
# tetapi nonaktif secara default di development/test. Untuk production, isi CA tepercaya Supabase:
# DB_SSL_CA=<isi sertifikat CA; newline dapat ditulis sebagai \n>
# DB_SSL_REJECT_UNAUTHORIZED=true  # aktifkan verifikasi juga di development/test

# Aturan bisnis & Cache Auth (opsional; ini nilai default)
MAX_SEATS_PER_ORDER=6          # maks kursi per order & maks kursi yang boleh ditahan satu user per event
ORDER_PAYMENT_MINUTES=15       # batas waktu bayar setelah order dibuat
DEFAULT_LOCK_MINUTES=15
MAX_LOCK_MINUTES=60
CHECKIN_OPENS_HOURS_BEFORE=6   # check-in dibuka N jam sebelum acara
CHECKIN_CLOSES_HOURS_AFTER=12  # check-in ditutup N jam setelah acara mulai
AUTH_USER_CACHE_TTL_MS=15000   # durasi cache pengecekan status/role user di DB (ms)
```

### 5. Seeding Data Konser & Menjalankan Server
*(Opsional)* Jika database masih kosong, Anda dapat mengisi data awal konser beserta kategori tiketnya (Bruno Mars, Coldplay, Taylor Swift, Billie Eilish, Dua Lipa) atau membersihkan event dummy pengujian dengan skrip berikut:
```bash
# Mengisi data contoh konser & kategori tiket
node seed_concerts.js

# (Opsional) Membersihkan event dummy/test dari database
node clean_events.js
```

Menjalankan server API:
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

# Menjalankan tes keamanan tanpa koneksi database
npm run test:unit

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
| POST | `/api/auth/register` | Publik | Mendaftar akun baru (selalu `Customer`; field `role` diabaikan) |
| POST | `/api/auth/login` | Publik | Login & mendapatkan JWT Bearer token |
| GET | `/api/auth/me` | Login | Mendapatkan data profil user yang sedang login |
| PUT | `/api/auth/change-password` | Login | Ganti password sendiri (`{ old_password, new_password }`, minimal 8 karakter) |

### 👤 Manajemen User (`/api/users`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/users` | Admin, SuperAdmin | Daftar semua pengguna |
| GET | `/api/users/:id` | Admin, SuperAdmin | Detail data pengguna |
| PUT | `/api/users/:id` | Admin, SuperAdmin, Customer | Update data pengguna. Customer: hanya akun sendiri & tanpa role. Admin: akun sendiri + Customer/Scanner. SuperAdmin: semua (kecuali role sendiri) |
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
| GET | `/api/payments/needs-refund` | Admin, SuperAdmin | Pembayaran yang uangnya masuk tetapi order sudah expired/batal (perlu refund manual di dashboard Midtrans) |

### 🎫 E-Ticket & QR Code (`/api/tickets`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/tickets` | Customer, Admin, SuperAdmin | Daftar seluruh tiket resmi milik user yang login |
| GET | `/api/tickets/:id` | Customer, Admin, SuperAdmin | Detail e-ticket lengkap + embedded SVG QR Code |
| GET | `/api/tickets/:id/download` | Customer, Admin, SuperAdmin | Unduh file QR Code tiket langsung sebagai gambar PNG |

### 📱 Petugas Scanner (`/api/scanner`)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/scanner/check-in` | Scanner, Admin, SuperAdmin | Check-in pengunjung via QR Code (`{ "kode_unik": "TKT-...", "event_id": 1 }` — `event_id` **wajib**; tiket event lain ditolak, order harus berstatus lunas, dan check-in hanya dibuka di jendela waktu sekitar acara) |
| GET | `/api/scanner/scanned-tickets` | Scanner, Admin, SuperAdmin | Riwayat tiket yang sudah dipindai oleh petugas ini |
| GET | `/api/scanner/assigned-events` | Scanner | Daftar event yang ditugaskan kepada petugas |
| GET | `/api/scanner/events/:eventId/scanned` | Scanner, Admin, SuperAdmin | Rekap seluruh tiket yang telah check-in pada event tertentu |
| GET | `/api/scanner/events/:eventId/assignments` | Admin, SuperAdmin | Daftar Scanner yang ditugaskan pada event |
| POST | `/api/scanner/events/:eventId/assignments` | Admin, SuperAdmin | Menugaskan Scanner (`{ "scanner_id": 7 }`) ke event |
| DELETE | `/api/scanner/events/:eventId/assignments/:scannerId` | Admin, SuperAdmin | Mencabut penugasan Scanner dari event |

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
│   ├── limits.js                      # Batas bisnis order, lock, dan check-in
│   ├── supabase.js                    # Client instance Supabase
│   ├── jwt.js                         # Konfigurasi secret & masa aktif JWT
│   ├── envValidation.js               # Validasi kelengkapan variabel .env
│   └── migrations/                    # File migrasi database bertahap
│       ├── 001_add_order_item_seats.sql
│       ├── 002_venues_google_places.sql
│       ├── 003_add_locked_by_to_seats.sql
│       ├── 004_payments_midtrans.sql
│       ├── 005_scanner_indexes.sql
│       ├── 006_pg_cron_jobs.sql
│       ├── 007_security_hardening.sql
│       ├── 008_business_rules_and_hardening.sql
│       └── 009_scanner_event_assignments.sql
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
│   ├── scannerAssignments.js
│   ├── venues.js
│   ├── venueTypes.js
│   └── genres.js
├── routes/                            # Definisi rute URL API
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── eventRoutes.js
│   ├── ticketCategoryRoutes.js
│   ├── seatRoutes.js
│   ├── orderRoutes.js
│   ├── paymentRoutes.js
│   ├── ticketRoutes.js
│   ├── scannerRoutes.js
│   ├── venueRoutes.js
│   ├── venueTypeRoutes.js
│   └── genreRoutes.js
├── validators/                        # Skema validasi input Zod
│   ├── authValidator.js
│   ├── eventValidator.js
│   ├── genreValidator.js
│   ├── orderValidator.js
│   ├── paymentValidator.js
│   ├── scannerValidator.js
│   ├── seatValidator.js
│   ├── ticketCategoryValidator.js
│   ├── userValidator.js
│   └── venueValidator.js
├── utils/                             # Helper & utilitas
│   ├── httpError.js                    # Pemetaan error API tanpa detail internal
│   ├── logger.js                      # Pino logger & HTTP serializer
│   ├── midtransService.js             # Integrasi Midtrans Snap & Webhook
│   ├── qrCodeGenerator.js             # Generator SVG, PNG Buffer, DataURL
│   └── storageService.js              # Pengunggah file ke Supabase Storage
├── docs/                              # Dokumentasi spesifikasi teknis tambahan
│   └── QR_CODE_SPEC.md                # Spesifikasi format & keamanan QR Code tiket
├── tests/                             # Pengujian otomatis Jest & Supertest
│   ├── auth.test.js
│   ├── orders.test.js
│   ├── payments.test.js
│   ├── seats.test.js
│   ├── setup.js
│   ├── security/                       # Tes keamanan terisolasi
│   │   ├── _env.js
│   │   ├── app-hardening.test.js
│   │   ├── auth-middleware.test.js
│   │   ├── limits.test.js
│   │   ├── payment-state.test.js
│   │   ├── scanner.test.js
│   │   ├── users-authz.test.js
│   │   └── webhook.test.js
│   └── utils/testHelpers.js
├── app.js                             # Inisialisasi Express server
├── seed_concerts.js                   # Skrip seeder data konser & kategori tiket
├── clean_events.js                    # Skrip pembersih event dummy/test
├── jest.config.js                     # Konfigurasi Jest
├── package.json                       # Konfigurasi paket & skrip npm
├── README.md                          # Dokumentasi utama proyek
├── TESTING_GUIDE.md                   # Panduan testing langkah-demi-langkah
├── ERD.md                             # Dokumentasi Entity Relationship Diagram (Mermaid)
└── UML.md                             # Dokumentasi Class, Sequence, Activity & Use Case Diagram
```

---

## 📄 Lisensi
Proyek ini dibuat untuk keperluan Uji Kompetensi Keahlian (UKK).
