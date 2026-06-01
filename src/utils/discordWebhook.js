const axios = require('axios');

/**
 * Color codes for Discord embeds
 */
const COLORS = {
  success: 0x2ecc71,
  error: 0xe74c3c,
  warning: 0xf39c12,
  info: 0x3498db,
  purple: 0x9b59b6,
};

/**
 * Event type to color/emoji mapping
 */
const EVENT_CONFIG = {
  login_success: { color: COLORS.success, emoji: '✅' },
  login_failed: { color: COLORS.error, emoji: '❌' },
  license_activated: { color: COLORS.purple, emoji: '🔑' },
  license_generated: { color: COLORS.info, emoji: '🎫' },
  hwid_error: { color: COLORS.warning, emoji: '⚠️' },
  hwid_reset: { color: COLORS.info, emoji: '🔄' },
  user_banned: { color: COLORS.error, emoji: '🚫' },
  user_unbanned: { color: COLORS.success, emoji: '✅' },
  license_banned: { color: COLORS.error, emoji: '🚫' },
  app_paused: { color: COLORS.warning, emoji: '⏸️' },
  app_resumed: { color: COLORS.success, emoji: '▶️' },
};

/**
 * Send a Discord webhook notification
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object} options - Notification options
 * @param {string} options.event - Event type key
 * @param {string} options.title - Embed title
 * @param {string} options.description - Embed description
 * @param {object[]} [options.fields] - Additional embed fields
 * @param {string} [options.appName] - Application name for footer
 */
const sendWebhook = async (webhookUrl, options) => {
  if (!webhookUrl) return;

  const { event, title, description, fields = [], appName = 'AuthPlatform' } = options;
  const config = EVENT_CONFIG[event] || { color: COLORS.info, emoji: 'ℹ️' };

  const embed = {
    title: `${config.emoji} ${title}`,
    description,
    color: config.color,
    fields,
    footer: {
      text: `${appName} • AuthPlatform`,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    await axios.post(
      webhookUrl,
      { embeds: [embed] },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );
  } catch (err) {
    // Webhook failures should never crash the main flow
    console.error(`Discord webhook failed: ${err.message}`);
  }
};

/**
 * Notify on successful login
 */
const notifyLogin = (webhookUrl, { username, ip, appName }) => {
  return sendWebhook(webhookUrl, {
    event: 'login_success',
    title: 'User Login',
    description: `**${username}** logged in successfully.`,
    fields: [
      { name: 'IP Address', value: ip || 'Unknown', inline: true },
      { name: 'Application', value: appName || 'Unknown', inline: true },
    ],
    appName,
  });
};

/**
 * Notify on failed login
 */
const notifyLoginFailed = (webhookUrl, { username, ip, reason, appName }) => {
  return sendWebhook(webhookUrl, {
    event: 'login_failed',
    title: 'Failed Login Attempt',
    description: `Failed login attempt for **${username}**.`,
    fields: [
      { name: 'Reason', value: reason || 'Invalid credentials', inline: true },
      { name: 'IP Address', value: ip || 'Unknown', inline: true },
    ],
    appName,
  });
};

/**
 * Notify on license activation
 */
const notifyLicenseActivated = (webhookUrl, { licenseKey, username, ip, appName }) => {
  return sendWebhook(webhookUrl, {
    event: 'license_activated',
    title: 'License Activated',
    description: `License key activated by **${username}**.`,
    fields: [
      { name: 'License Key', value: `\`${licenseKey}\``, inline: true },
      { name: 'IP Address', value: ip || 'Unknown', inline: true },
    ],
    appName,
  });
};

/**
 * Notify on license generation
 */
const notifyLicenseGenerated = (webhookUrl, { count, mask, appName }) => {
  return sendWebhook(webhookUrl, {
    event: 'license_generated',
    title: 'Licenses Generated',
    description: `**${count}** license key(s) generated.`,
    fields: [
      { name: 'Count', value: String(count), inline: true },
      { name: 'Mask', value: mask || 'Default', inline: true },
    ],
    appName,
  });
};

/**
 * Notify on HWID mismatch
 */
const notifyHWIDError = (webhookUrl, { username, ip, appName }) => {
  return sendWebhook(webhookUrl, {
    event: 'hwid_error',
    title: 'HWID Mismatch',
    description: `HWID mismatch detected for **${username}**.`,
    fields: [{ name: 'IP Address', value: ip || 'Unknown', inline: true }],
    appName,
  });
};

/**
 * Notify on user ban
 */
const notifyUserBanned = (webhookUrl, { username, reason, appName }) => {
  return sendWebhook(webhookUrl, {
    event: 'user_banned',
    title: 'User Banned',
    description: `**${username}** has been banned.`,
    fields: [{ name: 'Reason', value: reason || 'No reason provided', inline: false }],
    appName,
  });
};

module.exports = {
  sendWebhook,
  notifyLogin,
  notifyLoginFailed,
  notifyLicenseActivated,
  notifyLicenseGenerated,
  notifyHWIDError,
  notifyUserBanned,
};
