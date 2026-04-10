/**
 * String utility functions
 */

/**
 * Truncate string to specified length
 */
function truncate(str, n) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= n) return str;
  return str.slice(0, n) + '...';
}

/**
 * Convert string to URL-friendly slug
 */
function slugify(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces, underscores, dashes with single dash
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
}

/**
 * Capitalize first letter of string
 */
function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert string to camelCase
 */
function camelCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
}

/**
 * Convert string to snake_case
 */
function snakeCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\W+/g, ' ')
    .split(/ |\B(?=[A-Z])/)
    .map(word => word.toLowerCase())
    .filter(word => word.length > 0)
    .join('_');
}

module.exports = {
  truncate,
  slugify,
  capitalize,
  camelCase,
  snakeCase
};