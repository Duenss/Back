const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: ['info', 'warning', 'success', 'error'],
      default: 'info',
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Broadcast', broadcastSchema);
