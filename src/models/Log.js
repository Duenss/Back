const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
  {
    appId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    event: {
      type: String,
      enum: [
        'login_success',
        'login_failed',
        'license_activated',
        'license_generated',
        'hwid_error',
        'hwid_reset',
        'user_banned',
        'user_unbanned',
        'user_created',
        'user_deleted',
        'license_banned',
        'license_deleted',
        'app_paused',
        'app_resumed',
        'variable_created',
        'variable_updated',
        'variable_deleted',
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const normalizeIp = (ip) => {
  if (!ip) return null;
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
  return ip;
};

logSchema.pre('validate', function (next) {
  if (this.ip) {
    this.ip = normalizeIp(this.ip);
  }
  next();
});

logSchema.index({ appId: 1, createdAt: -1 });
logSchema.index({ appId: 1, event: 1 });

module.exports = mongoose.model('Log', logSchema);
