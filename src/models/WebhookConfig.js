const mongoose = require('mongoose');

const webhookConfigSchema = new mongoose.Schema(
  {
    appId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      unique: true,
    },
    // Bot appearance
    botName: {
      type: String,
      default: 'AuthPlatform',
      maxlength: 80,
    },
    botAvatar: {
      type: String,
      default: null, // URL de imagen
    },
    // Embed defaults
    color: {
      type: Number,
      default: 0x3498db, // azul por defecto
    },
    footerText: {
      type: String,
      default: 'AuthPlatform',
      maxlength: 100,
    },
    footerIcon: {
      type: String,
      default: null, // URL de imagen
    },
    // Mensajes personalizados por evento
    messages: {
      login_success:      { type: String, default: '**{username}** logged in successfully.' },
      login_failed:       { type: String, default: 'Failed login attempt for **{username}**.' },
      license_activated:  { type: String, default: 'License **{licenseKey}** activated by **{username}**.' },
      license_generated:  { type: String, default: '**{count}** license(s) generated.' },
      hwid_error:         { type: String, default: 'HWID mismatch detected for **{username}**.' },
      user_banned:        { type: String, default: '**{username}** has been banned. Reason: {reason}' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebhookConfig', webhookConfigSchema);
