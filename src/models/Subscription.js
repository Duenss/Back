const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Subscription name is required'],
      trim: true,
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    level: {
      type: Number,
      required: [true, 'Subscription level is required'],
      min: [0, 'Level must be 0 or greater'],
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1'],
    },
    durationUnit: {
      type: String,
      enum: ['hours', 'days', 'months', 'lifetime'],
      required: [true, 'Duration unit is required'],
    },
    description: {
      type: String,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    appId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: subscription names must be unique per app
subscriptionSchema.index({ name: 1, appId: 1 }, { unique: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
