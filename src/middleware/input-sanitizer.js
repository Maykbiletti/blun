// /root/blun/src/middleware/input-sanitizer.js
// Blockt Prompt Injection und XSS Patterns in Request-Bodies

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /<script/i
];

function inputSanitizer(req, res, next) {
  if (!req.body) return next();

  const text = JSON.stringify(req.body);

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return res.status(400).json({ error: 'blocked' });
    }
  }

  next();
}

module.exports = inputSanitizer;
