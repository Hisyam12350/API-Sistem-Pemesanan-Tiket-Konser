# 🧪 Panduan Lengkap Testing API — Konser UKK

Panduan pengujian langkah-demi-langkah untuk seluruh alur backend REST API (Customer, Admin, dan Scanner).  
Base URL: `http://localhost:5000`

---

## 📋 DAFTAR ISI

1. [Persiapan Awal & Automated Testing](#1-persiapan-awal--automated-testing)
2. [Flow 1: Admin (Setup Event & Tiket)](#2-flow-1-admin-setup-event--tiket)
3. [Flow 2: Customer (Pemesanan & Pembayaran)](#3-flow-2-customer-pemesanan--pembayaran)
4. [Flow 3: E-Ticket & QR Code (Customer)](#4-flow-3-e-ticket--qr-code-customer)
5. [Flow 4: Scanner (Check-in Gate)](#5-flow-4-scanner-check-in-gate)
6. [Flow 5: Midtrans Sandbox & Webhook](#6-flow-5-midtrans-sandbox--webhook)
7. [Testing Validasi Input & Rate Limiter](#7-testing-validasi-input--rate-limiter)
8. [Skenario Error & Keamanan yang Wajib Dicoba](#8-skenario-error--keamanan-yang-wajib-dicoba)
9. [Tabel Ringkasan Endpoint](#9-tabel-ringkasan-endpoint)

---

## 1. Persiapan Awal & Automated Testing

### 1.1 Pastikan Environment & Server Berjalan
```bash
cd API
# Pastikan file .env sudah dikonfigurasi dengan benar
npm run dev
```
Server akan aktif di `http://localhost:5000`.

### 1.2 Menjalankan Automated Test Suite (Jest)
Sebelum melakukan pengujian manual, Anda dapat menjalankan seluruh suite pengujian otomatis untuk memverifikasi fungsionalitas core:
```bash
npm test
```
`npm test` menjalankan seluruh tes, termasuk tes integrasi yang memerlukan database development. Untuk tes keamanan saja tanpa koneksi database:
```bash
npm run test:unit
```

### 1.3 Pastikan Migrasi Database Dijalankan
Di **Supabase SQL Editor**, pastikan file migrasi telah dieksekusi berurutan:
- `config/migrations/001_add_order_item_seats.sql`
- `config/migrations/002_venues_google_places.sql`
- `config/migrations/003_add_locked_by_to_seats.sql`
- `config/migrations/004_payments_midtrans.sql`
- `config/migrations/005_scanner_indexes.sql`
- `config/migrations/006_pg_cron_jobs.sql`
- `config/migrations/007_security_hardening.sql`
- `config/migrations/008_business_rules_and_hardening.sql`
- `config/migrations/009_scanner_event_assignments.sql` (wajib untuk pembatasan event Scanner)

Pastikan pula di menu **Supabase Storage** sudah tersedia 2 bucket berstatus **Public**:
- `events` (untuk upload banner konser via `POST`/`PUT /api/events`)
- `venues` (untuk upload foto venue via `POST`/`PUT /api/venues`)

---

## 2. Flow 1: Admin (Setup Event & Tiket)

Admin bertugas: membuat genre, venue tempat konser, event, kategori tiket, dan mengenerate kursi.

### 2.1 Login sebagai Admin
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mail.com","password":"rahasia123"}'
```
> Simpan nilai `token` dari response sebagai `<TOKEN_ADMIN>`.

---

### 2.2 Buat Genre Musik (Opsional)
```bash
curl -X POST http://localhost:5000/api/genres \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"nama_genre":"Indie Pop","deskripsi":"Musik indie pop lokal"}'
```

---

### 2.3 Buat Tempat Konser (Venue)
```bash
curl -X POST http://localhost:5000/api/venues \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "venue_type_id": 1,
    "nama_venue": "Stadion Utama Senayan",
    "alamat": "Jl. Pintu Satu Senayan, Gelora",
    "kota": "Jakarta Pusat",
    "kapasitas": 50000
  }'
```
> Ambil `id` venue dari response (misal: `1`).

*(Opsi upload gambar venue via Multipart Form)*:
```bash
curl -X POST http://localhost:5000/api/venues \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -F "venue_type_id=1" \
  -F "nama_venue=Stadion Utama" \
  -F "alamat=Jl. Pintu Satu Senayan" \
  -F "kota=Jakarta Pusat" \
  -F "kapasitas=50000" \
  -F "gambar=@/path/to/foto.jpg"
```

---

### 2.4 Buat Event Konser
```bash
curl -X POST http://localhost:5000/api/events \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "nama_event": "Konser Akbar 2026",
    "waktu_event": "2026-12-15T19:00:00.000Z",
    "venue_id": 1,
    "genre_id": 1,
    "deskripsi": "Konser musik akhir tahun terbesar."
  }'
```
> Ambil `id` event dari response (misal: `1`).

---

### 2.5 Buat Kategori Tiket
```bash
curl -X POST http://localhost:5000/api/ticket-categories \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": 1,
    "nama_kategori": "VIP",
    "harga": 750000,
    "kuota_total": 50
  }'
```
> Ambil `id` kategori tiket dari response (misal: `1`).

---

### 2.6 Generate Kursi Massal
Generate kursi VIP nomor V1 sampai V20:
```bash
curl -X POST http://localhost:5000/api/seats/generate \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "kategori_id": 1,
    "jumlah": 20,
    "prefix": "V",
    "start_number": 1
  }'
```
**Response sukses (201)**:
```json
{
  "success": true,
  "message": "20 kursi berhasil dibuat",
  "data": [
    { "id": 1, "kategori_id": 1, "nomor_kursi": "V1", "status_kursi": "available" },
    { "id": 2, "kategori_id": 1, "nomor_kursi": "V2", "status_kursi": "available" }
  ]
}
```

---

## 3. Flow 2: Customer (Pemesanan & Pembayaran)

Customer bertugas: register akun baru, melihat event & kursi, mengunci kursi (seat lock), membuat order, dan menyelesaikan pembayaran via Midtrans.

### 3.1 Register Akun Customer
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "budi_santoso",
    "email": "budi@mail.com",
    "password": "password123"
  }'
```
> Akun otomatis dibuat dengan role `Customer`.

### 3.2 Login Customer
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"budi@mail.com","password":"password123"}'
```
> Simpan nilai `token` sebagai `<TOKEN_CUSTOMER>`.

---

### 3.3 Lihat Kursi yang Tersedia
```bash
curl -X GET "http://localhost:5000/api/seats?kategori_id=1" \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```
Pilih ID kursi yang ingin dipesan (contoh: ID `1` dan `2`).

---

### 3.4 Kunci Kursi Sementara (Seat Locking)
Kunci kursi selama 15 menit agar tidak bisa direbut pembeli lain saat mengisi data:
```bash
curl -X POST http://localhost:5000/api/seats/lock \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{
    "seat_ids": [1, 2],
    "minutes": 15
  }'
```
**Response sukses (200)**:
```json
{
  "success": true,
  "message": "2 kursi berhasil dikunci sementara.",
  "data": {
    "locked_until": "2026-11-12T12:30:00.000Z",
    "seats": [...]
  }
}
```

---

### 3.5 Buat Pesanan (Checkout Order)
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{
    "seat_ids": [1, 2]
  }'
```
**Response sukses (201)**:
```json
{
  "success": true,
  "message": "Order berhasil dibuat.",
  "data": {
    "order": {
      "id": "1",
      "cutsomer_id": "2",
      "total_pembayaran": "1500000",
      "status_order": "pending",
      "batas_waktu_bayar": "2026-11-12T12:30:00.000Z"
    },
    "items": [...]
  }
}
```
> Catat `order.id` (misal: `1`).

---

### 3.6 Buat Transaksi Pembayaran (Midtrans Snap)
```bash
curl -X POST http://localhost:5000/api/payments/1/create \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{}'
```
**Response sukses (201)**:
```json
{
  "success": true,
  "message": "Transaksi pembayaran berhasil dibuat.",
  "data": {
    "snap_token": "xxxx-xxxx-xxxx",
    "redirect_url": "https://app.sandbox.midtrans.com/snap/v4/redirection/xxxx",
    "order_id": "1",
    "payment_id": 1,
    "midtrans_order_id": "ORDER-1-1794459999999"
  }
}
```
Buka tautan `redirect_url` di browser untuk melakukan simulasi pembayaran di sandbox Midtrans (pilih Virtual Account / QRIS / GoPay).

---

### 3.7 Cek Status Pembayaran
```bash
curl -X GET http://localhost:5000/api/payments/1 \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```
Endpoint ini otomatis melakukan sinkronisasi dengan status Midtrans. Jika pembayaran berhasil, response akan menunjukkan `status_order: "paid"` dan memuat data `tickets` yang baru saja di-generate.

---

## 4. Flow 3: E-Ticket & QR Code (Customer)

Setelah pembayaran sukses, tiket elektronik langsung dapat diakses oleh pemiliknya.

### 4.1 Lihat Semua Tiket Milik Saya
```bash
curl -X GET http://localhost:5000/api/tickets \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```
**Response**: Daftar tiket resmi milik akun ini lengkap dengan `kode_unik`, nomor kursi, dan nama event.

---

### 4.2 Lihat Detail Tiket & Embed QR Code (SVG)
```bash
curl -X GET http://localhost:5000/api/tickets/1 \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```
**Response sukses (200)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "order_id": 1,
    "kode_unik": "TKT-1-1-ABC123",
    "status_tiket": "active",
    "nomor_kursi": "V1",
    "nama_event": "Konser Akbar 2026",
    "qr_code_svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" ...</svg>"
  }
}
```
> Field `qr_code_svg` dapat langsung di-render di frontend Web / Mobile sebagai elemen gambar vektor tajam.

---

### 4.3 Download Gambar QR Code (PNG)
```bash
curl -X GET http://localhost:5000/api/tickets/1/download \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  --output ticket-qr.png
```
File gambar `ticket-qr.png` akan terunduh dan dapat dibuka langsung di image viewer browser/komputer.

---

## 5. Flow 4: Scanner (Check-in Gate)

Petugas scanner di gate pintu masuk memindai QR code tiket pengunjung.

### 5.1 Login sebagai Petugas Scanner
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"scanner@mail.com","password":"scanner123"}'
```
> Simpan token sebagai `<TOKEN_SCANNER>`.

---

### 5.2 Tugaskan Scanner ke Event (Admin)
Scanner harus ditugaskan ke event sebelum dapat check-in atau melihat rekap event. Ambil `scanner_id` melalui `GET /api/users`, lalu tugaskan:
```bash
curl -X POST http://localhost:5000/api/scanner/events/1/assignments \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"scanner_id":7}'
```
Daftar petugas yang ditugaskan dapat dilihat dengan `GET /api/scanner/events/1/assignments`. Scanner dapat mengambil daftar event miliknya melalui:
```bash
curl -X GET http://localhost:5000/api/scanner/assigned-events \
  -H "Authorization: Bearer <TOKEN_SCANNER>"
```

---

### 5.3 Check-in Tiket (Scan QR)
Kirimkan `kode_unik` hasil pembacaan QR Code (misal: `TKT-1-1-ABC123`):
```bash
curl -X POST http://localhost:5000/api/scanner/check-in \
  -H "Authorization: Bearer <TOKEN_SCANNER>" \
  -H "Content-Type: application/json" \
  -d '{
    "kode_unik": "TKT-1-1-ABC123",
    "event_id": 1
  }'
```
**Response sukses (200)**:
```json
{
  "success": true,
  "message": "Check-in berhasil.",
  "ticket": {
    "id": 1,
    "kode_unik": "TKT-1-1-ABC123",
    "status_tiket": "scanned",
    "scanned_at": "2026-11-12T12:45:00.000Z",
    "seat": { "nomor_kursi": "V1" },
    "category": { "nama_kategori": "VIP" }
  },
  "event": {
    "nama_event": "Konser Akbar 2026"
  }
}
```

---

### 5.4 Coba Scan Tiket yang Sudah Pernah Di-scan (Double Entry Prevention)
Kirim request yang sama sekali lagi:
```bash
curl -X POST http://localhost:5000/api/scanner/check-in \
  -H "Authorization: Bearer <TOKEN_SCANNER>" \
  -H "Content-Type: application/json" \
  -d '{"kode_unik":"TKT-1-1-ABC123","event_id":1}'
```
**Expected Error (409 Conflict)**:
```json
{
  "success": false,
  "message": "Tiket sudah dipindai."
}
```

---

### 5.5 Riwayat Tiket yang Dipindai Petugas Ini
```bash
curl -X GET "http://localhost:5000/api/scanner/scanned-tickets?page=1&limit=20" \
  -H "Authorization: Bearer <TOKEN_SCANNER>"
```

---

## 6. Flow 5: Midtrans Sandbox & Webhook

### 6.1 Simulasi Webhook Notifikasi
Jika Anda ingin menyimulasikan webhook Midtrans secara lokal:
```bash
curl -X POST http://localhost:5000/api/payments/notification \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "<midtrans_order_id>",
    "status_code": "200",
    "gross_amount": "1500000.00",
    "signature_key": "<sha512_signature>",
    "transaction_status": "settlement"
  }'
```
> **Catatan Penting Keamanan Webhook**:
> 1. Nilai `<sha512_signature>` dihitung dengan rumus `SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)`. Anda dapat membuatnya via terminal:
>    ```bash
>    node -e "console.log(require('crypto').createHash('sha512').update('<midtrans_order_id>' + '200' + '1500000.00' + process.env.MIDTRANS_SERVER_KEY).digest('hex'))"
>    ```
> 2. Karena backend memverifikasi ulang status transaksi langsung ke **API Midtrans** (*source of truth*), `<midtrans_order_id>` yang diuji harus benar-benar sudah dibuat melalui `POST /api/payments/:orderId/create` di Midtrans Sandbox.

---

## 7. Testing Validasi Input & Rate Limiter

### 7.1 Validasi Input (Zod)
Coba kirimkan format data yang salah:
```bash
# Password kurang dari 8 karakter
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@mail.com","password":"123"}'
```
**Expected 400 Bad Request**:
```json
{
  "success": false,
  "message": "Validasi gagal",
  "errors": {
    "password": ["Password minimal 8 karakter"]
  }
}
```

### 7.2 Uji Rate Limiter Auth (Max 10 Req / 15 Menit)
Jalankan request login berulang-ulang lebih dari 10 kali dalam 15 menit. Request ke-11 akan menerima **429 Too Many Requests**:
```json
{
  "success": false,
  "message": "Terlalu banyak percobaan login/registrasi"
}
```

---

## 8. Skenario Error & Keamanan yang Wajib Dicoba

| Skenario | Endpoint & Body | Hasil yang Diharapkan |
|---|---|---|
| **Eskalasi Role via Register** | `POST /api/auth/register` dengan `role: "SuperAdmin"` (atau `"Admin"` / `"Scanner"`) | `201`, tetapi akun yang terbentuk **selalu `Customer`** (field `role` diabaikan) |
| **Eskalasi Role via Update User** | Login sebagai Customer, `PUT /api/users/<id-sendiri>` dengan `{"role":"SuperAdmin"}` | `403 Forbidden` (*Anda tidak diizinkan mengubah role.*) |
| **Ambil Alih Akun Orang Lain** | Login sebagai Customer, `PUT /api/users/<id-lain>` dengan `{"password":"x"}` | `403 Forbidden` (*Anda hanya boleh mengubah akun Anda sendiri.*) |
| **Webhook Palsu** | `POST /api/payments/notification` dengan `signature_key` asal-asalan | `403 Forbidden` (*Signature tidak valid.*), order tetap `pending` |
| **Scan Ganda** | Dua scanner memindai QR yang sama bersamaan | Satu `200`, sisanya `409` (*Tiket sudah dipindai.*) |
| **Akses Tiket Orang Lain** | `GET /api/tickets/:id` milik user lain | `403 Forbidden` (*Akses ditolak. Anda bukan pemilik tiket ini.*) |
| **Rebutan Kursi (Seat Conflict)** | Dua user melakukan lock pada kursi ID yang sama | User ke-2 mendapat `409 Conflict` (*Sebagian kursi tidak tersedia*) |
| **Checkout Kursi Kadaluwarsa** | Buat order setelah masa lock 15 menit habis | `409 Conflict` (*Lock kursi telah kadaluwarsa*) |
| **Scan di event salah / belum waktunya / order tidak lunas** | `POST /api/scanner/check-in` dengan `event_id` berbeda, jauh sebelum acara, atau order refund | `409 Conflict` |
| **Scanner tanpa assignment** | Scanner check-in atau melihat rekap event yang belum ditugaskan Admin | `403 Forbidden` |
| **Pengelolaan assignment Scanner** | Admin melihat, menugaskan, atau mencabut Scanner di event | `GET` / `POST` / `DELETE /api/scanner/events/:eventId/assignments` sesuai aksi |
| **Menimbun Kursi (hoarding)** | Lock lebih dari `MAX_SEATS_PER_ORDER` (default 6) kursi untuk satu event | `400`/`409` (*Maksimal 6 kursi ...*) |
| **Beli Setelah Event Lewat/Ditutup** | `POST /api/seats/lock` pada event berstatus `completed` atau waktunya sudah lewat | `409` (*Penjualan tiket untuk event ini sudah ditutup.*) |
| **Bayar Setelah Order Expired** | Bayar di Snap setelah batas waktu order | Transaksi Midtrans ikut kedaluwarsa (`expiry`). Bila uang tetap masuk, tampil di `GET /api/payments/needs-refund` |
| **Token Lama Setelah User Dihapus / Role Diturunkan** | Pakai token lama user tsb | `401` / `403` (role dibaca dari database, bukan dari token) |
| **Upload SVG / file palsu sebagai banner** | `POST /api/events` dengan file `.svg` atau HTML bernama `.png` | `400` (hanya JPG/PNG/WEBP dengan isi file valid) |
| **Hapus Event/Kategori yang Sudah Ada Order** | `DELETE /api/events/:id` | `409 Conflict` |
| **Tiket Palsu** | `POST /api/scanner/check-in` dengan `kode_unik: "INVALID"` | `404 Not Found` (*Tiket tidak ditemukan*) |
| **Customer Mengakses Scanner** | `POST /api/scanner/check-in` pakai token Customer | `403 Forbidden` (*Akses dilarang. Membutuhkan hak akses: Scanner, Admin, SuperAdmin*) |

---

## 9. Tabel Ringkasan Endpoint

| Endpoint | Method | Role Akses | Keterangan |
|---|---|---|---|
| `/api/auth/register` | POST | Publik | Registrasi akun baru (otomatis role `Customer`) |
| `/api/auth/login` | POST | Publik | Login & dapatkan token JWT |
| `/api/auth/me` | GET | Authenticated | Profil user yang sedang login |
| `/api/auth/change-password` | PUT | Authenticated | Ganti password sendiri (`old_password`, `new_password`) |
| `/api/users` | GET | Admin, SuperAdmin | Daftar semua pengguna |
| `/api/users/:id` | GET | Admin, SuperAdmin | Detail data pengguna |
| `/api/users/:id` | PUT | Customer, Admin, SuperAdmin | Update pengguna (Customer: akun sendiri; Admin: +Customer/Scanner; SuperAdmin: semua) |
| `/api/users/:id` | DELETE | SuperAdmin | Hapus akun pengguna |
| `/api/venue-types` | GET, POST | Publik (GET), Admin/SuperAdmin (POST) | Daftar & tambah master tipe tempat konser |
| `/api/venue-types/:id` | DELETE | Admin, SuperAdmin | Hapus tipe tempat konser |
| `/api/venues` | GET, POST | Publik (GET), Admin/SuperAdmin (POST) | Katalog & tambah tempat konser (+ upload `gambar`) |
| `/api/venues/:id` | GET, PUT, DELETE | Publik (GET), Admin/SuperAdmin (PUT/DELETE) | Detail, update, & hapus tempat konser |
| `/api/genres` | GET, POST | Publik (GET), Admin/SuperAdmin (POST) | Daftar & tambah genre musik |
| `/api/genres/:id` | GET, PUT, DELETE | Publik (GET), Admin/SuperAdmin (PUT/DELETE) | Detail, update, & hapus genre musik |
| `/api/events` | GET, POST | Publik (GET), Admin/SuperAdmin (POST) | Katalog & buat event konser (+ upload `banner`) |
| `/api/events/:id` | GET, PUT, DELETE | Publik (GET), Admin/SuperAdmin (PUT/DELETE) | Detail, update, & hapus event konser |
| `/api/ticket-categories` | GET, POST | Publik (GET), Admin/SuperAdmin (POST) | Daftar (`?event_id=`) & buat kategori tiket |
| `/api/ticket-categories/:id` | GET, PUT, DELETE | Publik (GET), Admin/SuperAdmin (PUT/DELETE) | Detail, update, & hapus kategori tiket |
| `/api/seats?kategori_id=` | GET | Publik | Daftar kursi per kategori & status (`available`/`locked`/`booked`) |
| `/api/seats/generate` | POST | Admin, SuperAdmin | Generate nomor kursi massal |
| `/api/seats/lock` | POST | Customer, Admin, SuperAdmin | Kunci kursi sementara secara atomik |
| `/api/seats/unlock` | POST | Customer, Admin, SuperAdmin | Bebaskan kunci kursi |
| `/api/orders` | POST, GET | Customer, Admin, SuperAdmin | Buat pesanan (checkout) & riwayat pesanan |
| `/api/orders/:id` | GET | Customer, Admin, SuperAdmin | Detail pesanan beserta rincian item & kursi |
| `/api/orders/:id/cancel` | POST | Customer, Admin, SuperAdmin | Batalkan pesanan pending |
| `/api/payments/:orderId/create` | POST | Customer, Admin, SuperAdmin | Buat transaksi Snap Token Midtrans |
| `/api/payments/:orderId` | GET | Customer, Admin, SuperAdmin | Status & sinkronisasi pembayaran dengan Midtrans |
| `/api/payments/notification` | POST | Publik | Webhook notifikasi pembayaran dari Midtrans |
| `/api/payments/needs-refund` | GET | Admin, SuperAdmin | Daftar pembayaran terlambat yang butuh refund manual |
| `/api/tickets` | GET | Customer, Admin, SuperAdmin | Daftar e-ticket resmi milik user |
| `/api/tickets/:id` | GET | Customer, Admin, SuperAdmin | Detail tiket + embed SVG QR Code |
| `/api/tickets/:id/download` | GET | Customer, Admin, SuperAdmin | Download QR Code tiket sebagai file PNG |
| `/api/scanner/check-in` | POST | Scanner, Admin, SuperAdmin | Scan & validasi QR Code tiket (`kode_unik` + `event_id`) |
| `/api/scanner/scanned-tickets` | GET | Scanner, Admin, SuperAdmin | Riwayat tiket yang dipindai oleh petugas ini |
| `/api/scanner/assigned-events` | GET | Scanner | Daftar event yang ditugaskan ke scanner |
| `/api/scanner/events/:eventId/scanned` | GET | Scanner, Admin, SuperAdmin | Rekap seluruh tiket yang telah di-scan per event |
| `/api/scanner/events/:eventId/assignments` | GET, POST | Admin, SuperAdmin | Lihat atau tugaskan petugas scanner ke event |
| `/api/scanner/events/:eventId/assignments/:scannerId` | DELETE | Admin, SuperAdmin | Cabut penugasan petugas scanner dari event |
