# 🎫 API Pemesanan Tiket Konser

Backend REST API untuk sistem **pemesanan tiket konser** — dibangun dengan **Node.js + Express** dan database **Supabase (PostgreSQL)**. API ini menangani autentikasi multi-role, manajemen event, kategori tiket, hingga alur pemesanan dan check-in tiket.

> Proyek ini merupakan bagian dari ekosistem 3 aplikasi: **API** (backend), **web-tiket-konser** (Next.js), dan **mobile-tiket-konser** (Expo/React Native).

---

## ✨ Fitur yang Sudah Berjalan

- **Autentikasi & Otorisasi** — Register, Login (JWT), dan profil user.
- **Multi-Role** — `SuperAdmin`, `Admin`, `Customer`, `Scanner` dengan kontrol akses per endpoint.
- **Manajemen Event** — CRUD event + upload banner ke Supabase Storage.
- **Kategori Tiket** — CRUD kategori tiket per event (harga, kuota) dengan tracking kuota otomatis.
- **Kursi & Seat Locking** — Generate kursi massal per kategori, lock kursi sementara (anti rebutan), dan unlock.
- **Keamanan** — Password di-hash dengan bcrypt, token JWT, validasi input.

### 🚧 Sedang Dikembangkan (Roadmap)
- Orders / Checkout (dengan batas waktu bayar 15 menit)
- Payments (integrasi & konfirmasi pembayaran)
- E-Ticket + QR Code
- Check-in / Scan tiket (role Scanner)

---

## 🧱 Teknologi

| Komponen | Teknologi |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | PostgreSQL (Supabase) |
| Akses DB | `@supabase/supabase-js` & `pg` (Pool) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Upload File | `multer` → Supabase Storage |
| Konfigurasi | `dotenv` |

---

## 🗄️ Struktur Database

### Tabel
| Tabel | Keterangan |
|---|---|
| `users` | Data pengguna & role |
| `events` | Data event/konser |
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

### 2. Setup Database
1. Buka proyek Supabase Anda → **SQL Editor**.
2. Jalankan isi file `config/schema.sql` untuk membuat seluruh tabel, enum, dan trigger.
3. Jika sudah pernah setup sebelumnya, jalankan migration terbaru:
   `config/migrations/001_add_order_item_seats.sql`

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
| POST | `/api/events` | Admin/SuperAdmin | Buat event (upload banner) |
| PUT | `/api/events/:id` | Admin/SuperAdmin | Update event |
| DELETE | `/api/events/:id` | Admin/SuperAdmin | Hapus event |

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
│   │   └── 001_add_order_item_seats.sql
│   ├── supabase.js                # Inisialisasi Supabase client
│   ├── db.js                      # PostgreSQL connection pool (pg)
│   └── jwt.js                     # Sumber tunggal konfigurasi JWT
├── controllers/                   # Logika request/response per resource
│   ├── authController.js
│   ├── userController.js
│   ├── eventsController.js
│   ├── ticketCategoriesController.js
│   └── seatsController.js
├── middleware/
│   ├── authMiddleware.js          # verifyToken & authorizeRoles
│   └── uploadMiddleware.js        # Konfigurasi multer (upload gambar)
├── models/                        # Akses data ke database (Supabase/pg)
│   ├── userModel.js
│   ├── events.js
│   ├── ticketCategories.js
│   └── seats.js
├── routes/                        # Definisi endpoint per resource
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── eventRoutes.js
│   ├── ticketCategoryRoutes.js
│   └── seatRoutes.js
├── utils/
│   └── storageService.js          # Upload/hapus file ke Supabase Storage
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

---

## ⚠️ Catatan Penting

- **`JWT_SECRET` wajib diset** di `.env`. Fallback default hanya untuk development — jangan dipakai di produksi.
- Jalankan **migration terbaru** agar tabel `order_item_seats` dan trigger terbaru tersedia.
- **Jangan commit file `.env`** ke repository (pastikan sudah masuk `.gitignore`).
- Kolom `orders` menggunakan nama `cutsomer_id` (sesuai skema Supabase yang ada) — perhatikan saat query.

---

## 📄 Lisensi

Proyek ini dibuat untuk keperluan pembelajaran/UKK.



