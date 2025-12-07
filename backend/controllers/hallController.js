const Hall = require('../models/Hall');
const { deleteImages } = require('../middleware/cloudinary');

// @desc    Get all halls
// @route   GET /api/halls
// @access  Public
exports.getHalls = async (req, res) => {
  try {
    // Build query
    let query = {};

    // Filter by availability
    if (req.query.isAvailable) {
      query.isAvailable = req.query.isAvailable === 'true';
    }

    // Filter by type
    if (req.query.type) {
      query.type = req.query.type;
    }

    // Filter by building
    if (req.query.building) {
      query.building = new RegExp(req.query.building, 'i');
    }

    // Filter by minimum capacity
    if (req.query.minCapacity) {
      query.capacity = { $gte: parseInt(req.query.minCapacity) };
    }

    const halls = await Hall.find(query).sort({ building: 1, floor: 1, hallNumber: 1 });

    res.status(200).json({
      success: true,
      count: halls.length,
      data: {
        halls
      }
    });
  } catch (error) {
    console.error('Get halls error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single hall
// @route   GET /api/halls/:id
// @access  Public
exports.getHall = async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        hall
      }
    });
  } catch (error) {
    console.error('Get hall error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create new hall
// @route   POST /api/halls
// @access  Private/Admin
exports.createHall = async (req, res) => {
  try {
    const {
      name,
      hallNumber,
      building,
      floor,
      capacity,
      type,
      facilities,
      description,
      isAvailable
    } = req.body;

    // Validate required fields
    if (!name || !hallNumber || !building || floor === undefined || !capacity) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, hallNumber, building, floor, and capacity'
      });
    }

    // Check if hall already exists
    const existingHall = await Hall.findOne({ 
      $or: [
        { name },
        { hallNumber }
      ]
    });

    if (existingHall) {
      return res.status(400).json({
        success: false,
        message: 'Hall with this name or hall number already exists'
      });
    }

    // Handle uploaded images
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => file.path);
    }

    // Parse facilities if it's a string
    let parsedFacilities = facilities;
    if (typeof facilities === 'string') {
      try {
        parsedFacilities = JSON.parse(facilities);
      } catch (e) {
        parsedFacilities = facilities.split(',').map(f => f.trim());
      }
    }

    // Create hall
    const hall = await Hall.create({
      name,
      hallNumber,
      building,
      floor: parseInt(floor),
      capacity: parseInt(capacity),
      type: type || 'lecture',
      facilities: parsedFacilities || [],
      description,
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      images
    });

    res.status(201).json({
      success: true,
      message: 'Hall created successfully',
      data: {
        hall
      }
    });
  } catch (error) {
    console.error('Create hall error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update hall
// @route   PUT /api/halls/:id
// @access  Private/Admin
exports.updateHall = async (req, res) => {
  try {
    let hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    const {
      name,
      hallNumber,
      building,
      floor,
      capacity,
      type,
      facilities,
      description,
      isAvailable
    } = req.body;

    // Build update object
    const updateData = {};
    
    if (name) updateData.name = name;
    if (hallNumber) updateData.hallNumber = hallNumber;
    if (building) updateData.building = building;
    if (floor !== undefined) updateData.floor = parseInt(floor);
    if (capacity) updateData.capacity = parseInt(capacity);
    if (type) updateData.type = type;
    if (description !== undefined) updateData.description = description;
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;

    // Handle facilities
    if (facilities) {
      if (typeof facilities === 'string') {
        try {
          updateData.facilities = JSON.parse(facilities);
        } catch (e) {
          updateData.facilities = facilities.split(',').map(f => f.trim());
        }
      } else {
        updateData.facilities = facilities;
      }
    }

    // Handle new uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => file.path);
      updateData.images = [...(hall.images || []), ...newImages];
    }

    hall = await Hall.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      message: 'Hall updated successfully',
      data: {
        hall
      }
    });
  } catch (error) {
    console.error('Update hall error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete hall image
// @route   DELETE /api/halls/:id/images
// @access  Private/Admin
exports.deleteHallImage = async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Please provide image URL to delete'
      });
    }

    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    // Check if image exists in hall
    if (!hall.images.includes(imageUrl)) {
      return res.status(404).json({
        success: false,
        message: 'Image not found in hall'
      });
    }

    // Delete from Cloudinary
    await deleteImages([imageUrl]);

    // Remove from hall
    hall.images = hall.images.filter(img => img !== imageUrl);
    await hall.save();

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      data: {
        hall
      }
    });
  } catch (error) {
    console.error('Delete hall image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete hall
// @route   DELETE /api/halls/:id
// @access  Private/Admin
exports.deleteHall = async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    // Delete all images from Cloudinary
    if (hall.images && hall.images.length > 0) {
      await deleteImages(hall.images);
    }

    await Hall.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Hall deleted successfully',
      data: {}
    });
  } catch (error) {
    console.error('Delete hall error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get hall statistics
// @route   GET /api/halls/stats
// @access  Private/Admin
exports.getHallStats = async (req, res) => {
  try {
    const totalHalls = await Hall.countDocuments();
    const availableHalls = await Hall.countDocuments({ isAvailable: true });
    
    const hallsByType = await Hall.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const hallsByBuilding = await Hall.aggregate([
      {
        $group: {
          _id: '$building',
          count: { $sum: 1 },
          totalCapacity: { $sum: '$capacity' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalHalls,
        availableHalls,
        unavailableHalls: totalHalls - availableHalls,
        hallsByType,
        hallsByBuilding
      }
    });
  } catch (error) {
    console.error('Get hall stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
