function normalizeIp(ip) {
  if (!ip) return 'Unknown';
  try {
    // IPv6 mapped IPv4: ::ffff:192.168.1.1 -> 192.168.1.1
    if (typeof ip === 'string' && ip.includes('::ffff:')) {
      return ip.replace('::ffff:', '');
    }
    // If it's plain IPv4 return as-is
    if (typeof ip === 'string' && ip.split('.').length === 4) return ip;
    // Otherwise return original (IPv6 or other)
    return ip;
  } catch (err) {
    return ip;
  }
}

module.exports = { normalizeIp };
