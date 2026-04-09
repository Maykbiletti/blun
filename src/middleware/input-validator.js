// /root/blun/src/middleware/input-validator.js
// Request Body Validation & XSS Prevention
// Validates data types, required fields, formats, and field lengths
// Applied globally to all /api/* routes

const FIELD_VALIDATORS = {
  // Text fields
  email: (value) => {
    if (typeof value !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 255;
  },

  url: (value) => {
    if (typeof value !== 'string') return false;
    try {
      new URL(value);
      return value.length <= 2048;
    } catch {
      return false;
    }
  },

  phone: (value) => {
    if (typeof value !== 'string') return false;
    return /^[\d\s\-\+\(\)]{7,20}$/.test(value);
  },

  username: (value) => {
    if (typeof value !== 'string') return false;
    return /^[a-zA-Z0-9_-]{3,32}$/.test(value);
  },

  password: (value) => {
    if (typeof value !== 'string') return false;
    return value.length >= 8 && value.length <= 255;
  },

  text: (value, maxLength = 5000) => {
    if (typeof value !== 'string') return false;
    return value.length > 0 && value.length <= maxLength;
  },

  number: (value) => typeof value === 'number' && !isNaN(value),
  boolean: (value) => typeof value === 'boolean',
  array: (value) => Array.isArray(value),
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
};

// Validation schema definitions for common endpoints
const VALIDATION_SCHEMAS = {
  '/api/agents/create': {
    name: { type: 'text', required: true, maxLength: 255 },
    description: { type: 'text', required: false, maxLength: 1000 },
    model: { type: 'text', required: true, pattern: /^claude-(haiku|sonnet|opus)/ },
    skills: { type: 'array', required: false },
  },

  '/api/agents/update': {
    id: { type: 'text', required: true },
    name: { type: 'text', required: false, maxLength: 255 },
    description: { type: 'text', required: false, maxLength: 1000 },
    status: { type: 'text', required: false, pattern: /^(active|inactive|archived)$/ },
  },

  '/api/user/profile': {
    email: { type: 'email', required: true },
    name: { type: 'text', required: true, maxLength: 255 },
    phone: { type: 'phone', required: false },
  },

  '/api/user/password': {
    currentPassword: { type: 'password', required: true },
    newPassword: { type: 'password', required: true },
    confirmPassword: { type: 'password', required: true },
  },

  '/api/messages/send': {
    recipientId: { type: 'text', required: true },
    message: { type: 'text', required: true, maxLength: 5000 },
    attachments: { type: 'array', required: false },
  },
};

function validateField(value, fieldSchema) {
  const { type, required = false, maxLength, pattern } = fieldSchema;

  // Check if required
  if (required && (value === undefined || value === null || value === '')) {
    return { valid: false, error: 'Field is required' };
  }

  // Skip validation if not required and empty
  if (!required && (value === undefined || value === null || value === '')) {
    return { valid: true };
  }

  // Type validation
  const validator = FIELD_VALIDATORS[type];
  if (validator) {
    if (type === 'text' && maxLength) {
      if (!validator(value, maxLength)) {
        return { valid: false, error: `Invalid ${type} (max ${maxLength} chars)` };
      }
    } else if (!validator(value)) {
      return { valid: false, error: `Invalid ${type}` };
    }
  } else {
    return { valid: false, error: `Unknown type: ${type}` };
  }

  // Pattern validation (regex)
  if (pattern && typeof value === 'string') {
    if (!pattern.test(value)) {
      return { valid: false, error: `Value does not match required format` };
    }
  }

  return { valid: true };
}

function inputValidator(req, res, next) {
  // Skip validation for non-JSON requests
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  // Skip for internal/localhost requests
  const ip = req.ip || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return next();
  }

  // Limit body size to prevent DoS
  const bodySize = JSON.stringify(req.body).length;
  if (bodySize > 1048576) { // 1MB limit
    console.warn(`[SECURITY] Oversized request body (${bodySize} bytes) on ${req.method} ${req.path}`);
    return res.status(413).json({
      error: 'Request body too large',
      code: 'REQUEST_TOO_LARGE'
    });
  }

  // Check for schema validation if path has a defined schema
  const schema = VALIDATION_SCHEMAS[req.path];
  if (schema) {
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const value = req.body[fieldName];
      const validation = validateField(value, fieldSchema);

      if (!validation.valid) {
        console.warn(`[SECURITY] Validation failed for '${fieldName}' on ${req.method} ${req.path}`);
        return res.status(400).json({
          error: `Invalid ${fieldName}: ${validation.error}`,
          code: 'VALIDATION_FAILED',
          field: fieldName
        });
      }
    }
  }

  // Generic XSS checks for all string fields
  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value === 'string') {
      // Check for suspicious patterns in all text fields
      if (/<script/i.test(value) || /javascript:/i.test(value)) {
        console.warn(`[SECURITY] XSS pattern detected in '${key}' on ${req.method} ${req.path}`);
        return res.status(400).json({
          error: `Invalid characters in ${key}`,
          code: 'XSS_DETECTED',
          field: key
        });
      }

      // Check field length
      if (value.length > 10000) {
        console.warn(`[SECURITY] Field '${key}' exceeds max length on ${req.method} ${req.path}`);
        return res.status(400).json({
          error: `Field ${key} exceeds maximum length`,
          code: 'FIELD_TOO_LONG',
          field: key
        });
      }
    }
  }

  // Store validation metadata in request for downstream handlers
  req.validated = true;
  next();
}

module.exports = inputValidator;
