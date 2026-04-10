/**
 * Prompt Injection Protection Guard
 * Pattern-based filtering for malicious prompt injections
 */

const INJECTION_PATTERNS = [
  // Direct instruction overrides
  /ignore\s+(previous|prior|all)\s+(instructions|context|rules|constraints)/gi,
  /forget\s+(all\s+)?previous/gi,
  /override\s+(previous|existing)\s+(instructions|rules)/gi,
  /disregard\s+(all\s+)?(system\s+)?instructions/gi,
  /you\s+are\s+now/gi,

  // Prompt breaking patterns
  /"""[\s\S]*?"""/,
  /```[\s\S]*?```/,

  // Role switching
  /act\s+as\s+(?!yourself)/gi,
  /pretend\s+(?:you\s+)?are/gi,
  /become\s+a/gi,
  /switch\s+to\s+(?!english|german)/gi,

  // System prompt extraction
  /what\s+(?:are\s+)?your\s+(?:system\s+)?prompt/gi,
  /show\s+(?:me\s+)?(?:your\s+)?system\s+prompt/gi,
  /reveal\s+(?:your\s+)?(?:system\s+)?instructions/gi,
  /system\s+prompt/gi,

  // Jailbreak patterns
  /DAN\s+(?:prompt|jailbreak)/gi,
  /do\s+anything\s+now/gi,
  /jailbreak/gi,

  // Context injection
  /execute\s+(?:code|command)/gi,
  /run\s+(?:command|shell|script)/gi,
  /eval\s+\{/gi,

  // Logic manipulation
  /and\s+regardless\s+of/gi,
  /but\s+actually/gi,
  /however\s+instead/gi,

  // Nested injection
  /\$\{.*\}/,
  /\$\(.*\)/,
  /<!--[\s\S]*?-->/,

  // Binary encoding attempts
  /(?:base64|hex|unicode|rot13)[:\s]*/gi,
  /decode/gi,

  // SQL injection markers in context
  /union\s+select/gi,
  /';?\s*drop/gi,
];

const SEVERITY_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

class InjectionGuard {
  constructor(options = {}) {
    this.strictMode = options.strictMode !== false;
    this.logViolations = options.logViolations !== false;
    this.violationLog = [];
    this.patterns = INJECTION_PATTERNS;
    this.customPatterns = options.customPatterns || [];
  }

  /**
   * Check if text contains injection patterns
   * @param {string} text - Text to check
   * @param {string} context - Optional context (user_input, system_prompt, etc)
   * @returns {Object} - { isClean, violations, severity }
   */
  check(text, context = 'user_input') {
    if (!text || typeof text !== 'string') {
      return { isClean: true, violations: [], severity: null };
    }

    const violations = [];
    const allPatterns = [...this.patterns, ...this.customPatterns];

    for (const pattern of allPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        violations.push({
          pattern: pattern.toString(),
          matches: matches,
          context,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const severity = this._calculateSeverity(violations);
    const isClean = violations.length === 0;

    if (this.logViolations && !isClean) {
      this.violationLog.push({
        text: text.substring(0, 500),
        context,
        violations,
        severity,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      isClean,
      violations,
      severity,
    };
  }

  /**
   * Check array of inputs
   * @param {Array} items - Array of strings to check
   * @param {string} context - Context for logging
   * @returns {Object} - { allClean, results }
   */
  checkBatch(items, context = 'batch') {
    const results = items.map((item, index) =>
      this.check(item, `${context}[${index}]`)
    );

    const allClean = results.every((r) => r.isClean);

    return { allClean, results };
  }

  /**
   * Sanitize/filter dangerous content
   * @param {string} text - Text to sanitize
   * @param {boolean} removeMatches - Whether to remove or redact matches
   * @returns {string} - Sanitized text
   */
  sanitize(text, removeMatches = false) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let sanitized = text;
    const allPatterns = [...this.patterns, ...this.customPatterns];

    for (const pattern of allPatterns) {
      if (removeMatches) {
        sanitized = sanitized.replace(pattern, '');
      } else {
        sanitized = sanitized.replace(
          pattern,
          (match) => '[REDACTED]'.padEnd(match.length, '*')
        );
      }
    }

    return sanitized;
  }

  /**
   * Calculate violation severity
   * @private
   */
  _calculateSeverity(violations) {
    if (violations.length === 0) return null;

    const criticalKeywords = [
      'system prompt',
      'override',
      'ignore',
      'jailbreak',
      'DAN',
    ];
    const hasCritical = violations.some((v) =>
      criticalKeywords.some((kw) =>
        v.pattern.toLowerCase().includes(kw.toLowerCase())
      )
    );

    if (hasCritical) return SEVERITY_LEVELS.CRITICAL;
    if (violations.length > 3) return SEVERITY_LEVELS.HIGH;
    if (violations.length > 1) return SEVERITY_LEVELS.MEDIUM;
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Get violation log
   */
  getViolationLog() {
    return this.violationLog;
  }

  /**
   * Clear violation log
   */
  clearViolationLog() {
    this.violationLog = [];
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern) {
    if (pattern instanceof RegExp) {
      this.customPatterns.push(pattern);
    } else {
      this.customPatterns.push(new RegExp(pattern, 'gi'));
    }
  }

  /**
   * Middleware for Express/request handlers
   */
  middleware() {
    return (req, res, next) => {
      const textFields = [req.body?.prompt, req.body?.message, req.body?.input];
      const checkResult = this.checkBatch(
        textFields.filter(Boolean),
        'request_body'
      );

      if (!checkResult.allClean && this.strictMode) {
        return res.status(400).json({
          error: 'Invalid input detected',
          violations: checkResult.results,
        });
      }

      req.injectionGuard = {
        isClean: checkResult.allClean,
        violations: checkResult.results,
      };

      next();
    };
  }
}

module.exports = InjectionGuard;
