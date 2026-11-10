# QR Code Specification for Tiket Konser UKK

## Overview
This document specifies the QR code design and implementation for the ticket scanning/check-in system. The QR code contains the ticket's unique identifier (`kode_unik`) which is used by the scanner to validate and check-in tickets.

---

## QR Code Content

### Data Format
The QR code encodes a **plain text string** - the ticket's `kode_unik` value.

**Example:** `TKT-1-5-ABC123`

**Format Pattern:** `TKT-{event_id}-{ticket_category_id}-{random_suffix}`

### Why Plain Text (Not JSON/URL)
- **Simplicity**: No parsing complexity on scanner app
- **Size Efficiency**: Smaller QR code = better scan reliability
- **Universal**: Works with any QR scanner library
- **Security**: `kode_unik` is already a random opaque identifier; no sensitive data exposed

---

## Technical Specifications

| Aspect | Specification |
|--------|---------------|
| **Content** | `kode_unik` (e.g., `TKT-1-5-ABC123`) |
| **Format** | QR Code (ISO/IEC 18004) |
| **Error Correction** | Level M (15%) — Recommended; Level Q (25%) for printed tickets prone to damage |
| **Version** | Auto (determined by data length) |
| **Module Size** | Minimum 200×200px for print; 300×300px recommended |
| **Colors** | Dark modules: `#000000` (black) on Light background: `#FFFFFF` (white) — High contrast required |
| **Quiet Zone** | 4 modules minimum (standard) |
| **Output Formats** | **SVG** (primary, vector/scalable) + **PNG** (fallback for legacy viewers) |

---

## Backend Generation (Implemented)

### Utility: `API/utils/qrCodeGenerator.js`

```javascript
const { generateQRCodeSVG, generateQRCodePNG, generateQRCodeDataURL } = require('../utils/qrCodeGenerator');

// Generate SVG (recommended for frontend display)
const svgString = await generateQRCodeSVG(ticket.kode_unik);

// Generate PNG Buffer (for email attachments, etc.)
const pngBuffer = await generateQRCodePNG(ticket.kode_unik);

// Generate Data URL (for direct <img> src)
const dataUrl = await generateQRCodeDataURL(ticket.kode_unik);
```

### Default Options
```javascript
{
  errorCorrectionLevel: 'M',  // 15% recovery
  margin: 4,                   // 4-module quiet zone
  width: 300,                  // 300px output
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
}
```

---

## Frontend Integration

### 1. E-Ticket Page (Customer View)
Display the QR code alongside ticket details.

**Recommended Implementation:**
```jsx
// React example
import QRCode from 'qrcode.react'; // or use SVG string from API

function ETicket({ ticket }) {
  return (
    <div className="e-ticket">
      <h2>{ticket.event.nama_event}</h2>
      <div className="qr-container">
        {/* Option 1: Use backend-generated SVG */}
        <div dangerouslySetInnerHTML={{ __html: ticket.qr_svg }} />
        
        {/* Option 2: Generate client-side from kode_unik */}
        <QRCode 
          value={ticket.kode_unik}
          size={300}
          level="M"
          bgColor="#FFFFFF"
          fgColor="#000000"
          includeMargin={true}
        />
      </div>
      <p className="kode-unik">{ticket.kode_unik}</p>
      <p>Seat: {ticket.seat.nomor_kursi} • {ticket.category.nama_kategori}</p>
    </div>
  );
}
```

**Print Considerations:**
- Use SVG for crisp printing at any size
- Minimum print size: 2.5cm × 2.5cm (≈ 200px at 200 DPI)
- Ensure white background behind QR code

### 2. Scanner App (Staff View)
Camera-based scanning → POST to `/api/scanner/check-in`.

**Flow:**
```
1. Camera preview → Scan QR code
2. Extract kode_unik string from result
3. POST /api/scanner/check-in { "kode_unik": "TKT-1-5-ABC123" }
4. Handle response:
   - 200: Show success + ticket/event details
   - 404: "Tiket tidak ditemukan"
   - 409: "Tiket sudah dipindai" / "Event tidak valid"
   - 500: "Server error"
5. Audio/visual feedback (success = green + beep; error = red + buzz)
```

**Scanner Libraries:**
- Web: `@zxing/library`, `html5-qrcode`, `quagga2`
- React Native: `react-native-vision-camera` + `vision-camera-code-scanner`
- Flutter: `mobile_scanner`
- Native iOS: `AVFoundation` (AVCaptureMetadataOutput)
- Native Android: `ML Kit Barcode Scanning` / `ZXing`

### 3. Admin Dashboard (Event Scanned List)
GET `/api/scanner/events/:eventId/scanned` → Display paginated table.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/scanner/check-in` | Scanner | Scan QR, validate, update ticket |
| `GET` | `/api/scanner/scanned-tickets` | Scanner | List tickets scanned by this scanner |
| `GET` | `/api/scanner/events/:eventId/scanned` | Scanner/Admin | List all scanned tickets for event |

### Check-In Request
```http
POST /api/scanner/check-in
Authorization: Bearer <scanner_token>
Content-Type: application/json

{
  "kode_unik": "TKT-1-5-ABC123"
}
```

### Check-In Success Response (200)
```json
{
  "success": true,
  "message": "Check-in berhasil.",
  "ticket": {
    "id": 123,
    "kode_unik": "TKT-1-5-ABC123",
    "status_tiket": "scanned",
    "scanned_at": "2026-11-10T15:30:00.000Z",
    "scanned_by": 5,
    "seat": { "id": 456, "nomor_kursi": "A1", "kategori_id": 5 },
    "category": { "id": 5, "nama_kategori": "VIP" }
  },
  "event": {
    "id": 1,
    "nama_event": "Konser Rock 2026",
    "waktu_event": "2026-12-01T19:00:00.000Z",
    "status": "ongoing",
    "venue": { "id": 10, "nama_venue": "Stadion Utama", "alamat": "Jl. Sudirman No. 1" },
    "genre": { "id": 3, "nama_genre": "Rock" }
  }
}
```

### Error Responses

| Status | Code | Message |
|--------|------|---------|
| 400 | Validation | `kode_unik` missing or invalid format |
| 401 | Unauthorized | Invalid/expired scanner token |
| 403 | Forbidden | User not Scanner/Admin/SuperAdmin |
| 404 | Not Found | `Tiket tidak ditemukan.` |
| 409 | Conflict | `Tiket sudah dipindai.` / `Event tidak dalam status yang memungkinkan check-in.` / `Event telah berakhir.` |
| 429 | Rate Limited | Too many scan attempts |
| 500 | Server Error | `Terjadi kesalahan pada server.` |

---

## Database Schema (Reference)

The `tickets` table already contains the required columns:

```sql
-- Existing columns (no migration needed for schema)
tickets.kode_unik        -- VARCHAR, unique ticket code (e.g., TKT-1-5-ABC123)
tickets.status_tiket     -- VARCHAR: 'active' | 'scanned' | 'expired' | 'cancelled'
tickets.scanned_at       -- TIMESTAMPTZ, nullable
tickets.scanned_by       -- INT, FK to users.id, nullable

-- Indexes added via migration 005_scanner_indexes.sql
CREATE INDEX IF NOT EXISTS idx_tickets_scanned_by ON tickets(scanned_by);
CREATE INDEX IF NOT EXISTS idx_tickets_status_kode ON tickets(status_tiket, kode_unik);
```

---

## Testing Checklist

### Backend
- [ ] Generate QR code for ticket → verify SVG/PNG output
- [ ] Scan valid `kode_unik` → returns 200 with ticket+event data
- [ ] Scan already-scanned ticket → returns 409 "Tiket sudah dipindai"
- [ ] Scan invalid/non-existent code → returns 404
- [ ] Scan ticket for completed event → returns 409
- [ ] Non-Scanner role tries check-in → returns 403
- [ ] Rate limit on `/check-in` works

### Frontend (E-Ticket)
- [ ] QR code renders correctly (SVG preferred)
- [ ] `kode_unik` displayed below QR for manual entry fallback
- [ ] Print layout: QR code ≥ 2.5cm × 2.5cm, high contrast
- [ ] Works offline (cached SVG)

### Frontend (Scanner App)
- [ ] Camera permission handling
- [ ] Continuous scan mode with cooldown (prevent double-scan)
- [ ] Visual/audio feedback for success/error
- [ ] Offline queue (optional: store scans, sync when online)
- [ ] Handles 409 gracefully (show "Already scanned" not "Error")

---

## Security Considerations

1. **`kode_unik` is Opaque**: No user/event info encoded; only valid via API
2. **Scanner Authentication**: Requires valid JWT with `Scanner`/`Admin`/`SuperAdmin` role
3. **Rate Limiting**: Applied to `/api/scanner/check-in` (prevent brute-force)
4. **Idempotency**: Re-scanning same ticket returns 409, not duplicate records
5. **Audit Trail**: `scanned_by` and `scanned_at` recorded for accountability

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-11-10 | Initial specification |

---

## Contact
Backend Team — API Tiket Konser UKK