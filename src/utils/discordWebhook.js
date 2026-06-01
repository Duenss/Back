const axios = require('axios');
const WebhookConfig = require('../models/WebhookConfig');

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
  login_success:     { color: COLORS.success, emoji: '✅' },
  login_failed:      { color: COLORS.error,   emoji: '❌' },
  license_activated: { color: COLORS.purple,  emoji: '🔑' },
  license_generated: { color: COLORS.info,    emoji: '🎫' },
  hwid_error:        { color: COLORS.warning, emoji: '⚠️' },
  hwid_reset:        { color: COLORS.info,    emoji: '🔄' },
  user_banned:       { color: COLORS.error,   emoji: '🚫' },
  user_unbanned:     { color: COLORS.success, emoji: '✅' },
  license_banned:    { color: COLORS.error,   emoji: '🚫' },
  app_paused:        { color: COLORS.warning, emoji: '⏸️' },
  app_resumed:       { color: COLORS.success, emoji: '▶️' },
};

/**
 * Reemplaza variables en un template de mensaje
 * Ej: "**{username}** logged in" con { username: 'JohnDoe' }
 */
const interpolate = (template, vars = {}) => {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{${key}}`);
};

/**
 * Send a Discord webhook notification
 * Soporta config personalizada por app (WebhookConfig)
 */
const sendWebhook = async (webhookUrl, options, appId = null) => {
  if (!webhookUrl) return;

  const { event, title, description, fields = [], appName = 'AuthPlatform', vars = {} } = options;
  const eventCfg = EVENT_CONFIG[event] || { color: COLORS.info, emoji: 'ℹ️' };

  // Cargar config personalizada si existe
  let customCfg = null;
  if (appId) {
    try {
      customCfg = await WebhookConfig.findOne({ appId });
    } catch (_) {}
  }

  const botName    = customCfg?.botName    || 'AuthPlatform';
  const botAvatar  = customCfg?.botAvatar  || undefined;
  const embedColor = customCfg?.color      || eventCfg.color;
  const footerText = customCfg?.footerText || `${appName} • AuthPlatform`;
  const footerIcon = customCfg?.footerIcon || undefined;

  // Usar mensaje personalizado si existe para este evento
  let finalDescription = description;
  if (customCfg?.messages?.[event]) {
    finalDescription = interpolate(customCfg.messages[event], vars);
  }

  const embed = {
    title: `${eventCfg.emoji} ${title}`,
    description: finalDescription,
    color: embedColor,
    fields,
    footer: {
      text: footerText,
      ...(footerIcon ? { icon_url: footerIcon } : {}),
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    ...(botName   ? { username:   botName   } : {}),
    ...(botAvatar ? { avatar_url: botAvatar } : {}),
    embeds: [embed],
  };

  try {
    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
  } catch (err) {
    console.error(`Discord webhook failed: ${err.message}`);
  }
};

const notifyLogin = (webhookUrl, { username, ip, appName, appId }) =>
  sendWebhook(webhookUrl, {
    event: 'login_success',
    title: 'User Login',
    description: `**${username}** logged in successfully.`,
    fields: [
      { name: 'IP Address', value: ip || 'Unknown', inline: true },
      { name: 'Application', value: appName || 'Unknown', inline: true },
    ],
    appName,
    vars: { username, ip, appName },
  }, appId);

const notifyLoginFailed = (webhookUrl, { username, ip, reason, appName, appId }) =>
  sendWebhook(webhookUrl, {
    event: 'login_failed',
    title: 'Failed Login Attempt',
    description: `Failed login attempt for **${username}**.`,
    fields: [
      { name: 'Reason', value: reason || 'Invalid credentials', inline: true },
      { name: 'IP Address', value: ip || 'Unknown', inline: true },
    ],
    appName,
    vars: { username, ip, reason, appName },
  }, appId);

const notifyLicenseActivated = (webhookUrl, { licenseKey, username, ip, appName, appId }) =>
  sendWebhook(webhookUrl, {
    event: 'license_activated',
    title: 'License Activated',
    description: `License key activated by **${username}**.`,
    fields: [
      { name: 'License Key', value: `\`${licenseKey}\``, inline: true },
      { name: 'IP Address', value: ip || 'Unknown', inline: true },
    ],
    appName,
    vars: { licenseKey, username, ip, appName },
  }, appId);

const notifyLicenseGenerated = (webhookUrl, { count, mask, appName, appId }) =>
  sendWebhook(webhookUrl, {
    event: 'license_generated',
    title: 'Licenses Generated',
    description: `**${count}** license key(s) generated.`,
    fields: [
      { name: 'Count', value: String(count), inline: true },
      { name: 'Mask', value: mask || 'Default', inline: true },
    ],
    appName,
    vars: { count, mask, appName },
  }, appId);

const notifyHWIDError = (webhookUrl, { username, ip, appName, appId }) =>
  sendWebhook(webhookUrl, {
    event: 'hwid_error',
    title: 'HWID Mismatch',
    description: `HWID mismatch detected for **${username}**.`,
    fields: [{ name: 'IP Address', value: ip || 'Unknown', inline: true }],
    appName,
    vars: { username, ip, appName },
  }, appId);

const notifyUserBanned = (webhookUrl, { username, reason, appName, appId }) =>
  sendWebhook(webhookUrl, {
    event: 'user_banned',
    title: 'User Banned',
    description: `**${username}** has been banned.`,
    fields: [{ name: 'Reason', value: reason || 'No reason provided', inline: false }],
    appName,
    vars: { username, reason, appName },
  }, appId);

module.exports = {
  sendWebhook,
  notifyLogin,
  notifyLoginFailed,
  notifyLicenseActivated,
  notifyLicenseGenerated,
  notifyHWIDError,
  notifyUserBanned,
};
