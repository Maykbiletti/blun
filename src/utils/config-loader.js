const fs = require('fs');
const path = require('path');

let configCache = null;
let loaded = false;

function loadConfig() {
  if (loaded) return configCache;

  configCache = {};
  loaded = true;

  const envPath = '/root/blun/.env';

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Parse KEY=VALUE
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) continue;

      const key = trimmed.slice(0, equalIndex).trim();
      const value = trimmed.slice(equalIndex + 1).trim();

      // Remove quotes if present
      let cleanValue = value;
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        cleanValue = value.slice(1, -1);
      }

      configCache[key] = cleanValue;
    }
  } catch (error) {
    // File not found or read error - use empty config
    console.warn(`Warning: Could not read ${envPath}:`, error.message);
  }

  return configCache;
}

function get(key, defaultValue = undefined) {
  const config = loadConfig();
  return config.hasOwnProperty(key) ? config[key] : defaultValue;
}

module.exports = { get };