const Seat = require('../models/seats.js');
const TicketCategory = require('../models/ticketCategories.js');
const { mapError } = require('../utils/httpError.js');
const { DEFAULT_LOCK_MINUTES, MAX_LOCK_MINUTES, MAX_SEATS_PER_ORDER } = require('../config/limits.js');

const MAX_GENERATE = 500; // batas aman jumlah kursi per request generate

// Hilangkan seat_id ganda ([5,5,6] -> [5,6]) supaya tidak salah dihitung.
const uniqueIds = (ids) => [...new Set(ids.map(Number))];

const seatsController = {
  // GET /api/seats?kategori_id=
  getSeats: async (req, res) => {
    try {
      const { kategori_id } = req.query;
      if (!kategori_id) {
        return res.status(400).json({ success: false, message: 'Query parameter kategori_id wajib diisi.' });
      }
      if (!/^\d+$/.test(String(kategori_id))) {
        return res.status(400).json({ success: false, message: 'kategori_id harus berupa angka.' });
      }

      // Pastikan kategori ada
      const category = await TicketCategory.getCategoryById(kategori_id);
      if (!category) {
        return res.status(404).json({ success: false, message: `Kategori tiket dengan ID ${kategori_id} tidak ditemukan.` });
      }

      const result = await Seat.getSeatsByCategory(kategori_id);
      res.status(200).json({ success: true, message: 'Daftar kursi', data: result });
    } catch (error) {
      mapError(error, res, 'Error on getSeats');
    }
  },

  // POST /api/seats/generate (Admin/SuperAdmin)
  // Body: { kategori_id, jumlah, prefix?, start_number? }
  generateSeats: async (req, res) => {
    try {
      const { kategori_id, jumlah, prefix, start_number } = req.validated || req.body;

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

      // Jumlah kursi tidak boleh melebihi kuota_total: kursi di atas kuota tidak akan pernah bisa dijual
      // (trigger kuota menolak) dan membuat peta kursi menyesatkan.
      if (existing.length + newNumbers.length > Number(category.kuota_total)) {
        return res.status(409).json({
          success: false,
          message: `Jumlah kursi (${existing.length} ada + ${newNumbers.length} baru) melebihi kuota_total kategori (${category.kuota_total}). Naikkan kuota_total terlebih dahulu.`
        });
      }

      const result = await Seat.generateSeats(kategori_id, newNumbers);
      res.status(201).json({ success: true, message: `${result.length} kursi berhasil dibuat`, data: result });
    } catch (error) {
      // 23505 = dua request generate bersamaan menabrak UNIQUE(kategori_id, nomor_kursi) -> 409
      mapError(error, res, 'Error on generateSeats');
    }
  },

  // POST /api/seats/lock (Customer/Admin)
  // Body: { seat_ids: [..], minutes? }
  // Mengunci beberapa kursi secara atomik (semua berhasil, atau tidak ada yang terkunci).
  lockSeats: async (req, res) => {
    try {
      const body = req.validated || req.body;
      const { seat_ids, minutes } = body;

      if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'seat_ids wajib berupa array dan tidak boleh kosong.' });
      }
      const seatIds = uniqueIds(seat_ids);
      if (seatIds.length > MAX_SEATS_PER_ORDER) {
        return res.status(400).json({ success: false, message: `Maksimal ${MAX_SEATS_PER_ORDER} kursi per permintaan.` });
      }

      let lockMinutes = DEFAULT_LOCK_MINUTES;
      if (minutes !== undefined && minutes !== null) {
        if (!Number.isInteger(Number(minutes)) || Number(minutes) <= 0) {
          return res.status(400).json({ success: false, message: 'minutes harus berupa bilangan bulat positif.' });
        }
        lockMinutes = Math.min(Number(minutes), MAX_LOCK_MINUTES);
      }

      const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000).toISOString();
      const result = await Seat.lockSeatsAtomic({ seatIds, userId: req.user.id, lockedUntil });

      if (!result.ok) {
        const body409 = { success: false, message: result.message };
        if (result.failed_seat_ids) body409.failed_seat_ids = result.failed_seat_ids;
        return res.status(result.status).json(body409);
      }

      res.status(200).json({
        success: true,
        message: `${result.seats.length} kursi berhasil dikunci sementara.`,
        data: { locked_until: lockedUntil, seats: result.seats }
      });
    } catch (error) {
      mapError(error, res, 'Error on lockSeats');
    }
  },

  // POST /api/seats/unlock (Customer/Admin)
  // Body: { seat_ids: [..] }
  unlockSeats: async (req, res) => {
    try {
      const { seat_ids } = req.validated || req.body;

      if (!Array.isArray(seat_ids) || seat_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'seat_ids wajib berupa array dan tidak boleh kosong.' });
      }
      const seatIds = uniqueIds(seat_ids);

      const isAdmin = req.user && (req.user.role === 'Admin' || req.user.role === 'SuperAdmin');
      const unlocked = await Seat.unlockSeats(seatIds, isAdmin ? null : req.user.id);
      const unlockedIds = new Set(unlocked.map((s) => Number(s.id)));
      const skipped = seatIds.filter((id) => !unlockedIds.has(id)); // bukan locked / bukan milik user / sudah jadi order

      res.status(200).json({
        success: true,
        message: `${unlocked.length} kursi berhasil dibuka.`,
        data: { unlocked, skipped }
      });
    } catch (error) {
      mapError(error, res, 'Error on unlockSeats');
    }
  }
};

module.exports = seatsController;
