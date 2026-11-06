# Panduan Pengujian API Tiket Konser

Panduan end-to-end untuk menguji seluruh endpoint REST API di folder `API/`.

## Prasyarat
- Node.js v18+
- Supabase DB terinisialisasi (`config/schema.sql`) + migrasi `001_*`, `002_*`.
- File `.env` terisi (lihat `.env.example`).
- `GOOGLE_MAPS_API_KEY` opsional (endpoint Google Places → 503 tanpa key).

## Setup & Menjalankan
```bash
cd API
npm install
npm run dev            # http://localhost:5000
```
Health check: `GET http://localhost:5000/` → `{ success: true }`.

## Variabel Uji
- `BASE=http://localhost:5000`
- `TOKEN_ADMIN`, `TOKEN_CUSTOMER`, `TOKEN_SUPERADMIN`, `TOKEN_SCANNER`
- `EVENT_ID`, `VENUE_ID`, `VENUE_TYPE_ID`, `CATEGORY_ID`

## Alur Pengujian

### 1. Auth (publik)
1. `POST /api/auth/register` body `{username,email,password,role}`.
2. `POST /api/auth/login` → simpan token.
3. `GET /api/auth/me` dengan `Authorization: Bearer <token>`.

### 2. Users (Admin/SuperAdmin)
`GET /api/users`, `GET /api/users/:id`, `PUT /api/users/:id`, `DELETE /api/users/:id` (SuperAdmin).

### 3. Venue Types (publik GET, admin write)
`GET /api/venue-types`, `POST /api/venue-types`, `DELETE /api/venue-types/:id` (409 jika masih dipakai).

### 4. Venues (publik GET, admin write)
`GET /api/venues?venue_type_id=&search=&kota=&page=&limit=`, `GET /api/venues/:id`, `POST`, `PUT`, `DELETE` (409 jika dipakai event).

### 5. Events (publik GET, admin write, multipart banner)
`GET /api/events`, `GET /api/events/:id`, `POST /api/events` (multipart), `PUT`, `DELETE`.

### 6. Ticket Categories (publik GET, admin write)
`GET /api/ticket-categories?event_id=`, `GET /:id`, `POST`, `PUT`, `DELETE`.

### 7. Seats (publik GET, admin generate, customer lock/unlock)
`GET /api/seats?kategori_id=`, `POST /api/seats/generate`, `POST /api/seats/lock`, `POST /api/seats/unlock`.

## Matriks Akses
| Endpoint | Customer | Admin | SuperAdmin | Scanner |
|---|---|---|---|---|
| GET events | 200 | 200 | 200 | 200 |
| POST events | 403 | 201 | 201 | 403 |
| DELETE users/:id | 403 | 403 | 200 | 403 |
| POST seats/lock | 200 | 200 | 200 | 403 |

## Catatan
- Migrasi berurutan: 001 lalu 002.
- Seat locking atomik: uji 2 request paralel lock kursi sama → salah satu gagal.
- Kolom `orders` memakai `cutsomer_id` (typo skema).
- Endpoint Google Places → 503 tanpa `GOOGLE_MAPS_API_KEY`.
PY