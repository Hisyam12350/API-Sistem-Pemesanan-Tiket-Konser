# 🧪 Panduan Testing API — Customer & Admin

Backend REST API Sistem Pemesanan Tiket Konser  
Base URL: `http://localhost:5000`

---

## DAFTAR ISI

1. [Persiapan Awal](#persiapan-awal)
2. [Flow Admin (Pembuat Event)](#flow-admin)
3. [Flow Customer (Pembeli Tiket)](#flow-customer)
4. [Tabel Ringkasan Endpoint](#tabel-ringkasan-endpoint)
5. [Scenario Error yang Harus Dicoba](#scenario-error-yang-harus-dicoba)

---

## 1. PERSIAPAN AWAL

Pastikan server API berjalan:

```bash
cd API
npm start
# atau development mode
npm run dev
```

Server akan berjalan di `http://localhost:5000`.

## 2. FLOW ADMIN (Pembuat Event)

Admin bertugas: membuat genre, venue, event, ticket category, dan generate kursi.

### 2.1 Login sebagai Admin

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mail.com","password":"rahasia123"}'
```

**Response:** Ambil `token` dari response, simpan sebagai `<TOKEN_ADMIN>`.

---

### 2.2 Buat Genre Musik (opsional)

Lihat genre yang tersedia:
```bash
curl -X GET http://localhost:5000/api/genres
```

Buat genre baru:
```bash
curl -X POST http://localhost:5000/api/genres \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"nama_genre":"Koplo","deskripsi":"Musik koplo Indonesia"}'
```

---

### 2.3 Buat Venue (Tempat)

```bash
curl -X POST http://localhost:5000/api/venues \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "venue_type_id": 1,
    "nama_venue": "Stadion Utama Gelora",
    "alamat": "Jl. Sudirman No. 1, Jakarta Pusat",
    "kota": "Jakarta",
    "kapasitas": 50000
  }'
```

**venue_type_id:** 1=Stadion, 2=Indoor, 3=Outdoor, 4=Lapangan

Upload foto venue (form-data):
```bash
curl -X POST http://localhost:5000/api/venues \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -F "venue_type_id=1" \
  -F "nama_venue=Stadion Utama" \
  -F "alamat=Jl. Sudirman No. 1" \
  -F "kota=Jakarta" \
  -F "kapasitas=50000" \
  -F "gambar=@/path/to/foto.jpg"
```

Ambil `id` venue dari response (contoh: `1`).

### 2.4 Buat Event

```bash
curl -X POST http://localhost:5000/api/events \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "nama_event": "Konser Rock 2026",
    "waktu_event": "2026-12-25T19:00:00+07:00",
    "venue_id": 1,
    "genre_id": 1,
    "deskripsi": "Konser rock tahunan terbesar",
    "detail_lokasi": "Tribun Barat"
  }'
```

Upload banner event (form-data):
```bash
curl -X POST http://localhost:5000/api/events \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -F "nama_event=Konser Rock 2026" \
  -F "waktu_event=2026-12-25T19:00:00+07:00" \
  -F "venue_id=1" \
  -F "genre_id=1" \
  -F "deskripsi=Konser rock tahunan" \
  -F "banner=@/path/to/poster.jpg"
```

Ambil `id` event dari response (contoh: `1`).

### 2.5 Buat Ticket Category

```bash
curl -X POST http://localhost:5000/api/ticket-categories \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": 1,
    "nama_kategori": "VIP",
    "harga": 500000,
    "kuota_total": 100
  }'
```

Buat kategori lain (Regular):
```bash
curl -X POST http://localhost:5000/api/ticket-categories \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": 1,
    "nama_kategori": "Regular",
    "harga": 200000,
    "kuota_total": 200
  }'
```

Ambil `id` kategori dari response (contoh VIP=`1`, Regular=`2`).

### 2.6 Generate Kursi (Seat) per Kategori

Untuk kategori VIP (id: 1):
```bash
curl -X POST http://localhost:5000/api/seats/generate \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "kategori_id": 1,
    "jumlah": 10,
    "prefix": "V",
    "start_number": 1
  }'
```

Untuk kategori Regular (id: 2):
```bash
curl -X POST http://localhost:5000/api/seats/generate \
  -H "Authorization: Bearer <TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "kategori_id": 2,
    "jumlah": 20,
    "prefix": "R",
    "start_number": 1
  }'
```

Hasil: Kursi V1–V10 dan R1–R20, semua status `available`.

---

### 2.7 Lihat Semua Event yang Dibuat Admin

```bash
curl -X GET http://localhost:5000/api/events \
  -H "Authorization: Bearer <TOKEN_ADMIN>"
```

## 3. FLOW CUSTOMER (Pembeli Tiket)

Customer bertugas: melihat event, memilih venue, melihat kursi, lock kursi, dan unlock.

### 3.1 Login sebagai Customer

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"shasa@gmail.com","password":"customer123"}'
```

Simpan token sebagai `<TOKEN_CUSTOMER>`.

---

### 3.2 Lihat Daftar Event

```bash
curl -X GET http://localhost:5000/api/events \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```

Pilih event yang ingin dipesan, catat `id`-nya (contoh: `1`).

---

### 3.3 Lihat Detail Event (termasuk venue & genre)

```bash
curl -X GET http://localhost:5000/api/events/1 \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```

Response akan include:
- `venues` → `{id, nama_venue, alamat, kota, ...}`
- `genres` → `{id, nama_genre}`

---

### 3.4 Lihat Kursi per Kategori

Pertama lihat ticket category untuk event ini:
```bash
curl -X GET http://localhost:5000/api/ticket-categories?event_id=1
```

Catat `id` kategori (contoh VIP=`1`, Regular=`2`).

Lihat kursi VIP:
```bash
curl -X GET "http://localhost:5000/api/seats?kategori_id=1" \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```

Response: Array kursi dengan nomor `V1`, `V2`, ..., `V10`, semua `status_kursi: "available"`.

---

### 3.5 Lock Kursi Sementara (saat akan checkout)

Customer memilih kursi V1, V2, V3:

```bash
curl -X POST http://localhost:5000/api/seats/lock \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{
    "seat_ids": [1, 2, 3],
    "minutes": 15
  }'
```

**Response sukses:**
```json
{
  "success": true,
  "message": "3 kursi berhasil dikunci sementara.",
  "data": {
    "locked_until": "2026-11-06T04:18:36.000Z",
    "seats": [...]
  }
}
```

Kursi sekarang berstatus `locked` selama 15 menit. Kursi tidak bisa dipesan orang lain selama locked.

---

### 3.6 Coba Lock Kursi yang Sudah Di-lock Orang Lain

Jika customer lain mencoba lock kursi yang sama:

```bash
curl -X POST http://localhost:5000/api/seats/lock \
  -H "Authorization: Bearer <TOKEN_CUSTOMER_LAIN>" \
  -H "Content-Type: application/json" \
  -d '{"seat_ids":[1,2,3],"minutes":15}'
```

**Expected Error:**
```json
{
  "success": false,
  "message": "Sebagian kursi tidak tersedia (sudah di-lock/dibooking). Tidak ada kursi yang dikunci.",
  "failed_seat_ids": [1, 2, 3]
}
```

---

### 3.7 Unlock Kursi (batal pesan)

```bash
curl -X POST http://localhost:5000/api/seats/unlock \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{
    "seat_ids": [1, 2, 3]
  }'
```

Kursi kembali ke status `available`.

## 4. TABEL RINGKASAN ENDPOINT

### Admin (`Authorization: Bearer <TOKEN_ADMIN>`)

| Method | Endpoint | Body (JSON) | Keterangan |
|--------|----------|-------------|------------|
| POST | `/api/auth/login` | `{email, password}` | Dapatkan token |
| POST | `/api/genres` | `{nama_genre, deskripsi}` | Buat genre |
| GET | `/api/genres` | - | Lihat semua genre |
| POST | `/api/venues` | `{venue_type_id, nama_venue, alamat, kota, kapasitas}` | Buat tempat |
| POST | `/api/events` | `{nama_event, waktu_event, venue_id, genre_id, ...}` | Buat event |
| POST | `/api/ticket-categories` | `{event_id, nama_kategori, harga, kuota_total}` | Buat kategori tiket |
| POST | `/api/seats/generate` | `{kategori_id, jumlah, prefix?, start_number?}` | Generate kursi |
| GET | `/api/seats?kategori_id=X` | - | Lihat kursi |
| PUT | `/api/events/:id` | `{...}` | Edit event |
| DELETE | `/api/venues/:id` | - | Hapus tempat |

### Customer (`Authorization: Bearer <TOKEN_CUSTOMER>`)

| Method | Endpoint | Body (JSON) | Keterangan |
|--------|----------|-------------|------------|
| POST | `/api/auth/login` | `{email, password}` | Dapatkan token |
| GET | `/api/events` | - | Lihat semua event |
| GET | `/api/events/:id` | - | Detail event + venue + genre |
| GET | `/api/seats?kategori_id=X` | - | Lihat kursi per kategori |
| POST | `/api/seats/lock` | `{seat_ids: [..], minutes?}` | Lock kursi sementara |
| POST | `/api/seats/unlock` | `{seat_ids: [..]}` | Buka lock kursi |

### Publik (tanpa token)

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/venue-types` | Daftar tipe tempat |
| GET | `/api/venues` | Daftar tempat |
| GET | `/api/venues/:id` | Detail tempat |
| GET | `/api/genres` | Daftar genre |

## 5. SCENARIO ERROR YANG HARUS DICOBA

| No | Scenario | Request | Expected |
|----|----------|---------|----------|
| 1 | Login salah password | `POST /api/auth/login` salah | `401` |
| 2 | Buat event tanpa token | `POST /api/events` tanpa header | `401` |
| 3 | Customer buat venue | `POST /api/venues` dengan token customer | `403` |
| 4 | Generate kursi duplikat | `POST /api/seats/generate` nomor sama | `409` |
| 5 | Lock kursi yang sudah locked | `POST /api/seats/lock` seat yang sama | `409` |
| 6 | Lock lebih dari 60 menit | `minutes: 120` | `400` (maks 60) |
| 7 | Unlock kursi yang `available` | `POST /api/seats/unlock` seat belum di-lock | `200` tapi `skipped` |
| 8 | Event dengan genre_id yang tidak ada | `POST /api/events` `genre_id: 999` | `404` |
| 9 | Venue tidak ada saat buat event | `POST /api/events` `venue_id: 999` | `404` |

---

## 6. CEK STATUS SERVER

Pastikan server nyala di terminal API:

```bash
npm start
```

Harus muncul:
```
API Tiket Konser UKK berjalan di http://localhost:5000
Akses dari emulator: http://10.0.2.2:5000
```

---

> **Catatan:** Semua endpoint yang memerlukan `Authorization` harus disertakan header `Authorization: Bearer <token>`. Token didapatkan dari `POST /api/auth/login` setelah register atau login berhasil.

## 7. FLOW PAYMENT GATEWAY (MIDTRANS SNAP)

> **Catatan:** Endpoint manual `/api/orders/:id/pay` telah **dihapus**. Semua pembayaran kini melalui Midtrans Snap gateway.

### 7.1 Prasyarat Midtrans Sandbox
1. Daftar akun di [Midtrans Sandbox](https://app.sandbox.midtrans.com/register)
2. Masuk ke **Settings → Access Keys**, salin **Server Key** (format: `SB-Mid-server-...`)
3. Tambahkan ke `API/.env`:
   ```env
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
   MIDTRANS_CLIENT_KEY=Mid-client-xxx
   MIDTRANS_IS_PRODUCTION=false
   ```
4. Jalankan migration `config/migrations/004_payments_midtrans.sql` di Supabase SQL Editor
5. Restart server: `npm start`

### 7.2 Buat Order (sebelumnya 7.1)
Pastikan customer sudah lock kursi (lihat 3.5), lalu:
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{"seat_ids":[1,2,3]}'
```

### 7.3 List & Detail Order (sebelumnya 7.2)
```bash
curl -X GET http://localhost:5000/api/orders -H "Authorization: Bearer <TOKEN_CUSTOMER>"
curl -X GET http://localhost:5000/api/orders/1 -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```

### 7.4 Batalkan Order Pending (sebelumnya 7.3)
```bash
curl -X POST http://localhost:5000/api/orders/1/cancel -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```

### 7.5 Buat Transaksi Pembayaran (Midtrans Snap)
Gunakan `order_id` dari step 7.2:
```bash
curl -X POST http://localhost:5000/api/payments/1/create \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response sukses:**
```json
{
  "success": true,
  "message": "Transaksi pembayaran berhasil dibuat.",
  "data": {
    "snap_token": "a1b2c3d4-...",
    "redirect_url": "https://app.sandbox.midtrans.com/snap/v4/redirection/...",
    "order_id": "1",
    "payment_id": "5",
    "midtrans_order_id": "ORDER-1-1794225572546"
  }
}
```

Gunakan `snap_token` untuk frontend (Snap.js) atau buka `redirect_url` di browser untuk proses pembayaran di sandbox Midtrans.

### 7.6 Cek Status Pembayaran & Tiket
```bash
curl -X GET http://localhost:5000/api/payments/1 \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```

Response berisi order, items, payments[], dan tickets[] (jika sudah paid).

### 7.7 Webhook Notifikasi (Midtrans → Server)
- Endpoint: `POST /api/payments/notification` (publik, tanpa token)
- Midtrans akan mengirim notifikasi otomatis saat status pembayaran berubah
- **Wajib:** Server harus bisa diakses dari internet (production) atau gunakan tunneling (ngrok/localtunnel) saat development
- Verifikasi signature: `SHA512(order_id + status_code + gross_amount + server_key)` dicocokkan dengan `signature_key` dari Midtrans; fallback ke `MIDTRANS_SIGNATURE_KEY` jika diset; fallback HMAC-SHA512 juga didukung
- Jika signature lokal gagal, server **otomatis memverifikasi ke Midtrans API** (`GET /v2/{order_id}/status`) sebagai fallback

**Status Midtrans → Internal:**
| Midtrans | Internal | Aksi Server |
|---|---|---|
| `capture` / `settlement` | `success` | Order → `paid`, kursi → `booked`, generate tiket |
| `pending` | `pending` | Tunggu konfirmasi |
| `deny` | `failed` | Order → `cancelled` (jika masih pending), kuota & kursi pulih |
| `expire` | `expired` | Order → `expired`, kuota & kursi pulih |
| `cancel` / `refund` / `partial_refund` | `failed` | Order → `cancelled` (jika masih pending) |

**Idempotent:** Webhook `settlement` yang dikirim ulang **tidak** menghasilkan tiket duplikat (server cek existing tickets dulu).

### 7.8 Test Webhook Manual (Debug)
Jika webhook gagal/tertunda, kirim ulang manual:
```bash
curl -X POST http://localhost:5000/api/payments/notification \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ORDER-1-1794225572546",
    "status_code": "200",
    "gross_amount": "500000.00",
    "signature_key": "<HITUNG_SHA512>",
    "transaction_status": "settlement"
  }'
```
Hitung `signature_key` (gunakan gross_amount sesuai yang dikirim Midtrans, mis. `500000.00`):
```js
const crypto = require('crypto');
const sig = crypto.createHash('sha512')
  .update('ORDER-1-1794225572546' + '200' + '500000.00' + 'SB-Mid-server-xxx')
  .digest('hex');
```

### 7.9 Verifikasi Idempotency Webhook
1. Kirim webhook `settlement` pertama → order `paid`, tiket ter-generate
2. Kirim webhook `settlement` **sama** sekali lagi → response `Sudah diproses`, tiket **tidak** bertambah
3. Cek `GET /api/payments/:orderId` → `tickets.length` tetap sama

### 7.10 Error Scenarios Payment
| No | Scenario | Request | Expected |
|----|----------|---------|----------|
| 1 | Order tidak ditemukan | `POST /api/payments/999/create` | `404` |
| 2 | Order bukan milik user | `POST /api/payments/1/create` (user lain) | `403` |
| 3 | Order bukan `pending` | `POST /api/payments/1/create` (sudah paid) | `409` |
| 4 | Order kadaluwarsa | `POST /api/payments/1/create` (batas_waktu_bayar lewat) | `409` |
| 5 | Webhook signature invalid | `POST /api/payments/notification` signature salah | `403` |
| 6 | Webhook payment not found | `POST /api/payments/notification` order_id tidak ada | `404` |
| 7 | Webhook amount mismatch | `POST /api/payments/notification` gross_amount beda | `400` |
| 8 | Webhook tanpa server key | `POST /api/payments/notification` server key kosong | `403` |
| 9 | Manual pay route dihapus | `POST /api/orders/1/pay` | `404` |
| 10 | Scanner akses payment | `POST /api/payments/1/create` token scanner | `403` |
| 11 | Customer belom login | `POST /api/payments/1/create` tanpa token | `401` |
| 12 | Midtrans status `deny` | webhook `deny` → order `cancelled` | `200` + order cancelled |
| 13 | Midtrans status `expire` | webhook `expire` → order `expired` | `200` + order expired |

---

## 8. MIDTRANS SANDBOX SETUP (Step-by-step)

1. **Daftar & Login**: https://app.sandbox.midtrans.com/register
2. **Dapatkan Keys**: Settings → Access Keys → salin **Server Key** & **Client Key**
3. **Set .env**:
   ```env
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
   MIDTRANS_CLIENT_KEY=Mid-client-xxx
   MIDTRANS_SIGNATURE_KEY=SB-Mid-server-xxx
   MIDTRANS_IS_PRODUCTION=false
   ```
4. **Jalankan Migration**: `config/migrations/004_payments_midtrans.sql` di Supabase SQL Editor
5. **Restart Server**: `npm start`
6. **Test Create Transaction**: 
   - Login customer → buat order → `POST /api/payments/:orderId/create`
   - Buka `redirect_url` di browser → pilih metode bayar (VA, QRIS, GoPay, dll.)
   - Selesaikan pembayaran di sandbox Midtrans
7. **Verifikasi Webhook**: 
   - Server log seharusnya menampilkan `[MIDTRANS_WEBHOOK] mapped status: settlement`
   - Cek `GET /api/payments/:orderId` → status `paid`, tiket muncul

### Development Tunneling (untuk webhook lokal)
Gunakan ngrok/localtunnel agar Midtrans bisa kirim webhook ke localhost:
```bash
npx ngrok http 5000
# Atau
npx localtunnel --port 5000
```
Update URL notifikasi di Midtrans Dashboard → Settings → Notifications → URL: `https://xxx.ngrok-free.app/api/payments/notification`

---

## 9. TABEL RINGKASAN ENDPOINT (TERBARU)

### Payment Gateway
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/payments/:orderId/create` | Customer/Admin/SuperAdmin | Buat transaksi Snap |
| GET | `/api/payments/:orderId` | Customer/Admin/SuperAdmin | Status pembayaran + tiket |
| POST | `/api/payments/notification` | Publik | Webhook Midtrans |

---

## 10. CEK STATUS SERVER

(Sama seperti sebelumnya)

---
