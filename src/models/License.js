const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'License key is required'],
      unique: true,
      trim: true,
    },
    // Normalized uppercase key for case-insensitive lookups and uniqueness
    keyNormalized: {
      type: String,
      required: true,
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
      enum: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years', 'lifetime', null],
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

licenseSchema.index({ appId: 1, status: 1 });
licenseSchema.index({ key: 1 });
licenseSchema.index({ keyNormalized: 1 });

// Ensure normalized key is set before validation/save
licenseSchema.pre('validate', function (next) {
  if (this.key) this.keyNormalized = String(this.key).toUpperCase();
  next();
});

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
 * @param {string} unit - hours|days|months|years|lifetime
 * @returns {Date|null}
 */
licenseSchema.statics.calculateExpiry = function (duration, unit) {
  if (unit === 'lifetime') return null;
  const now = new Date();
  switch (unit) {
    case 'seconds':
      return new Date(now.getTime() + duration * 1000);
    case 'minutes':
      return new Date(now.getTime() + duration * 60 * 1000);
    case 'hours':
      return new Date(now.getTime() + duration * 60 * 60 * 1000);
    case 'days':
      return new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
    case 'weeks':
      return new Date(now.getTime() + duration * 7 * 24 * 60 * 60 * 1000);
    case 'months': {
      const d = new Date(now);
      d.setMonth(d.getMonth() + duration);
      return d;
    }
    case 'years': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() + duration);
      return d;
    }
    default:
      return null;
  }
};

module.exports = mongoose.model('License', licenseSchema);
