# Panduan Testing Orders / Checkout

Base URL: `http://localhost:5000`

## Prasyarat
- Server jalan: `npm start`
- Admin token (`<TOKEN_ADMIN>`) dan Customer token (`<TOKEN_CUSTOMER>`)
- Event, ticket category, dan seats sudah dibuat (lihat TESTING_GUIDE.md 2.x & 3.x)
- Customer sudah lock kursi (contoh seat_ids [1,2,3])

## 1. Buat Order
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>" \
  -H "Content-Type: application/json" \
  -d '{"seat_ids":[1,2,3]}'
```
Expected: 201, data.order (status pending, batas_waktu_bayar +15 menit) dan items. Kursi tetap locked, kuota berkurang.

## 2. List Orders
Customer (milik sendiri):
```bash
curl -X GET http://localhost:5000/api/orders \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```
Admin (semua):
```bash
curl -X GET http://localhost:5000/api/orders \
  -H "Authorization: Bearer <TOKEN_ADMIN>"
```

## 3. Detail Order
```bash
curl -X GET http://localhost:5000/api/orders/1 \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```
Response: order + items (dengan seats nomor & status).

## 4. Cancel Order
```bash
curl -X POST http://localhost:5000/api/orders/1/cancel \
  -H "Authorization: Bearer <TOKEN_CUSTOMER>"
```
Expected: status cancelled, kuota & kursi pulih (trigger DB), kursi available.

## 5. Verifikasi
- Create: kuota_tersedia berkurang, kursi locked.
- Cancel: kuota_tersedia kembali, kursi available.

## 6. Error Scenarios
- seat_ids kosong -> 400
- kursi tidak locked / bukan milik user -> 409
- kursi tidak ditemukan -> 409
- order tidak ditemukan -> 404
- akses order orang lain -> 403
- cancel non-pending -> 409
- Scanner -> 403
EOF