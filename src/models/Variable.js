const mongoose = require('mongoose');

const variableSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Variable name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Variable name can only contain letters, numbers, and underscores'],
    },
    value: {
      type: String,
      required: [true, 'Variable value is required'],
      maxlength: [5000, 'Value cannot exceed 5000 characters'],
    },
    appId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
    },
    isSecret: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Variable names must be unique per application
variableSchema.index({ name: 1, appId: 1 }, { unique: true });

module.exports = mongoose.model('Variable', variableSchema);
