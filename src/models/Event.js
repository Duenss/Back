const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    appId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', default: null },
    type: { type: String, required: true },
    description: { type: String, default: '' },
    ip: { type: String, default: null },
    metadata: { type: Object, default: {} },
    isTemporary: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// TTL index for temporary events (expire after 300 seconds)
eventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 300, partialFilterExpression: { isTemporary: true } }
);

module.exports = mongoose.model('Event', eventSchema);
