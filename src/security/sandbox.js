/**
 * Skill Sandbox — Isoliert Skill-Execution
 * Skills dürfen KEINE Zugriff auf:
 * - Database (pool, query)
 * - Redis (pub, sub)
 * - Andere Agents
 * - Dateisystem (fs, path außer temp)
 */

const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

class SkillSandbox {
  constructor(skillCode, agentId, userId, metadata = {}) {
    this.skillCode = skillCode;
    this.agentId = agentId;
    this.userId = userId;
    this.metadata = metadata;
    this.sandboxId = uuidv4();
    this.tempDir = path.join(os.tmpdir(), `skill-${this.sandboxId}`);
    this.timeout = 30000; // 30 sec max
    this.allowedModules = ['http', 'https', 'url', 'crypto', 'json'];
  }

  /**
   * Erzeugt sichere globale Objekte für den Skill
   * Input/Output nur über definierte Channels
   */
  createSafeContext() {
    return {
      // Skill-Metadaten (read-only)
      meta: Object.freeze({
        skillId: this.sandboxId,
        agentId: this.agentId,
        userId: this.userId,
        ...this.metadata
      }),

      // HTTP-Requests (whitelist)
      http: {
        fetch: async (url, options = {}) => {
          // Rate limit: max 5 requests pro Skill
          if (!this._requestCount) this._requestCount = 0;
          if (this._requestCount >= 5) {
            throw new Error('HTTP request limit exceeded');
          }
          this._requestCount++;

          // URL validation
          const allowedDomains = this.metadata.allowedDomains || [];
          try {
            const urlObj = new URL(url);
            if (allowedDomains.length && !allowedDomains.includes(urlObj.hostname)) {
              throw new Error(`Domain ${urlObj.hostname} not whitelisted`);
            }
          } catch (e) {
            throw new Error(`Invalid URL: ${url}`);
          }

          // Timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          try {
            const response = await fetch(url, {
              ...options,
              signal: controller.signal
            });
            return {
              status: response.status,
              data: await response.text()
            };
          } finally {
            clearTimeout(timeoutId);
          }
        }
      },

      // Crypto (for tokenization, hashing)
      crypto: {
        hash: (text, algo = 'sha256') => {
          const crypto = require('crypto');
          return crypto.createHash(algo).update(text).digest('hex');
        }
      },

      // Logging (safe, to sandbox)
      log: (...args) => {
        console.log(`[skill:${this.sandboxId}]`, ...args);
        return args.join(' ');
      },

      // Output channel (für Skill-Ergebnisse)
      output: {
        set: (key, value) => {
          if (!this._output) this._output = {};
          if (typeof value === 'function' || typeof value === 'object' && value.constructor === Object && Object.keys(value).some(k => typeof value[k] === 'function')) {
            throw new Error('Cannot output functions');
          }
          this._output[key] = value;
          return value;
        },
        get: (key) => this._output?.[key]
      }
    };
  }

  /**
   * Validiert Skill-Code vor Ausführung
   */
  validateCode() {
    const blockedPatterns = [
      /require\s*\(\s*['"](?!http|https|url|crypto)[^'"]+['"]\s*\)/g, // require() für modules außer whitelist
      /process\./g, // process object
      /global\./g, // global scope
      /eval\s*\(/g, // eval()
      /Function\s*\(/g, // Function constructor
      /import\s+/g, // dynamic imports
      /\$\{.*require/g, // template injection
      /fs\./g, // file system
      /path\./g, // path module
      /child_process/g, // subprocess
      /stream\./g, // streams
      /__dirname/g, // directory traversal
      /__filename/g,
      /\.\.\/\.\./g // path traversal
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(this.skillCode)) {
        throw new Error(`Blocked pattern in skill code: ${pattern}`);
      }
    }
  }

  /**
   * Führt Skill in Sandbox aus
   */
  async execute(input = {}) {
    try {
      // 1. Code validieren
      this.validateCode();

      // 2. Sichere Context erzeugen
      const safeContext = this.createSafeContext();

      // 3. Skill-Code wrappen und ausführen
      const wrappedCode = `
        (async () => {
          ${this.skillCode}
        })()
      `;

      const skillFunc = new Function('ctx', 'input', wrappedCode);

      // Timeout implementieren
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Skill execution timeout')), this.timeout)
      );

      const executePromise = Promise.resolve(skillFunc(safeContext, input));
      const result = await Promise.race([executePromise, timeoutPromise]);

      return {
        success: true,
        skillId: this.sandboxId,
        output: safeContext._output || {},
        result
      };
    } catch (error) {
      return {
        success: false,
        skillId: this.sandboxId,
        error: error.message
      };
    }
  }

  /**
   * Cleanup
   */
  async cleanup() {
    // Temp dir löschen wenn nötig
    try {
      const fs = require('fs').promises;
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  }
}

module.exports = SkillSandbox;
