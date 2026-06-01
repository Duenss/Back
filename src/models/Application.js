const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const applicationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Application name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    appId: {
      type: String,
      unique: true,
      default: () => uuidv4(),
    },
    appSecret: {
      type: String,
      default: () => uuidv4(),
      select: false,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'paused'],
      default: 'active',
    },
    version: {
      type: String,
      default: '1.0.0',
      trim: true,
    },
    webhookUrl: {
      type: String,
      default: null,
      trim: true,
    },
    hwidLock: {
      type: Boolean,
      default: true,
    },
    allowMultipleSessions: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for user count
applicationSchema.virtual('userCount', {
  ref: 'AppUser',
  localField: '_id',
  foreignField: 'appId',
  count: true,
});

// Virtual for license count
applicationSchema.virtual('licenseCount', {
  ref: 'License',
  localField: '_id',
  foreignField: 'appId',
  count: true,
});

module.exports = mongoose.model('Application', applicationSchema);
