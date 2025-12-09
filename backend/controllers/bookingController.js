const Booking = require('../models/Booking');
const Hall = require('../models/Hall');

// @desc    Get all bookings
// @route   GET /api/bookings
// @access  Private
exports.getBookings = async (req, res) => {
  try {
    let query = {};

    // If not admin, only show user's own bookings
    if (req.user.role !== 'admin') {
      query.bookedBy = req.user.id;
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by hall
    if (req.query.hall) {
      query.hall = req.query.hall;
    }

    // Filter by date
    if (req.query.date) {
      query.date = new Date(req.query.date);
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.date = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const bookings = await Booking.find(query)
      .populate('hall', 'name hallNumber building floor capacity type')
      .populate('bookedBy', 'name email department')
      .populate('approvedBy', 'name email')
      .sort({ date: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: {
        bookings
      }
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
exports.getBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('hall', 'name hallNumber building floor capacity type facilities')
      .populate('bookedBy', 'name email department phone')
      .populate('approvedBy', 'name email');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user is authorized to view this booking
    if (req.user.role !== 'admin' && booking.bookedBy._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this booking'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        booking
      }
    });
  } catch (error) {
    console.error('Get booking error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
  try {
    const {
      hall,
      date,
      startTime,
      endTime,
      purpose,
      eventType,
      expectedAttendees,
      notes
    } = req.body;

    // Validate required fields
    if (!hall || !date || !startTime || !endTime || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Please provide hall, date, startTime, endTime, and purpose'
      });
    }

    // Check if hall exists and is available
    const hallExists = await Hall.findById(hall);
    if (!hallExists) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    if (!hallExists.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Hall is currently not available for booking'
      });
    }

    // Validate expected attendees against hall capacity
    if (expectedAttendees && expectedAttendees > hallExists.capacity) {
      return res.status(400).json({
        success: false,
        message: `Expected attendees (${expectedAttendees}) exceeds hall capacity (${hallExists.capacity})`
      });
    }

    // Check for booking conflicts
    const bookingDate = new Date(date);
    const hasConflict = await Booking.checkConflict(
      hall,
      bookingDate,
      startTime,
      endTime
    );

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is already booked. Please choose a different time or hall.'
      });
    }

    // Create booking
    const booking = await Booking.create({
      hall,
      bookedBy: req.user.id,
      date: bookingDate,
      startTime,
      endTime,
      purpose,
      eventType: eventType || 'lecture',
      expectedAttendees,
      notes,
      status: 'pending'
    });

    // Populate the booking before sending response
    await booking.populate('hall', 'name hallNumber building floor capacity type');
    await booking.populate('bookedBy', 'name email department');

    res.status(201).json({
      success: true,
      message: 'Booking created successfully. Awaiting admin approval.',
      data: {
        booking
      }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    
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

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private
exports.updateBooking = async (req, res) => {
  try {
    let booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check authorization - only booking owner or admin can update
    if (req.user.role !== 'admin' && booking.bookedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this booking'
      });
    }

    // Don't allow updates to approved bookings unless admin
    if (booking.status === 'approved' && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update approved booking. Please contact admin.'
      });
    }

    const {
      hall,
      date,
      startTime,
      endTime,
      purpose,
      eventType,
      expectedAttendees,
      notes
    } = req.body;

    // Build update object
    const updateData = {};
    
    if (purpose) updateData.purpose = purpose;
    if (eventType) updateData.eventType = eventType;
    if (expectedAttendees !== undefined) updateData.expectedAttendees = expectedAttendees;
    if (notes !== undefined) updateData.notes = notes;

    // If changing hall, date, or time, check for conflicts
    const newHall = hall || booking.hall;
    const newDate = date ? new Date(date) : booking.date;
    const newStartTime = startTime || booking.startTime;
    const newEndTime = endTime || booking.endTime;

    // Check if hall exists and is available
    if (hall) {
      const hallExists = await Hall.findById(hall);
      if (!hallExists) {
        return res.status(404).json({
          success: false,
          message: 'Hall not found'
        });
      }

      if (!hallExists.isAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Hall is currently not available for booking'
        });
      }

      updateData.hall = hall;
    }

    // Validate expected attendees against hall capacity
    if (expectedAttendees) {
      const hallToCheck = await Hall.findById(newHall);
      if (expectedAttendees > hallToCheck.capacity) {
        return res.status(400).json({
          success: false,
          message: `Expected attendees (${expectedAttendees}) exceeds hall capacity (${hallToCheck.capacity})`
        });
      }
    }

    // Check for conflicts if time/date/hall changed
    if (hall || date || startTime || endTime) {
      const hasConflict = await Booking.checkConflict(
        newHall,
        newDate,
        newStartTime,
        newEndTime,
        req.params.id // Exclude current booking from conflict check
      );

      if (hasConflict) {
        return res.status(409).json({
          success: false,
          message: 'This time slot is already booked. Please choose a different time or hall.'
        });
      }

      if (date) updateData.date = newDate;
      if (startTime) updateData.startTime = startTime;
      if (endTime) updateData.endTime = endTime;
    }

    // Reset status to pending if significant changes made
    if (hall || date || startTime || endTime) {
      updateData.status = 'pending';
      updateData.approvedBy = undefined;
      updateData.approvalDate = undefined;
    }

    booking = await Booking.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    )
      .populate('hall', 'name hallNumber building floor capacity type')
      .populate('bookedBy', 'name email department')
      .populate('approvedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Booking updated successfully',
      data: {
        booking
      }
    });
  } catch (error) {
    console.error('Update booking error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
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

// @desc    Approve booking
// @route   PUT /api/bookings/:id/approve
// @access  Private/Admin
exports.approveBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already approved'
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve a cancelled booking'
      });
    }

    // Final conflict check before approval
    const hasConflict = await Booking.checkConflict(
      booking.hall,
      booking.date,
      booking.startTime,
      booking.endTime,
      req.params.id
    );

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        message: 'Cannot approve: This time slot has been booked by another approved booking'
      });
    }

    booking.status = 'approved';
    booking.approvedBy = req.user.id;
    booking.approvalDate = Date.now();
    booking.rejectionReason = undefined;

    await booking.save();

    await booking.populate('hall', 'name hallNumber building floor capacity type');
    await booking.populate('bookedBy', 'name email department');
    await booking.populate('approvedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Booking approved successfully',
      data: {
        booking
      }
    });
  } catch (error) {
    console.error('Approve booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Reject booking
// @route   PUT /api/bookings/:id/reject
// @access  Private/Admin
exports.rejectBooking = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a rejection reason'
      });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status === 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already rejected'
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject a cancelled booking'
      });
    }

    booking.status = 'rejected';
    booking.approvedBy = req.user.id;
    booking.approvalDate = Date.now();
    booking.rejectionReason = rejectionReason;

    await booking.save();

    await booking.populate('hall', 'name hallNumber building floor capacity type');
    await booking.populate('bookedBy', 'name email department');
    await booking.populate('approvedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Booking rejected',
      data: {
        booking
      }
    });
  } catch (error) {
    console.error('Reject booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check authorization
    if (req.user.role !== 'admin' && booking.bookedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this booking'
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }

    booking.status = 'cancelled';
    await booking.save();

    await booking.populate('hall', 'name hallNumber building floor capacity type');
    await booking.populate('bookedBy', 'name email department');

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking
      }
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete booking
// @route   DELETE /api/bookings/:id
// @access  Private/Admin
exports.deleteBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    await Booking.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Booking deleted successfully',
      data: {}
    });
  } catch (error) {
    console.error('Delete booking error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get hall availability for a specific date
// @route   GET /api/bookings/availability/:hallId/:date
// @access  Public
exports.getHallAvailability = async (req, res) => {
  try {
    const { hallId, date } = req.params;

    // Check if hall exists
    const hall = await Hall.findById(hallId);
    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    // Get all approved bookings for this hall on this date
    const bookings = await Booking.find({
      hall: hallId,
      date: new Date(date),
      status: { $in: ['pending', 'approved'] }
    }).select('startTime endTime status purpose bookedBy')
      .populate('bookedBy', 'name')
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      data: {
        hall: {
          id: hall._id,
          name: hall.name,
          hallNumber: hall.hallNumber,
          building: hall.building,
          floor: hall.floor,
          isAvailable: hall.isAvailable
        },
        date: date,
        bookings: bookings.map(b => ({
          startTime: b.startTime,
          endTime: b.endTime,
          status: b.status,
          purpose: b.purpose,
          bookedBy: b.bookedBy.name
        }))
      }
    });
  } catch (error) {
    console.error('Get hall availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get booking statistics
// @route   GET /api/bookings/admin/stats
// @access  Private/Admin
exports.getBookingStats = async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments();
    const pendingBookings = await Booking.countDocuments({ status: 'pending' });
    const approvedBookings = await Booking.countDocuments({ status: 'approved' });
    const rejectedBookings = await Booking.countDocuments({ status: 'rejected' });
    const cancelledBookings = await Booking.countDocuments({ status: 'cancelled' });

    // Bookings by event type
    const bookingsByEventType = await Booking.aggregate([
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Bookings by hall
    const bookingsByHall = await Booking.aggregate([
      {
        $group: {
          _id: '$hall',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'halls',
          localField: '_id',
          foreignField: '_id',
          as: 'hallInfo'
        }
      },
      {
        $unwind: '$hallInfo'
      },
      {
        $project: {
          hallName: '$hallInfo.name',
          hallNumber: '$hallInfo.hallNumber',
          count: 1
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalBookings,
        pendingBookings,
        approvedBookings,
        rejectedBookings,
        cancelledBookings,
        bookingsByEventType,
        topBookedHalls: bookingsByHall
      }
    });
  } catch (error) {
    console.error('Get booking stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
