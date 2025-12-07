const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  hall: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hall',
    required: [true, 'Hall is required']
  },
  bookedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  date: {
    type: Date,
    required: [true, 'Booking date is required'],
    validate: {
      validator: function(value) {
        // Ensure booking date is not in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return value >= today;
      },
      message: 'Booking date cannot be in the past'
    }
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format']
  },
  purpose: {
    type: String,
    required: [true, 'Purpose is required'],
    trim: true,
    minlength: [5, 'Purpose must be at least 5 characters long'],
    maxlength: [500, 'Purpose cannot exceed 500 characters']
  },
  eventType: {
    type: String,
    enum: {
      values: ['lecture', 'seminar', 'workshop', 'meeting', 'exam', 'event', 'other'],
      message: 'Invalid event type'
    },
    required: [true, 'Event type is required'],
    default: 'lecture'
  },
  expectedAttendees: {
    type: Number,
    min: [1, 'Expected attendees must be at least 1'],
    max: [1000, 'Expected attendees cannot exceed 1000']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected', 'cancelled'],
      message: 'Invalid status'
    },
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Reference to admin who approved/rejected the booking
  
  approvalDate: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot exceed 500 characters']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
bookingSchema.index({ hall: 1, date: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ bookedBy: 1, date: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ date: 1 });

// Validation to ensure end time is after start time
bookingSchema.pre('save', function(next) {
  const start = this.startTime.split(':').map(Number);
  const end = this.endTime.split(':').map(Number);
  
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  
  if (endMinutes <= startMinutes) {
    next(new Error('End time must be after start time'));
  } else {
    next();
  }
});

// Static method to check for booking conflicts
bookingSchema.statics.checkConflict = async function(hallId, date, startTime, endTime, excludeBookingId = null) {
  const query = {
    hall: hallId,
    date: date,
    status: { $in: ['pending', 'approved'] }
  };
  
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }
  
  const bookings = await this.find(query);
  
  const start = startTime.split(':').map(Number);
  const end = endTime.split(':').map(Number);
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  
  for (const booking of bookings) {
    const bookingStart = booking.startTime.split(':').map(Number);
    const bookingEnd = booking.endTime.split(':').map(Number);
    const bookingStartMinutes = bookingStart[0] * 60 + bookingStart[1];
    const bookingEndMinutes = bookingEnd[0] * 60 + bookingEnd[1];
    
    // Check for overlap
    if (
      (startMinutes >= bookingStartMinutes && startMinutes < bookingEndMinutes) ||
      (endMinutes > bookingStartMinutes && endMinutes <= bookingEndMinutes) ||
      (startMinutes <= bookingStartMinutes && endMinutes >= bookingEndMinutes)
    ) {
      return true; // Conflict found
    }
  }
  
  return false; // No conflict
};

// Virtual for duration in minutes
bookingSchema.virtual('duration').get(function() {
  const start = this.startTime.split(':').map(Number);
  const end = this.endTime.split(':').map(Number);
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  return endMinutes - startMinutes;
});

// Ensure virtuals are included when converting to JSON
bookingSchema.set('toJSON', { virtuals: true });
bookingSchema.set('toObject', { virtuals: true });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
