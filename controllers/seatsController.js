const Seat = require('../models/seats.js');
const TicketCategory = require('../models/ticketCategories.js');

// Durasi lock default (menit) & batas maksimum
const DEFAULT_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 60;
const MAX_GENERATE = 500; // batas aman jumlah kursi per request generate

const seatsController = {
  // GET /api/seats?kategori_id=
  getSeats: async (req, res) => {
    try {
      const { kategori_id } = req.query;
      if (!kategori_id) {
        return res.status(400).json({ success: false, message: 'Query parameter kategori_id wajib diisi.' });
      }

      // Pastikan kategori ada
      const category = await TicketCategory.getCategoryById(kategori_id);
      if (!category) {
        return res.status(404).json({ success: false, message: `Kategori tiket dengan ID ${kategori_id} tidak ditemukan.` });
      }

      const result = await Seat.getSeatsByCategory(kategori_id);
      res.status(200).json({ success: true, message: "Daftar kursi", data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // POST /api/seats/generate (Admin/SuperAdmin)
  // Body: { kategori_id, jumlah, prefix?, start_number? }
  generateSeats: async (req, res) => {
    try {
      const { kategori_id, jumlah, prefix, start_number } = req.body;

      if (!kategori_id || jumlah === undefined) {
        return res.status(400).json({ success: false, message: 'kategori_id dan jumlah wajib diisi.' });
      }

      if (!Number.isInteger(Number(jumlah)) || Number(jumlah) <= 0) {
        return res.status(400).json({ success: false, message: 'jumlah harus berupa bilangan bulat positif.' });
      }

      if (Number(jumlah) > MAX_GENERATE) {
        return res.status(400).json({ success: false, message: `jumlah maksimal ${MAX_GENERATE} kursi per request.` });
      }

      // Pastikan kategori ada
      const category = await TicketCategory.getCategoryById(kategori_id);
      if (!category) {
        return res.status(404).json({ success: false, message: `Kategori tiket dengan ID ${kategori_id} tidak ditemukan.` });
      }

      // Susun nomor kursi: {prefix}{start_number + i}, misal prefix "A", start 1 -> A1, A2, ...
      const pre = prefix !== undefined && prefix !== null ? String(prefix) : '';
      const start = start_number !== undefined && start_number !== null ? Number(start_number) : 1;

      if (!Number.isInteger(start)) {
        return res.status(400).json({ success: false, message: 'start_number harus berupa bilangan bulat.' });
      }

      const newNumbers = [];
      for (let i = 0; i < Number(jumlah); i++) {
        newNumbers.push(`${pre}${start + i}`);
      }

      // Cek duplikat terhadap kursi yang sudah ada di kategori ini
      const existing = await Seat.getSeatNumbersByCategory(kategori_id);
      const existingSet = new Set(existing);
      const duplicates = newNumbers.filter((n) => existingSet.has(n));
      if (duplicates.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Beberapa nomor kursi sudah ada di kategori ini.',
          duplicates
        });
      }

      const result = await Seat.generateSeats(kategori_id, newNumbers);
      res.status(201).json({ success: true, message: `${result.length} kursi berhasil dibuat`, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // POST /api/seats/lock (Customer/Admin)
  // Body: { seat_ids: [..], minutes? }
  // Mengunci beberapa kursi secara atomik (semua berhasil, atau tidak ada yang terkunci).
  lockSeats: async (req, res) => {
    try {
      const { seat_ids, minutes } = req.body;

      if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'seat_ids wajib berupa array dan tidak boleh kosong.' });
      }

      let lockMinutes = DEFAULT_LOCK_MINUTES;
      if (minutes !== undefined) {
        if (!Number.isInteger(Number(minutes)) || Number(minutes) <= 0) {
          return res.status(400).json({ success: false, message: 'minutes harus berupa bilangan bulat positif.' });
        }
        lockMinutes = Math.min(Number(minutes), MAX_LOCK_MINUTES);
      }

      const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000).toISOString();

      const lockedSeats = [];
      const failedSeats = [];

      // Lock satu per satu secara atomik (tiap UPDATE sudah terkondisi status='available')
      for (const seatId of seat_ids) {
        const locked = await Seat.lockSeat(seatId, lockedUntil);
        if (locked) {
          lockedSeats.push(locked);
        } else {
          failedSeats.push(seatId);
        }
      }

      // Jika ada yang gagal, rollback: bebaskan kursi yang sudah berhasil di-lock
      if (failedSeats.length > 0) {
        for (const s of lockedSeats) {
          await Seat.unlockSeat(s.id);
        }
        return res.status(409).json({
          success: false,
          message: 'Sebagian kursi tidak tersedia (sudah di-lock/dibooking). Tidak ada kursi yang dikunci.',
          failed_seat_ids: failedSeats
        });
      }

      res.status(200).json({
        success: true,
        message: `${lockedSeats.length} kursi berhasil dikunci sementara.`,
        data: { locked_until: lockedUntil, seats: lockedSeats }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // POST /api/seats/unlock (Customer/Admin)
  // Body: { seat_ids: [..] }
  unlockSeats: async (req, res) => {
    try {
      const { seat_ids } = req.body;

      if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'seat_ids wajib berupa array dan tidak boleh kosong.' });
      }

      const unlockedSeats = [];
      const skippedSeats = [];

      for (const seatId of seat_ids) {
        const unlocked = await Seat.unlockSeat(seatId);
        if (unlocked) {
          unlockedSeats.push(unlocked);
        } else {
          skippedSeats.push(seatId); // bukan status 'locked' (mungkin available/booked)
        }
      }

      res.status(200).json({
        success: true,
        message: `${unlockedSeats.length} kursi berhasil dibuka.`,
        data: { unlocked: unlockedSeats, skipped: skippedSeats }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = seatsController;
