/**
 * Nginx Security Headers Audit Konfiguration
 */

module.exports = {
  // Pfad zu Nginx-Konfigurationen
  nginxConfigPath: process.env.NGINX_CONFIG_PATH || '/etc/nginx',

  // Zu prüfende Security-Header
  requiredHeaders: {
    'Strict-Transport-Security': {
      priority: 'CRITICAL',
      description: 'Erzwingt HTTPS für alle Verbindungen',
      recommendation: 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;',
      enabled: true
    },
    'Content-Security-Policy': {
      priority: 'HIGH',
      description: 'Schützt vor XSS und Injection-Angriffen',
      recommendation: 'add_header Content-Security-Policy "default-src \'self\'" always;',
      enabled: true
    },
    'X-Frame-Options': {
      priority: 'HIGH',
      description: 'Verhindert Clickjacking-Attacken',
      recommendation: 'add_header X-Frame-Options "SAMEORIGIN" always;',
      enabled: true
    },
    'X-Content-Type-Options': {
      priority: 'HIGH',
      description: 'Verhindert MIME-Type-Sniffing',
      recommendation: 'add_header X-Content-Type-Options "nosniff" always;',
      enabled: true
    },
    'Referrer-Policy': {
      priority: 'MEDIUM',
      description: 'Kontrolliert Referrer-Information',
      recommendation: 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
      enabled: true
    },
    'X-XSS-Protection': {
      priority: 'MEDIUM',
      description: 'Legacy XSS-Schutz (Browser-Feature)',
      recommendation: 'add_header X-XSS-Protection "1; mode=block" always;',
      enabled: true
    },
    'Permissions-Policy': {
      priority: 'MEDIUM',
      description: 'Kontrolliert Browser-Features',
      recommendation: 'add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;',
      enabled: true
    }
  },

  // Report-Einstellungen
  report: {
    outputFormat: 'html', // 'html' oder 'json'
    includeSecureDomains: true, // Zeige auch sichere Domains
    showRecommendations: true, // Zeige Empfehlungen an
    theme: 'purple' // 'purple', 'blue', 'green'
  },

  // Ausschlüsse (Domains, die ignoriert werden)
  excludeDomains: [
    'localhost',
    '127.0.0.1',
    '_default'
  ],

  // Nur diese Domains prüfen (wenn leer: alle)
  includeDomains: [],

  // Log-Einstellungen
  logging: {
    verbose: false, // Detailliertes Logging
    timestamp: true // Zeitstempel in Logs
  }
};
