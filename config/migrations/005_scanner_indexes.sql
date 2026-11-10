-- Scanner Implementation Migration
-- Add indexes for scanner queries on tickets table
-- Run this in Supabase SQL Editor

-- Index for scanner queries by scanned_by
CREATE INDEX IF NOT EXISTS idx_tickets_scanned_by ON tickets(scanned_by);

-- Composite index for status + kode_unik lookups
CREATE INDEX IF NOT EXISTS idx_tickets_status_kode ON tickets(status_tiket, kode_unik);

-- Index for event-scoped scanned tickets (via order_item_seats -> order_items -> orders -> events)
-- This requires a more complex query path, but the above indexes help the base ticket lookups