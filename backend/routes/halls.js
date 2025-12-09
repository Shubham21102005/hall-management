const express = require('express');
const {
  getHalls,
  getHall,
  createHall,
  updateHall,
  deleteHall,
  deleteHallImage,
  getHallStats
} = require('../controllers/hallController');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');
const { upload, uploadImages } = require('../middleware/cloudinary');

// Public routes
router.get('/', getHalls);
router.get('/:id', getHall);

// Admin only routes
router.post(
  '/',
  protect,
  authorize('admin'),
  upload.array('images', 5), // Allow up to 5 images
  uploadImages, // Upload to Cloudinary
  createHall
);

router.put(
  '/:id',
  protect,
  authorize('admin'),
  upload.array('images', 5),
  uploadImages, // Upload to Cloudinary
  updateHall
);

router.delete(
  '/:id/images',
  protect,
  authorize('admin'),
  deleteHallImage
);

router.delete(
  '/:id',
  protect,
  authorize('admin'),
  deleteHall
);

// Statistics route (admin only)
router.get(
  '/admin/stats',
  protect,
  authorize('admin'),
  getHallStats
);

module.exports = router;
