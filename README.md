# 🎫 API Pemesanan Tiket Konser
 
 Backend REST API untuk sistem **pemesanan tiket konser** — dibangun dengan **Node.js + Express** dan database **Supabase (PostgreSQL)**. API ini menangani autentikasi multi-role, manajemen event, kategori tiket, hingga alur pemesanan dan check-in tiket.
 
 > Proyek ini merupakan bagian dari ekosistem 3 aplikasi: **API** (backend), **web-tiket-konser** (Next.js), dan **mobile-tiket-konser** (Expo/React Native).
 
 ---
 
 ## ✨ Fitur yang Sudah Berjalan
 
 - **Autentikasi & Otorisasi** — Register, Login (JWT), dan profil user.
 - **Multi-Role** — `SuperAdmin`, `Admin`, `Customer`, `Scanner` dengan kontrol akses per endpoint.
 - **Manajemen Event** — CRUD event + upload banner ke Supabase Storage + relasi venue (Step 1–2: pilih tempat lalu isi detail).
 - **Venue & Tempat Event** — Master tipe tempat (Stadion/Indoor/Outdoor/Lapangan), daftar venue dengan filter kategori + search + pagination, input alamat secara manual oleh admin.
 - **Kategori Tiket** — CRUD kategori tiket per event (harga, kuota) dengan tracking kuota otomatis.
 - **Kursi & Seat Locking** — Generate kursi massal per kategori, lock kursi sementara (anti rebutan), dan unlock.
 - **Orders / Checkout** — Buat order dari kursi terkunci, batalkan order pending, pembayaran via **Midtrans Snap** (gateway).
 - **Scanner / Check-in** — QR Code check-in tiket, daftar tiket yang dipindai per scanner & per event (role Scanner).
 - **Keamanan** — Password di-hash dengan bcrypt, token JWT, **validasi input Zod**, **rate limiting**, **validasi environment startup**.
 
 ### 🚧 Sedang Dikembangkan (Roadmap)
 - E-Ticket + QR Code (sudah ada generator di backend, perlu integrasi frontend)
 
 ---
 
 ## 🧱 Teknologi
 
 | Komponen | Teknologi |
 |---|---|
 | Runtime | Node.js |
 | Framework | Express 5 |
 | Database | PostgreSQL (Supabase) |
 | Akses DB | `@supabase/supabase-js` & `pg` (Pool) |
 | Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
 | Validasi | **Zod** |
 | Rate Limiting | **express-rate-limit** |
 | QR Code | **qrcode** |
 | Upload File | `multer` → Supabase Storage |
 | Konfigurasi | `dotenv` |

---

## 🗄️ Struktur Database

### Tabel
| Tabel | Keterangan |
|---|---|
| `users` | Data pengguna & role |
| `events` | Data event/konser (+ `venue_id`, `genre_id`, `deskripsi`, `detail_lokasi`) |
| `venue_types` | Master tipe tempat (Stadion, Indoor, Outdoor, Lapangan) |
| `venues` | Daftar tempat (alamat diisi manual) |
| `genres` | Master genre musik (Rock, Pop, Jazz, Dangdut, dll.) |
| `ticket_categories` | Kategori tiket per event (VIP, Festival, dll) + kuota |
| `seats` | Kursi per kategori + status & waktu lock |
| `orders` | Pesanan (status, total, batas waktu bayar) |
| `order_items` | Item dalam pesanan (kategori, jumlah, harga satuan) |
| `order_item_seats` | **Junction** kursi spesifik yang dipilih per order item |
| `payments` | Transaksi pembayaran |
| `tickets` | E-ticket (kode unik, status, info scan) |

### Enum
| Enum | Nilai |
|---|---|
| `Role` | SuperAdmin, Admin, Customer, Scanner |
| `event_status` | upcoming, ongoing, completed |
| `order_status` | pending, paid, expired, cancelled |
| `payment_status` | pending, success, expired, failed |
| `ticket_status` | active, scanned, cancelled |
| `seat_status` | available, locked, booked |

### Entity Relationship (ERD)

```mermaid
erDiagram
    users ||--o{ orders : "memesan"
    venue_types ||--o{ venues : "mengkategorikan"
    venues ||--o{ events : "menjadi lokasi"
    genres ||--o{ events : "mengklasifikasikan"
    events ||--o{ ticket_categories : "memiliki"
    ticket_categories ||--o{ seats : "memiliki"
    orders ||--o{ order_items : "berisi"
    order_items ||--o{ order_item_seats : "memilih kursi"
    order_items }o--|| ticket_categories : "merujuk"
    seats ||--o{ order_item_seats : "dipilih pada"
    orders ||--o{ payments : "dibayar via"
    orders ||--o{ tickets : "menghasilkan"
    ticket_categories ||--o{ tickets : "kategori"
    seats ||--o{ tickets : "kursi"
    users ||--o{ tickets : "discan oleh"
```

### Trigger Database (logika bisnis di sisi DB)
| Trigger | Fungsi |
|---|---|
| `trigger_kurangi_kuota` | Mengurangi kuota saat `order_items` di-insert (cegah overselling) |
| `trigger_kalkulasi_total_tiket` | Menghitung ulang `total_pembayaran` pada order |
| `trigger_kembalikan_kuota` | Mengembalikan kuota & membebaskan kursi saat order `expired`/`cancelled` |

---

## 🚀 Instalasi & Menjalankan

### Prasyarat
- [Node.js](https://nodejs.org/) (v18 atau lebih baru)
- Akun & proyek [Supabase](https://supabase.com/)

### 1. Clone & Install
```bash
git clone <url-repo-anda>
cd API
npm install
```

### 3. Setup Database
 1. Buka proyek Supabase Anda → **SQL Editor**.
 2. Jalankan isi file `config/schema.sql` untuk membuat seluruh tabel, enum, dan trigger.
 3. Jika sudah pernah setup sebelumnya, jalankan migration terbaru secara berurutan:
 `config/migrations/001_add_order_item_seats.sql` lalu
     `config/migrations/002_venues_google_places.sql` lalu
     `config/migrations/003_add_locked_by_to_seats.sql` lalu
     `config/migrations/004_payments_midtrans.sql` lalu
     `config/migrations/005_scanner_indexes.sql`

### 3. Konfigurasi Environment
Salin contoh berikut ke file `.env` di root proyek, lalu isi dengan kredensial Supabase Anda:
```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
SUPABASE_JWKS_URL=https://xxxx.supabase.co/auth/v1/.well-known/jwks.json

# JWT (WAJIB: gunakan string acak yang panjang & rahasia untuk produksi)
JWT_SECRET=ganti_dengan_string_acak_yang_panjang_dan_rahasia
JWT_EXPIRES_IN=1d

# Koneksi DB langsung (opsional, untuk fitur transaksional via pg)
DATABASE_URL=postgresql://user:password@host:5432/postgres

# Port server (opsional, default 5000)
PORT=5000

# Midtrans Payment Gateway
MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
MIDTRANS_CLIENT_KEY=Mid-client-xxx
MIDTRANS_SIGNATURE_KEY=SB-Mid-server-xxx
MIDTRANS_IS_PRODUCTION=false
```

### 4. Jalankan Server
```bash
# Produksi / biasa
npm start        # atau: node app.js

# Development (auto-reload otomatis via Node --watch, tanpa dependency tambahan)
npm run dev
```
Server berjalan di `http://localhost:5000`. Endpoint health check: `GET /`.

## 📡 Daftar Endpoint API

Base URL: `/api`

### 🔐 Auth
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/auth/register` | Publik | Registrasi user baru |
| POST | `/api/auth/login` | Publik | Login, mengembalikan token JWT |
| GET | `/api/auth/me` | Login | Ambil profil user saat ini |

### 👤 Users
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/users` | Admin/SuperAdmin | Daftar semua user |
| GET | `/api/users/:id` | Admin/SuperAdmin | Detail user |
| PUT | `/api/users/:id` | Admin/SuperAdmin/Customer | Update user |
| DELETE | `/api/users/:id` | SuperAdmin | Hapus user |

### 🎤 Events
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/events` | Publik | Daftar semua event |
| GET | `/api/events/:id` | Publik | Detail event |
| POST | `/api/events` | Admin/SuperAdmin | Buat event (upload banner). Step 2: terima `venue_id`, `deskripsi`, `detail_lokasi`; `lokasi` diisi otomatis dari venue bila kosong |
| PUT | `/api/events/:id` | Admin/SuperAdmin | Update event (bisa ganti/lepas venue) |
| DELETE | `/api/events/:id` | Admin/SuperAdmin | Hapus event |

### 🏟️ Venue Types (Tipe Tempat — Step 1)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/venue-types` | Publik | Daftar tipe (Stadion, Indoor, Outdoor, Lapangan) |
| POST | `/api/venue-types` | Admin/SuperAdmin | Tambah tipe tempat |
| DELETE | `/api/venue-types/:id` | Admin/SuperAdmin | Hapus tipe (ditolak 409 bila masih dipakai venue) |

### 📍 Venues (Tempat — Step 1)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/venues?venue_type_id=&search=&kota=&page=&limit=` | Publik | Daftar venue: filter kategori + search nama/alamat/kota + pagination |
| GET | `/api/venues/:id` | Publik | Detail venue (nama + alamat + kota) |
| POST | `/api/venues` | Admin/SuperAdmin | Buat venue manual (input nama, alamat, kota, kapasitas + upload gambar) |
| PUT | `/api/venues/:id` | Admin/SuperAdmin | Update venue |
| DELETE | `/api/venues/:id` | Admin/SuperAdmin | Hapus venue (ditolak 409 bila masih dipakai event) |

### 🎵 Genres (Genre Musik)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/genres` | Publik | Daftar genre musik (Rock, Pop, Jazz, Dangdut, dll.) |
| GET | `/api/genres/:id` | Publik | Detail genre |
| POST | `/api/genres` | Admin/SuperAdmin | Buat genre baru |
| PUT | `/api/genres/:id` | Admin/SuperAdmin | Update genre |
| DELETE | `/api/genres/:id` | Admin/SuperAdmin | Hapus genre (ditolak 409 bila masih dipakai event) |

### 🎟️ Ticket Categories
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/ticket-categories?event_id=` | Publik | Daftar kategori (bisa filter per event) |
| GET | `/api/ticket-categories/:id` | Publik | Detail kategori |
| POST | `/api/ticket-categories` | Admin/SuperAdmin | Buat kategori tiket |
| PUT | `/api/ticket-categories/:id` | Admin/SuperAdmin | Update kategori |
| DELETE | `/api/ticket-categories/:id` | Admin/SuperAdmin | Hapus kategori |

### 💺 Seats (Kursi)
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/seats?kategori_id=` | Publik | Daftar kursi suatu kategori + status (`available`/`locked`/`booked`) |
| POST | `/api/seats/generate` | Admin/SuperAdmin | Generate kursi massal. Body: `{ kategori_id, jumlah, prefix?, start_number? }` |
| POST | `/api/seats/lock` | Customer/Admin | Lock kursi sementara. Body: `{ seat_ids: [..], minutes? }` (default 15 mnt) |
| POST | `/api/seats/unlock` | Customer/Admin | Buka lock kursi. Body: `{ seat_ids: [..] }` |

> **Catatan Seat Locking:** Penguncian bersifat **atomik** — jika salah satu kursi sudah di-lock/dibooking user lain, seluruh permintaan lock dibatalkan (tidak ada kursi yang tertahan). Update terkondisi `status='available'` mencegah dua user merebut kursi yang sama.

### 🛒 Orders / Checkout
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/orders` | Customer/Admin/SuperAdmin | Buat order dari kursi terkunci. Body: `{ seat_ids: [..] }` |
| GET | `/api/orders` | Customer/Admin/SuperAdmin | Daftar order (Customer: milik sendiri; Admin/SuperAdmin: semua) |
| GET | `/api/orders/:id` | Customer/Admin/SuperAdmin | Detail order + items + seats |
| POST | `/api/orders/:id/cancel` | Customer/Admin/SuperAdmin | Batalkan order pending (kuota & kursi dipulihkan) |

> **Catatan Orders:** `batas_waktu_bayar = NOW() + 15 menit`. Kursi tetap `locked` setelah checkout; trigger DB membebaskan kursi pada `expired`/`cancelled`; pembayaran via gateway mengubah kursi menjadi `booked`. Kolom `cutsomer_id` (typo) dipakai literal sesuai schema.

### 💳 Payment Gateway (Midtrans Snap)
 
 | Method | Endpoint | Akses | Keterangan |
 |---|---|---|---|
 | POST | `/api/payments/:orderId/create` | Customer/Admin/SuperAdmin | Buat transaksi Snap, kembalikan `snap_token` & `redirect_url` |
 | GET | `/api/payments/:orderId` | Customer/Admin/SuperAdmin | Status pembayaran + riwayat + tiket |
 | POST | `/api/payments/notification` | **Publik** (tanpa token) | Webhook Midtrans — signature SHA512, idempotent |
 
 ### 📱 Scanner / Check-in
 
 | Method | Endpoint | Akses | Keterangan |
 |---|---|---|---|
 | POST | `/api/scanner/check-in` | Scanner/Admin/SuperAdmin | Scan QR code, validasi, update tiket. Body: `{ "kode_unik": "TKT-1-5-ABC123" }` |
 | GET | `/api/scanner/scanned-tickets` | Scanner/Admin/SuperAdmin | Daftar tiket yang dipindai oleh scanner ini |
 | GET | `/api/scanner/events/:eventId/scanned` | Scanner/Admin/SuperAdmin | Daftar semua tiket dipindai untuk event tertentu |
 
 > **Catatan Scanner:**
 > - QR Code berisi `kode_unik` tiket (format: `TKT-{event_id}-{kategori_id}-{random}`)
 > - Backend menyediakan generator QR SVG/PNG via `utils/qrCodeGenerator.js`
 > - Spesifikasi lengkap untuk frontend: `docs/QR_CODE_SPEC.md`
 > - Rate limit: 30 request/menit per IP di `/api/scanner/check-in`

> **Catatan Payment Gateway:**
> - `snap_token` digunakan frontend untuk membuka halaman pembayaran Midtrans (Snap.js / redirect).
> - Webhook **harus** dapat dijangkau dari internet (bukan localhost) saat production; gunakan tunneling (ngrok/localtunnel) saat development.
> - Verifikasi signature: `SHA512(order_id + status_code + gross_amount + server_key)` — dicocokkan dengan `signature_key` dari Midtrans.
> - Idempotent: webhook `settlement` yang dikirim ulang tidak menghasilkan tiket duplikat.
> - Status Midtrans → internal: `capture/settlement` → `success`; `pending` → `pending`; `deny` → `failed`; `expire` → `expired`; `cancel/refund` → `failed`.

### 🔑 Cara Autentikasi
Endpoint bertanda **Login/Admin/SuperAdmin** memerlukan header:
```
Authorization: Bearer <token_dari_login>
```

## 👥 Role & Hak Akses

| Role | Kemampuan |
|---|---|
| **SuperAdmin** | Akses penuh, termasuk hapus user & kelola semua resource |
| **Admin** | Kelola event & kategori tiket |
| **Customer** | Melihat event, memesan tiket, melihat e-ticket miliknya |
| **Scanner** | Memvalidasi & check-in tiket di lokasi event |

---

## 📁 Struktur Folder

```
API/
├── config/
│   ├── schema.sql                 # Skema database lengkap (tabel, enum, trigger, index)
│   ├── migrations/                # File migrasi bertahap
│   │   ├── 001_add_order_item_seats.sql
│   │   ├── 002_venues_google_places.sql
│   │   ├── 003_add_locked_by_to_seats.sql
│   │   └── 004_payments_midtrans.sql
│   ├── supabase.js                # Inisialisasi Supabase client
│   ├── db.js                      # PostgreSQL connection pool (pg)
│   └── jwt.js                     # Sumber tunggal konfigurasi JWT
├── controllers/                   # Logika request/response per resource
│   ├── authController.js          # Register, login, profil user
│   ├── userController.js          # CRUD user (admin-only)
│   ├── eventsController.js        # CRUD event + upload banner
│   ├── ticketCategoriesController.js  # CRUD kategori tiket per event
│   ├── seatsController.js         # Generate, lock, unlock kursi
│   ├── ordersController.js        # Buat, list, detail, batalkan order
│   ├── venueTypesController.js    # CRUD master tipe tempat (Stadion, Indoor, Outdoor, Lapangan)
│   ├── venuesController.js        # CRUD venue + upload gambar
│   ├── genresController.js        # CRUD master genre musik
│   ├── paymentsController.js      # Create payment, get status, webhook notification
├── middleware/
│   ├── authMiddleware.js          # verifyToken & authorizeRoles
│   └── uploadMiddleware.js        # Konfigurasi multer (upload gambar)
├── models/                        # Akses data ke database (Supabase/pg)
│   ├── userModel.js               # User & auth helpers
│   ├── events.js                  # Model event (waktu, venue, genre)
│   ├── ticketCategories.js        # Model kategori tiket (harga, kuota)
│   ├── seats.js                   # Model kursi (status, locked_by, locked_until)
│   ├── orders.js                  # Model order (status_order, total_pembayaran, batas_waktu_bayar)
│   ├── payments.js                # Model pembayaran & tiket (Midtrans)
│   ├── venueTypes.js              # Model tabel venue_types
│   ├── venues.js                  # Model tabel venues
│   └── genres.js                  # Model tabel genres
├── routes/                        # Definisi endpoint per resource
 │   ├── authRoutes.js              # POST /register, /login, GET /me
 │   ├── userRoutes.js              # CRUD user (admin)
 │   ├── eventRoutes.js             # CRUD event (admin)
 │   ├── ticketCategoryRoutes.js    # CRUD kategori tiket (admin)
 │   ├── seatRoutes.js              # Generate, lock, unlock kursi
 │   ├── orderRoutes.js             # Buat, list, detail, cancel order
 │   ├── paymentRoutes.js           # POST /create, GET /:id, POST /notification
 │   ├── venueTypeRoutes.js         # GET/POST/DELETE /api/venue-types
 │   ├── venueRoutes.js             # GET/POST/PUT/DELETE /api/venues
 │   ├── genreRoutes.js             # GET/POST/PUT/DELETE /api/genres
 │   └── scannerRoutes.js           # POST /check-in, GET /scanned-tickets, GET /events/:id/scanned
 ├── validators/                    # Zod schema validasi input
 │   ├── authValidator.js
 │   ├── eventValidator.js
 │   ├── venueValidator.js
 │   ├── genreValidator.js
 │   ├── ticketCategoryValidator.js
 │   ├── seatValidator.js
 │   ├── orderValidator.js
 │   ├── paymentValidator.js
 │   └── scannerValidator.js
 ├── middleware/
 │   ├── authMiddleware.js          # verifyToken & authorizeRoles
 │   ├── uploadMiddleware.js        # Konfigurasi multer (upload gambar)
 │   ├── validationMiddleware.js    # Generic validate(schema) middleware
 │   └── rateLimiter.js             # express-rate-limit configs (global + per-endpoint)
 ├── utils/                         # Utilitas & helper
 │   ├── storageService.js          # Upload/hapus file ke Supabase Storage
 │   ├── midtransService.js         # Midtrans Snap: createTransaction, verifySignature, mapStatus
 │   └── qrCodeGenerator.js         # Generate QR Code (SVG/PNG/DataURL) dari kode_unik
├── app.js                         # Entry point aplikasi
└── package.json
```

---

## 📝 Contoh Penggunaan (Quick Start)

**1. Register Admin**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin1","email":"admin@mail.com","password":"rahasia123","role":"Admin"}'
```

**2. Login (ambil token)**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mail.com","password":"rahasia123"}'
```

**3. Buat Kategori Tiket (pakai token)**
```bash
curl -X POST http://localhost:5000/api/ticket-categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"event_id":1,"nama_kategori":"VIP","harga":500000,"kuota_total":100}'
```

**4. Flow Payment Gateway (Customer)**
```bash
# a. Login customer & lock kursi
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"shasa@gmail.com","password":"customer123"}'

curl -X POST http://localhost:5000/api/seats/lock \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{"seat_ids":[1,2],"minutes":15}'

# b. Buat order
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{"seat_ids":[1,2]}'

# c. Buat transaksi Midtrans Snap
curl -X POST http://localhost:5000/api/payments/1/create \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{}'
# → dapat snap_token & redirect_url

# d. Buka redirect_url di browser → bayar di sandbox Midtrans

# e. Cek status (setelah webhook settlement)
curl -X GET http://localhost:5000/api/payments/1 \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
# → status paid, tiket ter-generate
```

---

## ⚠️ Catatan Penting
 
 - **`JWT_SECRET` wajib diset** di `.env`. Fallback default hanya untuk development — jangan dipakai di produksi.
 - Jalankan **migration terbaru secara berurutan** (`001_add_order_item_seats.sql`, `002_venues_google_places.sql`, `003_add_locked_by_to_seats.sql`, `004_payments_midtrans.sql`, `005_scanner_indexes.sql`) agar tabel `order_item_seats`, `venue_types`, `venues`, `locked_by`, `payments` (kolom Snap), `tickets` indexes scanner, dan trigger terbaru tersedia.
 - **Jangan commit file `.env`** ke repository (pastikan sudah masuk `.gitignore`).
 - Kolom `orders` menggunakan nama `cutsomer_id` (typo) — perhatikan saat query.
 - **Validasi Input (Zod):** Semua endpoint POST/PUT sekarang divalidasi via Zod schema. Error response 400 dengan detail field: `{ success: false, message: "Validasi gagal", errors: { field: ["pesan error"] } }`.
 - **Rate Limiting:** Global 100 req/15menit per IP. Endpoint kritis: auth 10/15m, seat lock 20/5m, payment create 10/5m, seat generate 10/1jam, scanner check-in 30/1menit.
 - **Validasi Environment:** Startup check 5 env wajib (`JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `MIDTRANS_SERVER_KEY`) — warning non-blocking.
 - **Midtrans Payment Gateway:**
   - `MIDTRANS_SERVER_KEY` **harus** diisi dengan Server Key valid dari dashboard Midtrans Sandbox/Production.
   - `MIDTRANS_SIGNATURE_KEY` (opsional) — fallback key khusus untuk verifikasi signature webhook; jika tidak diisi, fallback ke `MIDTRANS_SERVER_KEY`.
   - Webhook endpoint `/api/payments/notification` **harus bisa diakses dari internet** (production) atau gunakan tunneling (ngrok/localtunnel) untuk development.
   - Signature webhook diverifikasi dengan `SHA512(order_id + status_code + gross_amount + server_key)` — dicocokkan dengan `signature_key` dari Midtrans; fallback HMAC-SHA512 juga didukung.
   - Webhook bersifat **idempotent** — pengiriman ulang `settlement` tidak menghasilkan tiket duplikat.
   - Pastikan `MIDTRANS_SERVER_KEY` di `.env` **sama persis** dengan Server Key di dashboard Midtrans,否则 webhook signature akan gagal (403).

---

## 📄 Lisensi

Proyek ini dibuat untuk keperluan pembelajaran/UKK.





