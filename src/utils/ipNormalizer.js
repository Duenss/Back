function normalizeIp(ip) {
  if (!ip) return 'Unknown';
  try {
    const s = String(ip).trim();
    // IPv6 loopback -> localhost
    if (s === '::1' || s === '::ffff:127.0.0.1') return '127.0.0.1 (localhost)';
    // IPv6 mapped IPv4: ::ffff:192.168.1.1 -> 192.168.1.1
    if (s.startsWith('::ffff:')) return s.replace('::ffff:', '');
    // Plain IPv4
    if (s.split('.').length === 4) return s;
    // Any other IPv6 — return as-is
    return s;
  } catch (err) {
    return ip;
  }
}

module.exports = { normalizeIp };
