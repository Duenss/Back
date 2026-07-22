const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const appUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
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
    expiresAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'banned'],
      default: 'active',
    },
    banReason: {
      type: String,
      default: null,
    },
    hwid: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    licenseKey: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: usernames must be unique per application
appUserSchema.index({ username: 1, appId: 1 }, { unique: true });

// Hash password before saving
appUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, rounds);
  next();
});

// Compare password
appUserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if subscription is still valid
appUserSchema.methods.isSubscriptionActive = function () {
  if (!this.expiresAt) return true; // lifetime
  return new Date() < this.expiresAt;
};

appUserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('AppUser', appUserSchema);
