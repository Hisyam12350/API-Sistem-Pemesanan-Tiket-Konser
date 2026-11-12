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
**Hasil yang diharapkan**: 4 test suites lulus (16 tests passed).

### 1.3 Pastikan Migrasi Database Dijalankan
Di **Supabase SQL Editor**, pastikan file migrasi telah dieksekusi berurutan:
- `config/migrations/001_add_order_item_seats.sql`
- `config/migrations/002_venues_google_places.sql`
- `config/migrations/003_add_locked_by_to_seats.sql`
- `config/migrations/004_payments_midtrans.sql`
- `config/migrations/005_scanner_indexes.sql`
- `config/migrations/006_pg_cron_jobs.sql`

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

### 5.2 Check-in Tiket (Scan QR)
Kirimkan `kode_unik` hasil pembacaan QR Code (misal: `TKT-1-1-ABC123`):
```bash
curl -X POST http://localhost:5000/api/scanner/check-in \
  -H "Authorization: Bearer <TOKEN_SCANNER>" \
  -H "Content-Type: application/json" \
  -d '{
    "kode_unik": "TKT-1-1-ABC123"
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

### 5.3 Coba Scan Tiket yang Sudah Pernah Di-scan (Double Entry Prevention)
Kirim request yang sama sekali lagi:
```bash
curl -X POST http://localhost:5000/api/scanner/check-in \
  -H "Authorization: Bearer <TOKEN_SCANNER>" \
  -H "Content-Type: application/json" \
  -d '{"kode_unik":"TKT-1-1-ABC123"}'
```
**Expected Error (409 Conflict)**:
```json
{
  "success": false,
  "message": "Tiket sudah dipindai."
}
```

---

### 5.4 Riwayat Tiket yang Dipindai Petugas Ini
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

---

## 7. Testing Validasi Input & Rate Limiter

### 7.1 Validasi Input (Zod)
Coba kirimkan format data yang salah:
```bash
# Password kurang dari 6 karakter
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
    "password": ["Password minimal 6 karakter"]
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
| **Eskalasi Role Ditolak** | `POST /api/auth/register` dengan `role: "SuperAdmin"` | `403 Forbidden` (*Role Admin/SuperAdmin tidak dapat didaftarkan melalui registrasi publik*) |
| **Akses Tiket Orang Lain** | `GET /api/tickets/:id` milik user lain | `403 Forbidden` (*Akses ditolak. Anda bukan pemilik tiket ini.*) |
| **Rebutan Kursi (Seat Conflict)** | Dua user melakukan lock pada kursi ID yang sama | User ke-2 mendapat `409 Conflict` (*Sebagian kursi tidak tersedia*) |
| **Checkout Kursi Kadaluwarsa** | Buat order setelah masa lock 15 menit habis | `409 Conflict` (*Lock kursi telah kadaluwarsa*) |
| **Tiket Palsu** | `POST /api/scanner/check-in` dengan `kode_unik: "INVALID"` | `404 Not Found` (*Tiket tidak ditemukan*) |
| **Customer Mengakses Scanner** | `POST /api/scanner/check-in` pakai token Customer | `403 Forbidden` (*Akses dilarang. Membutuhkan hak akses: Scanner, Admin, SuperAdmin*) |

---

## 9. Tabel Ringkasan Endpoint

| Endpoint | Method | Role Akses | Keterangan |
|---|---|---|---|
| `/api/auth/register` | POST | Publik | Registrasi akun baru (Customer) |
| `/api/auth/login` | POST | Publik | Login & dapatkan token JWT |
| `/api/auth/me` | GET | Authenticated | Profil user saat ini |
| `/api/users` | GET | Admin, SuperAdmin | List semua user |
| `/api/venues` | GET, POST | Publik (GET), Admin (POST) | Katalog & tambah tempat konser |
| `/api/events` | GET, POST | Publik (GET), Admin (POST) | Katalog & buat event konser |
| `/api/ticket-categories` | GET, POST | Publik (GET), Admin (POST) | Kategori tiket per event |
| `/api/seats?kategori_id=` | GET | Publik | List kursi & status |
| `/api/seats/generate` | POST | Admin, SuperAdmin | Generate nomor kursi |
| `/api/seats/lock` | POST | Customer, Admin | Kunci kursi sementara |
| `/api/seats/unlock` | POST | Customer, Admin | Bebaskan kunci kursi |
| `/api/orders` | POST, GET | Customer, Admin | Checkout & riwayat pesanan |
| `/api/orders/:id/cancel` | POST | Customer, Admin | Batalkan pesanan pending |
| `/api/payments/:orderId/create` | POST | Customer, Admin | Buat Snap Token Midtrans |
| `/api/payments/:orderId` | GET | Customer, Admin | Status & sinkronisasi pembayaran |
| `/api/payments/notification` | POST | Publik | Webhook notifikasi Midtrans |
| `/api/tickets` | GET | Customer, Admin | List e-ticket resmi milik user |
| `/api/tickets/:id` | GET | Customer, Admin | Detail tiket + embed SVG QR Code |
| `/api/tickets/:id/download` | GET | Customer, Admin | Download QR Code file PNG |
| `/api/scanner/check-in` | POST | Scanner, Admin | Scan & validasi QR Code tiket |
| `/api/scanner/scanned-tickets` | GET | Scanner, Admin | Riwayat tiket dipindai scanner |
