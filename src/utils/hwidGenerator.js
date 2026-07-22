const crypto = require('crypto');

/**
 * Hash a raw HWID string using SHA-256
 * @param {string} rawHwid - Raw hardware identifier string
 * @returns {string} SHA-256 hex hash
 */
const hashHWID = (rawHwid) => {
  if (!rawHwid || typeof rawHwid !== 'string') {
    throw new Error('Invalid HWID: must be a non-empty string');
  }
  return crypto.createHash('sha256').update(rawHwid.trim()).digest('hex');
};

/**
 * Normalize and validate a HWID string
 * @param {string} hwid - Raw or hashed HWID
 * @returns {string} Normalized HWID (trimmed, lowercased)
 */
const normalizeHWID = (hwid) => {
  if (!hwid || typeof hwid !== 'string') {
    throw new Error('Invalid HWID');
  }
  return hwid.trim().toLowerCase();
};

/**
 * Check if a HWID string looks like a SHA-256 hash (64 hex chars)
 * @param {string} hwid
 * @returns {boolean}
 */
const isHashedHWID = (hwid) => {
  return /^[a-f0-9]{64}$/.test(hwid);
};

/**
 * Process incoming HWID: hash it if it's not already hashed
 * @param {string} hwid
 * @returns {string} Hashed HWID
 */
const processHWID = (hwid) => {
  const normalized = normalizeHWID(hwid);
  if (isHashedHWID(normalized)) {
    return normalized;
  }
  return hashHWID(normalized);
};

module.exports = {
  hashHWID,
  normalizeHWID,
  isHashedHWID,
  processHWID,
};
