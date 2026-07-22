/**
 * License key generator with mask support.
 * Use * or ? for random alphanumeric characters.
 * Use X or x as literal characters in the generated key.
 * Example masks: "****-****-****-****", "CoreHks-****-****-****"
 */

const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
};

/**
 * Build the charset used for random key generation.
 */
const buildCharset = ({ uppercase = true, lowercase = false, numbers = true } = {}) => {
  let charset = '';
  if (uppercase) charset += CHARSETS.uppercase;
  if (lowercase) charset += CHARSETS.lowercase;
  if (numbers) charset += CHARSETS.numbers;
  if (!charset) {
    charset = CHARSETS.uppercase + CHARSETS.numbers;
  }
  return charset;
};

/**
 * Generate a single random character from the charset
 */
const randomChar = (charset) => {
  return charset[Math.floor(Math.random() * charset.length)];
};

/**
 * Generate a license key from a mask pattern.
 * Placeholder characters are * and ?; X and x are treated as literal characters.
 * @param {string} mask - Pattern where * or ? is replaced with random chars
 * @param {object} options - Generation options
 * @param {boolean} options.uppercase
 * @param {boolean} options.lowercase
 * @param {boolean} options.numbers
 * @returns {string} Generated license key
 */
const generateFromMask = (
  mask = '****-****-****-****',
  { uppercase = true, lowercase = false, numbers = true } = {}
) => {
  const charset = buildCharset({ uppercase, lowercase, numbers });

  return mask
    .split('')
    .map((char) => (char === '*' || char === '?' ? randomChar(charset) : char))
    .join('');
};

/**
 * Generate multiple unique license keys
 * @param {number} count - Number of keys to generate
 * @param {string} mask - Key pattern mask
 * @param {string[]} existingKeys - Array of already-existing keys to avoid duplicates
 * @param {object} options - Generation options
 * @returns {string[]} Array of unique license keys
 */
const generateLicenseKeys = (
  count = 1,
  mask = 'XXXX-XXXX-XXXX-XXXX',
  existingKeys = [],
  options = { uppercase: true, lowercase: false, numbers: true }
) => {
  const keys = new Set(existingKeys.map((key) => key.toUpperCase()));
  const generated = [];
  let attempts = 0;
  const maxAttempts = count * 100;

  while (generated.length < count && attempts < maxAttempts) {
    const key = generateFromMask(mask, options);
    if (!keys.has(key.toUpperCase())) {
      keys.add(key.toUpperCase());
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
    const maskChar = mask[i];
    const keyChar = key[i];

    if (maskChar === '*' || maskChar === '?') {
      if (
        !CHARSETS.uppercase.includes(keyChar) &&
        !CHARSETS.lowercase.includes(keyChar) &&
        !CHARSETS.numbers.includes(keyChar)
      ) {
        return false;
      }
    } else if (maskChar === 'X' || maskChar === 'x') {
      if (maskChar !== keyChar) return false;
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
