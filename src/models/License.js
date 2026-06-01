const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'License key is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    appId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    duration: {
      type: Number,
      default: null,
    },
    durationUnit: {
      type: String,
      enum: ['hours', 'days', 'months', 'lifetime', null],
      default: null,
    },
    status: {
      type: String,
      enum: ['unused', 'active', 'expired', 'banned'],
      default: 'unused',
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      default: null,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    hwid: {
      type: String,
      default: null,
    },
    note: {
      type: String,
      default: '',
      maxlength: [200, 'Note cannot exceed 200 characters'],
    },
  },
  {
    timestamps: true,
  }
);

licenseSchema.index({ appId: 1, status: 1 });
licenseSchema.index({ key: 1 });

/**
 * Check if the license is currently valid (active and not expired)
 */
licenseSchema.methods.isValid = function () {
  if (this.status === 'banned' || this.status === 'unused') return false;
  if (this.status === 'expired') return false;
  if (this.durationUnit === 'lifetime') return true;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  return true;
};

/**
 * Calculate expiry date based on duration and unit
 * @param {number} duration
 * @param {string} unit - hours|days|months|lifetime
 * @returns {Date|null}
 */
licenseSchema.statics.calculateExpiry = function (duration, unit) {
  if (unit === 'lifetime') return null;
  const now = new Date();
  switch (unit) {
    case 'hours':
      return new Date(now.getTime() + duration * 60 * 60 * 1000);
    case 'days':
      return new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
    case 'months': {
      const d = new Date(now);
      d.setMonth(d.getMonth() + duration);
      return d;
    }
    default:
      return null;
  }
};

module.exports = mongoose.model('License', licenseSchema);
