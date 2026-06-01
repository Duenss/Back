/**
 * License key generator with mask support
 * Mask format: use X for random alphanumeric characters
 * Example masks: "XXXX-XXXX-XXXX-XXXX", "PREMIUM-XXXX-XXXX-XXXX"
 */

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generate a single random character from the charset
 */
const randomChar = () => {
  return CHARSET[Math.floor(Math.random() * CHARSET.length)];
};

/**
 * Generate a license key from a mask pattern
 * @param {string} mask - Pattern where X is replaced with random chars
 * @returns {string} Generated license key
 */
const generateFromMask = (mask = 'XXXX-XXXX-XXXX-XXXX') => {
  return mask
    .toUpperCase()
    .split('')
    .map((char) => (char === 'X' ? randomChar() : char))
    .join('');
};

/**
 * Generate multiple unique license keys
 * @param {number} count - Number of keys to generate
 * @param {string} mask - Key pattern mask
 * @param {string[]} existingKeys - Array of already-existing keys to avoid duplicates
 * @returns {string[]} Array of unique license keys
 */
const generateLicenseKeys = (count = 1, mask = 'XXXX-XXXX-XXXX-XXXX', existingKeys = []) => {
  const keys = new Set(existingKeys);
  const generated = [];
  let attempts = 0;
  const maxAttempts = count * 100;

  while (generated.length < count && attempts < maxAttempts) {
    const key = generateFromMask(mask);
    if (!keys.has(key)) {
      keys.add(key);
      generated.push(key);
    }
    attempts++;
  }

  if (generated.length < count) {
    throw new Error(
      `Could not generate ${count} unique keys with the given mask. Try a longer mask or fewer keys.`
    );
  }

  return generated;
};

/**
 * Validate that a key matches a given mask pattern
 * @param {string} key - License key to validate
 * @param {string} mask - Expected mask pattern
 * @returns {boolean}
 */
const validateKeyFormat = (key, mask) => {
  if (key.length !== mask.length) return false;
  for (let i = 0; i < mask.length; i++) {
    const maskChar = mask[i].toUpperCase();
    const keyChar = key[i].toUpperCase();
    if (maskChar === 'X') {
      if (!CHARSET.includes(keyChar)) return false;
    } else {
      if (maskChar !== keyChar) return false;
    }
  }
  return true;
};

module.exports = {
  generateFromMask,
  generateLicenseKeys,
  validateKeyFormat,
};
