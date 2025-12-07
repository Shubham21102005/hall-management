// Export all models from a single file for easier imports
const User = require('./User');
const Hall = require('./Hall');
const Booking = require('./Booking');

module.exports = {
  User,
  Hall,
  Booking
};
