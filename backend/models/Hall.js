const mongoose = require('mongoose');

const hallSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Hall name is required'],
    trim: true,
    unique: true,
    minlength: [2, 'Hall name must be at least 2 characters long'],
    maxlength: [100, 'Hall name cannot exceed 100 characters']
  },
  hallNumber: {
    type: String,
    required: [true, 'Hall number is required'],
    trim: true,
    unique: true
  },
  building: {
    type: String,
    required: [true, 'Building name is required'],
    trim: true,
    maxlength: [100, 'Building name cannot exceed 100 characters']
  },
  floor: {
    type: Number,
    required: [true, 'Floor number is required'],
    min: [0, 'Floor number cannot be negative']
  },
  capacity: {
    type: Number,
    required: [true, 'Capacity is required'],
    min: [1, 'Capacity must be at least 1'],
    max: [1000, 'Capacity cannot exceed 1000']
  },
  type: {
    type: String,
    enum: {
      values: ['lecture', 'seminar', 'lab', 'auditorium', 'conference', 'other'],
      message: 'Invalid hall type'
    },
    required: [true, 'Hall type is required'],
    default: 'lecture'
  },
  facilities: [{
    type: String,
    trim: true
  }],
  // Examples: 'projector', 'whiteboard', 'smart board', 'AC', 'microphone', 'speakers'
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  // If false, hall cannot be booked (maintenance, etc.)
  
  images: [{
    type: String,
    trim: true
  }],
  // URLs to hall images
  
}, {
  timestamps: true
});

// Indexes for faster queries
hallSchema.index({ name: 1 });
hallSchema.index({ hallNumber: 1 });
hallSchema.index({ building: 1, floor: 1 });
hallSchema.index({ type: 1 });
hallSchema.index({ isAvailable: 1 });

// Virtual for full location
hallSchema.virtual('location').get(function() {
  return `${this.building}, Floor ${this.floor}, Hall ${this.hallNumber}`;
});

// Ensure virtuals are included when converting to JSON
hallSchema.set('toJSON', { virtuals: true });
hallSchema.set('toObject', { virtuals: true });

const Hall = mongoose.model('Hall', hallSchema);

module.exports = Hall;
