const pool = require('../config/db');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const ScannerAssignment = {
  async listScannersForEvent(eventId) {
    const result = await pool.query(
      `SELECT e.id AS event_id, u.id AS scanner_id, u.username, u.email,
              sea.assigned_by, sea.created_at AS assigned_at
         FROM events e
         LEFT JOIN scanner_event_assignments sea ON sea.event_id = e.id
         LEFT JOIN users u ON u.id = sea.scanner_id AND u.role = 'Scanner'
        WHERE e.id = $1
        ORDER BY u.username NULLS LAST, u.id`,
      [eventId]
    );
    if (result.rows.length === 0) return null;

    return {
      event_id: result.rows[0].event_id,
      scanners: result.rows
        .filter((row) => row.scanner_id !== null)
        .map(({ scanner_id, username, email, assigned_by, assigned_at }) => ({
          scanner_id,
          username,
          email,
          assigned_by,
          assigned_at
        }))
    };
  },

  async listAssignedEvents(scannerId) {
    const result = await pool.query(
      `SELECT e.id, e.nama_event, e.waktu_event, e.status
         FROM scanner_event_assignments sea
         JOIN events e ON e.id = sea.event_id
        WHERE sea.scanner_id = $1
        ORDER BY e.waktu_event`,
      [scannerId]
    );
    return result.rows;
  },

  async isAssigned(scannerId, eventId) {
    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1
           FROM scanner_event_assignments sea
           JOIN users u ON u.id = sea.scanner_id
          WHERE sea.scanner_id = $1 AND sea.event_id = $2 AND u.role = 'Scanner'
       ) AS assigned`,
      [scannerId, eventId]
    );
    return result.rows[0].assigned;
  },

  async assign(scannerId, eventId, assignedBy) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT role FROM users WHERE id = $1 FOR UPDATE', [scannerId]);
      if (!user.rows[0]) throw httpError(404, 'Akun scanner tidak ditemukan.');
      if (user.rows[0].role !== 'Scanner') throw httpError(409, 'Akun yang ditugaskan harus memiliki role Scanner.');

      const event = await client.query('SELECT id FROM events WHERE id = $1', [eventId]);
      if (!event.rows[0]) throw httpError(404, 'Event tidak ditemukan.');

      await client.query(
        `INSERT INTO scanner_event_assignments (scanner_id, event_id, assigned_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (scanner_id, event_id) DO NOTHING`,
        [scannerId, eventId, assignedBy]
      );
      await client.query('COMMIT');
      return { scanner_id: Number(scannerId), event_id: Number(eventId) };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* preserve the original error */ }
      throw error;
    } finally {
      client.release();
    }
  },

  async unassign(scannerId, eventId) {
    const result = await pool.query(
      `DELETE FROM scanner_event_assignments
        WHERE scanner_id = $1 AND event_id = $2
      RETURNING scanner_id, event_id`,
      [scannerId, eventId]
    );
    return result.rows[0] || null;
  }
};

module.exports = ScannerAssignment;