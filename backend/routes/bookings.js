const express = require('express');
const {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  approveBooking,
  rejectBooking,
  cancelBooking,
  deleteBooking,
  getHallAvailability,
  getBookingStats
} = require('../controllers/bookingController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

// Public route - check hall availability
router.get('/availability/:hallId/:date', getHallAvailability);

// Protected routes - all users
router.use(protect);

router.route('/')
  .get(getBookings)
  .post(createBooking);

router.route('/:id')
  .get(getBooking)
  .put(updateBooking);

// Booking actions
router.put('/:id/cancel', cancelBooking);

// Admin only routes
router.put('/:id/approve', authorize('admin'), approveBooking);
router.put('/:id/reject', authorize('admin'), rejectBooking);
router.delete('/:id', authorize('admin'), deleteBooking);

// Statistics route (admin only)
router.get('/admin/stats', authorize('admin'), getBookingStats);

module.exports = router;
