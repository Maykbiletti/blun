// /root/blun/src/middleware/input-sanitizer.js
// Enhanced Prompt Injection & XSS Protection
// Applied globally to all /api/* routes BEFORE auth

const PROMPT_INJECTION_PATTERNS = [
  // Classic jailbreak attempts
  /\bignore\s+(all\s+)?previous\b/i,
  /\bforget\s+(everything|all)\b/i,
  /\bsystem\s*prompt/i,
  /\byou\s+are\s+now\b/i,
  /\byour\s+instructions\b/i,
  /\bdisregard\s+(all|previous)\b/i,
  /\bcancel\s+previous\b/i,
  /\brole\s+play\b/i,
  /\breturn\s+to\s+original/i,
  /\bstop\s+(acting|pretending)\b/i,
  /\bremind\s+me\s+of\b/i,

  // Instruction injection
  /\[system\]/i,
  /\[assistant\]/i,
  /\[user\]/i,
  /\{\{[^}]*prompt[^}]*\}\}/i,
  /<%.*%>/,

  // Command injection
  /\$\{.*\}/,
  /`[^`]*`/,

  // Script/Code injection
  /<script[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,

  // SQL patterns (defense in depth, even though we use parameterized queries)
  /union\s+select/i,
  /select\s+\*/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /update\s+\w+\s+set/i,

  // HTML tags in sensitive fields
  /html?>/i
];

// Fields that should NOT contain HTML/code
const RESTRICTED_FIELDS = ['name', 'email', 'subject', 'title', 'message', 'body', 'prompt', 'query', 'search'];

function inputSanitizer(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  // Skip sanitizer for internal/localhost requests (agent-to-agent communication)
  var ip = req.ip || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return next();
  }

  const text = JSON.stringify(req.body);

  // Check global patterns (apply to all content)
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      console.warn(`[SECURITY] Blocked potential injection on ${req.method} ${req.path} from ${req.ip}`);
      return res.status(400).json({
        error: 'Invalid input: Detected potentially malicious pattern',
        code: 'INPUT_VALIDATION_FAILED'
      });
    }
  }

  // Additional checks for specific fields
  for (const fieldName of RESTRICTED_FIELDS) {
    const field = req.body[fieldName];
    if (field && typeof field === 'string') {
      // No HTML/script tags in text fields
      if (/<[a-z]/i.test(field)) {
        console.warn(`[SECURITY] Blocked HTML in field '${fieldName}' on ${req.method} ${req.path}`);
        return res.status(400).json({
          error: `Invalid input: HTML not allowed in '${fieldName}'`,
          code: 'HTML_NOT_ALLOWED'
        });
      }
    }
  }

  // Email fields: basic format check
  if (req.body.email && typeof req.body.email === 'string') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
      console.warn(`[SECURITY] Invalid email format on ${req.method} ${req.path}`);
      return res.status(400).json({
        error: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }
  }

  next();
}

module.exports = inputSanitizer;
