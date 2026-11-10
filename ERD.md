# 🗄️ ERD — Sistem Pemesanan Tiket Konser

Dokumen ini berisi **Enhanced ERD (Entity Relationship Diagram)** lengkap untuk database sistem pemesanan tiket konser. Semua tabel, kolom, tipe data, enum, dan constraint ditampilkan secara detail.

Diagram di bawah ini menggunakan sintaks **Mermaid** dan dapat dirender di VS Code, GitHub, GitLab, atau [Mermaid Live Editor](https://mermaid.live).

---

## Enhanced ERD (Semua Tabel & Relasi)

```mermaid
erDiagram
    users ||--o{ orders : "memesan (cutsomer_id)"
    users ||--o{ tickets : "discan oleh (scanned_by)"
    users ||--o{ seats : "mengunci (locked_by)"

    venue_types ||--o{ venues : "mengkategorikan"
    venues ||--o{ events : "menjadi lokasi"
    genres ||--o{ events : "mengklasifikasikan"

    events ||--o{ ticket_categories : "memiliki"
    ticket_categories ||--o{ seats : "memiliki kursi"
    ticket_categories ||--o{ order_items : "digunakan pada"
    ticket_categories ||--o{ tickets : "kategori tiket"

    orders ||--o{ order_items : "berisi"
    orders ||--o{ payments : "dibayar via"
    orders ||--o{ tickets : "menghasilkan"

    order_items ||--o{ order_item_seats : "memilih kursi"
    seats ||--o{ order_item_seats : "dipilih pada order_item"
    seats ||--o{ tickets : "kursi pada tiket"

    users {
        bigint id PK
        text username UK
        varchar email UK
        varchar password
        Role role
        timestamptz created_at
    }

    venue_types {
        bigint id PK
        text nama_tipe UK
        text deskripsi
        text ikon
        timestamptz created_at
    }

    venues {
        bigint id PK
        bigint venue_type_id FK
        text nama_venue
        text alamat
        text kota
        int kapasitas
        text gambar_url
        timestamptz created_at
    }

    genres {
        bigint id PK
        text nama_genre UK
        text deskripsi
        timestamptz created_at
    }

    events {
        bigint id PK
        text nama_event
        text lokasi
        timestamptz waktu_event
        text banner_url
        event_status status
        bigint venue_id FK
        bigint genre_id FK
        text deskripsi
        text detail_lokasi
        timestamptz created_at
    }

    ticket_categories {
        bigint id PK
        bigint event_id FK
        text nama_kategori
        numeric harga
        int kuota_total
        int kuota_tersedia
        timestamptz created_at
    }

    seats {
        bigint id PK
        bigint kategori_id FK
        varchar nomor_kursi UK
        seat_status status_kursi
        timestamptz locked_until
        bigint locked_by FK
        timestamptz created_at
    }

    orders {
        bigint id PK
        bigint cutsomer_id FK
        numeric total_pembayaran
        order_status status_order
        timestamptz batas_waktu_bayar
        timestamptz created_at
    }

    order_items {
        bigint id PK
        bigint order_id FK
        bigint kategori_id FK
        int jumlah
        numeric harga_satuan
        timestamptz created_at
    }

    order_item_seats {
        bigint id PK
        bigint order_item_id FK
        bigint seat_id FK UK
        timestamptz created_at
    }

    payments {
        bigint id PK
        bigint order_id FK
        text transaction_id UK
        text payment_method
        numeric amount
        payment_status status
        text snap_token
        text redirect_url
        text midtrans_order_id
        timestamptz created_at
    }

    tickets {
        bigint id PK
        bigint order_id FK
        bigint kategori_id FK
        bigint seat_id FK
        text kode_unik UK
        ticket_status status_tiket
        timestamptz scanned_at
        bigint scanned_by FK
        timestamptz created_at
    }

    Role {
        SuperAdmin
        Admin
        Customer
        Scanner
    }

    event_status {
        upcoming
        ongoing
        completed
    }

    order_status {
        pending
        paid
        expired
        cancelled
    }

    payment_status {
        pending
        success
        expired
        failed
    }

    ticket_status {
        active
        scanned
        cancelled
    }

    seat_status {
        available
        locked
        booked
    }
```

---

## 📋 Detail Tabel & Constraint

| Tabel | Primary Key | Foreign Keys | Unique Constraints | Notable Columns |
|-------|-------------|--------------|-------------------|-----------------|
| `users` | `id` | — | `email` | `role` (enum: SuperAdmin/Admin/Customer/Scanner) |
| `venue_types` | `id` | — | `nama_tipe` | `ikon` (nama ikon untuk UI) |
| `venues` | `id` | `venue_type_id → venue_types.id` | — | `kapasitas`, `gambar_url` |
| `genres` | `id` | — | `nama_genre` | — |
| `events` | `id` | `venue_id → venues.id` (RESTRICT), `genre_id → genres.id` (SET NULL) | — | `banner_url`, `status` (enum) |
| `ticket_categories` | `id` | `event_id → events.id` (CASCADE) | — | `kuota_total`, `kuota_tersedia` |
| `seats` | `id` | `kategori_id → ticket_categories.id` (CASCADE), `locked_by → users.id` | `nomor_kursi` | `status_kursi` (enum), `locked_until` |
| `orders` | `id` | `cutsomer_id → users.id` (RESTRICT) *(typo sengaja)* | — | `status_order` (enum), `batas_waktu_bayar` |
| `order_items` | `id` | `order_id → orders.id` (CASCADE), `kategori_id → ticket_categories.id` (RESTRICT) | — | `jumlah`, `harga_satuan` |
| `order_item_seats` | `id` | `order_item_id → order_items.id` (CASCADE), `seat_id → seats.id` (RESTRICT) | `seat_id` (UNIQUE) | Junction table — satu kursi hanya bisa di satu order_item |
| `payments` | `id` | `order_id → orders.id` (CASCADE) | `transaction_id` | `snap_token`, `redirect_url`, `midtrans_order_id` |
| `tickets` | `id` | `order_id → orders.id` (CASCADE), `kategori_id → ticket_categories.id` (RESTRICT), `seat_id → seats.id` (SET NULL), `scanned_by → users.id` (SET NULL) | `kode_unik` | `status_tiket` (enum), `scanned_at` |

---

## 🔑 Tipe Data Enum (PostgreSQL)

| Enum | Nilai yang Diizinkan | Digunakan pada Tabel |
|------|---------------------|---------------------|
| `Role` | `SuperAdmin`, `Admin`, `Customer`, `Scanner` | `users.role` |
| `event_status` | `upcoming`, `ongoing`, `completed` | `events.status` |
| `order_status` | `pending`, `paid`, `expired`, `cancelled` | `orders.status_order` |
| `payment_status` | `pending`, `success`, `expired`, `failed` | `payments.status` |
| `ticket_status` | `active`, `scanned`, `cancelled` | `tickets.status_tiket` |
| `seat_status` | `available`, `locked`, `booked` | `seats.status_kursi` |

---

## ⚡ Trigger Database (Logika Bisnis di Sisi DB)

| Trigger | Tabel | Keterangan |
|---------|-------|------------|
| `trigger_kurangi_kuota` | `order_items` (BEFORE INSERT) | Memeriksa kuota tersedia dan menguranginya saat order_item diinsert. Mencegah overselling dengan `FOR UPDATE`. |
| `trigger_kalkulasi_total_tiket` | `order_items` (AFTER INSERT/UPDATE/DELETE) | Menghitung ulang `total_pembayaran` pada order berdasarkan jumlah × harga_satuan. |
| `trigger_kembalikan_kuota` | `orders` (AFTER UPDATE) | Saat order berubah menjadi `expired` atau `cancelled`: mengembalikan kuota ke `ticket_categories`, membebaskan kursi (`available`), dan menghapus entri `order_item_seats`. |

---

## 🔗 Relasi Kardinalitas

| Relasi | Kardinalitas | Keterangan |
|--------|-------------|------------|
| User → Order | 1 : 0..* | Satu customer dapat membuat banyak order |
| User → Ticket | 1 : 0..* | Satu scanner dapat scan banyak tiket |
| User → Seat | 1 : 0..* | Satu user dapat lock banyak kursi |
| VenueType → Venue | 1 : 0..* | Satu tipe tempat memiliki banyak venue |
| Venue → Event | 1 : 0..* | Satu venue menjadi lokasi banyak event |
| Genre → Event | 1 : 0..* | Satu genre mengklasifikasikan banyak event |
| Event → TicketCategory | 1 : 0..* | Satu event memiliki banyak kategori tiket |
| TicketCategory → Seat | 1 : 0..* | Satu kategori memiliki banyak kursi |
| TicketCategory → OrderItem | 1 : 0..* | Satu kategori digunakan pada banyak order_item |
| TicketCategory → Ticket | 1 : 0..* | Satu kategori terkait banyak tiket |
| Order → OrderItem | 1 : 0..* | Satu order berisi banyak item |
| Order → Payment | 1 : 0..* | Satu order dapat memiliki banyak pembayaran |
| Order → Ticket | 1 : 0..* | Satu order menghasilkan banyak tiket |
| OrderItem → OrderItemSeat | 1 : 0..* | Satu order_item memilih banyak kursi spesifik |
| Seat → OrderItemSeat | 1 : 0..* | Satu kursi muncul di banyak order_item_seats (historis), namun UNIQUE seat_id mencegah duplikasi aktif |
| Seat → Ticket | 1 : 0..* | Satu kursi terkait banyak tiket (historis) |

---

## ⚠️ Catatan Penting

1. **`cutsomer_id`** pada tabel `orders` adalah typo yang sengaja dipertahankan sesuai skema database yang ada. Pastikan menggunakan nama kolom ini saat query.
2. **`order_item_seats.seat_id`** memiliki constraint `UNIQUE`, sehingga satu kursi tidak dapat tercatat di dua order_item yang berbeda secara bersamaan.
3. Semua relasi ke `users.id` menggunakan `ON DELETE RESTRICT` atau `ON DELETE SET NULL` untuk mencegah hapus data yang masih dirujuk.
4. Relasi `events.venue_id` menggunakan `ON DELETE RESTRICT` — event tidak dapat dihapus jika venue masih digunakan.
5. Relasi `events.genre_id` menggunakan `ON DELETE SET NULL` — event tetap ada jika genre dihapus.
6. Semua timestamps menggunakan `TIMESTAMPTZ` (timezone-aware).