const net = require('net');

/**
 * Proxy Headers Middleware - Sichere Validierung von Nginx Proxy Headers
 * Validiert und normalisiert X-Forwarded-For und X-Forwarded-Proto
 */

// Trusted Proxy IPs (Nginx Server)
const TRUSTED_PROXIES = [
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  '65.21.76.124'  // BLUN Server
];

/**
 * Validiert ob IP-Adresse gueltig ist
 */
function isValidIP(ip) {
  if (!ip || typeof ip !== 'string') return false;

  // Remove IPv6 prefix
  const cleanIP = ip.replace(/^::ffff:/, '');

  // Validate with Node's net module
  return net.isIP(cleanIP) !== 0;
}

/**
 * Validiert ob Proxy vertrauenswuerdig ist
 */
function isTrustedProxy(ip) {
  const cleanIP = ip.replace(/^::ffff:/, '');
  return TRUSTED_PROXIES.includes(cleanIP);
}

/**
 * Extrahiert Client IP aus X-Forwarded-For Header
 */
function extractClientIP(forwardedFor, remoteAddress) {
  if (!forwardedFor) {
    return remoteAddress;
  }

  // Split by comma and clean whitespace
  const ips = forwardedFor.split(',').map(ip => ip.trim());

  // Validate all IPs in chain
  const validIPs = ips.filter(isValidIP);

  if (validIPs.length === 0) {
    return remoteAddress; // Fallback
  }

  // Return first (leftmost) IP as client IP
  return validIPs[0];
}

/**
 * Validiert X-Forwarded-Proto Header
 */
function validateProtocol(protocol) {
  if (!protocol || typeof protocol !== 'string') {
    return 'http'; // Secure default
  }

  const cleanProto = protocol.toLowerCase().trim();

  // Nur http/https erlaubt
  if (cleanProto === 'https' || cleanProto === 'http') {
    return cleanProto;
  }

  return 'http'; // Secure default
}

/**
 * Proxy Headers Middleware
 */
function proxyHeaders(req, res, next) {
  const remoteAddress = req.connection.remoteAddress || req.socket.remoteAddress;

  // Prüfe ob Request von Trusted Proxy kommt
  const isTrusted = isTrustedProxy(remoteAddress);

  if (isTrusted) {
    // Validiere und setze X-Forwarded-For
    const forwardedFor = req.get('X-Forwarded-For');
    req.clientIP = extractClientIP(forwardedFor, remoteAddress);

    // Validiere und setze X-Forwarded-Proto
    const forwardedProto = req.get('X-Forwarded-Proto');
    req.protocol = validateProtocol(forwardedProto);
    req.secure = req.protocol === 'https';

    // Sanitize Headers gegen Injection
    if (forwardedFor) {
      req.headers['x-forwarded-for'] = req.clientIP;
    }
    if (forwardedProto) {
      req.headers['x-forwarded-proto'] = req.protocol;
    }

  } else {
    // Untrusted Proxy - entferne Headers
    req.clientIP = remoteAddress;
    delete req.headers['x-forwarded-for'];
    delete req.headers['x-forwarded-proto'];

    // Warning loggen
    console.warn(`[PROXY] Untrusted proxy detected: ${remoteAddress}`);
  }

  // Setze finale Werte
  req.ip = req.clientIP;
  req.realIP = req.clientIP;

  next();
}

module.exports = proxyHeaders;