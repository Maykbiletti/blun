// BLUN HuggingFace GGUF Pipeline
// Search, download, verify, and register GGUF models from HuggingFace

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');

const HF_API_BASE = 'https://huggingface.co/api';
const MODELS_DIR = path.join(__dirname, '../../models');
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for download
const TIMEOUT = 60000;

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

/**
 * Search HuggingFace for GGUF models
 * @param {string} query - Search query (e.g., "qwen", "mistral", "llama")
 * @param {object} opts - Options: { limit, sort, tags, filter }
 * @returns {Promise<Array>} Array of matching models
 */
async function search(query, opts = {}) {
  const {
    limit = 20,
    sort = 'downloads',
    tags = ['gguf'],
    filter = 'models'
  } = opts;

  if (!query || typeof query !== 'string') {
    throw new Error('search: query required (string)');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);

    // Build filter params for GGUF models
    const searchParams = new URLSearchParams({
      q: query,
      type: filter,
      sort_by: sort,
      limit: limit,
      task: 'text-generation'
    });

    const url = `${HF_API_BASE}/models?${searchParams}`;
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'BLUN-HF-Pipeline/1.0' }
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`HuggingFace API ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();
    if (!Array.isArray(data)) {
      throw new Error('search: unexpected API response format');
    }

    // Filter for GGUF models and extract relevant info
    const results = data
      .filter(m => m.id && (m.tags || []).includes('gguf'))
      .map(m => ({
        modelId: m.id,
        name: m.id.split('/').pop(),
        org: m.id.split('/')[0],
        likes: m.likes || 0,
        downloads: m.downloads || 0,
        private: m.private || false,
        description: m.description || '',
        tags: m.tags || [],
        lastModified: m.lastModified || null
      }));

    return results;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('search: timeout after ' + TIMEOUT + 'ms');
    }
    throw new Error('search failed: ' + err.message);
  }
}

/**
 * Get detailed info about a HuggingFace model including GGUF files
 * @param {string} modelId - HuggingFace model ID (e.g., "bartowski/Qwen2.5-7B-Instruct-GGUF")
 * @returns {Promise<object>} Model info with available GGUF files
 */
async function getModelInfo(modelId) {
  if (!modelId || typeof modelId !== 'string') {
    throw new Error('getModelInfo: modelId required (string)');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);

    const url = `${HF_API_BASE}/models/${modelId}`;
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'BLUN-HF-Pipeline/1.0' }
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      if (resp.status === 404) {
        throw new Error('getModelInfo: model not found on HuggingFace');
      }
      throw new Error(`HuggingFace API ${resp.status}: ${resp.statusText}`);
    }

    const model = await resp.json();

    // Extract GGUF files from siblings (files list)
    const ggufFiles = (model.siblings || [])
      .filter(f => f.rfilename && f.rfilename.endsWith('.gguf'))
      .map(f => ({
        filename: f.rfilename,
        size: f.size || 0,
        url: `https://huggingface.co/${modelId}/resolve/main/${f.rfilename}`
      }));

    return {
      modelId: model.id,
      name: model.id.split('/').pop(),
      org: model.id.split('/')[0],
      description: model.description || '',
      tags: model.tags || [],
      likes: model.likes || 0,
      downloads: model.downloads || 0,
      private: model.private || false,
      createdAt: model.createdAt || null,
      lastModified: model.lastModified || null,
      ggufFiles: ggufFiles,
      fileCount: ggufFiles.length
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('getModelInfo: timeout after ' + TIMEOUT + 'ms');
    }
    throw new Error('getModelInfo failed: ' + err.message);
  }
}

/**
 * Download GGUF file from HuggingFace with progress tracking
 * @param {string} url - Download URL
 * @param {string} filename - Target filename in models dir
 * @param {function} onProgress - Progress callback: (downloaded, total) => void
 * @returns {Promise<object>} Download result with path and size
 */
async function download(url, filename, onProgress = null) {
  if (!url || typeof url !== 'string') {
    throw new Error('download: url required (string)');
  }

  if (!filename || typeof filename !== 'string') {
    throw new Error('download: filename required (string)');
  }

  const filepath = path.join(MODELS_DIR, filename);

  // Check if already exists
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    return {
      success: true,
      filepath: filepath,
      size: stats.size,
      message: 'File already exists',
      resumed: false
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3600000); // 1 hour

    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'BLUN-HF-Pipeline/1.0' },
      redirect: 'follow'
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`Download failed HTTP ${resp.status}: ${resp.statusText}`);
    }

    const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
    if (!contentLength || contentLength <= 0) {
      throw new Error('Download: content-length header missing or invalid');
    }

    let downloaded = 0;
    const writeStream = fs.createWriteStream(filepath);

    return new Promise((resolve, reject) => {
      resp.body.on('data', chunk => {
        downloaded += chunk.length;
        if (onProgress && typeof onProgress === 'function') {
          onProgress(downloaded, contentLength);
        }
      });

      resp.body.pipe(writeStream);

      writeStream.on('finish', () => {
        const stats = fs.statSync(filepath);
        resolve({
          success: true,
          filepath: filepath,
          size: stats.size,
          contentLength: contentLength,
          message: 'Download complete'
        });
      });

      writeStream.on('error', err => {
        try {
          fs.unlinkSync(filepath);
        } catch (e) {}
        reject(new Error('Download write failed: ' + err.message));
      });

      resp.body.on('error', err => {
        try {
          fs.unlinkSync(filepath);
        } catch (e) {}
        reject(new Error('Download stream failed: ' + err.message));
      });
    });
  } catch (err) {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (e) {}

    if (err.name === 'AbortError') {
      throw new Error('download: timeout after 1 hour');
    }
    throw new Error('download failed: ' + err.message);
  }
}

/**
 * Verify GGUF file integrity
 * @param {string} filepath - Path to GGUF file
 * @param {object} opts - Options: { checkHeader, computeHash }
 * @returns {Promise<object>} Verification result
 */
async function verify(filepath, opts = {}) {
  const { checkHeader = true, computeHash = false } = opts;

  if (!filepath || typeof filepath !== 'string') {
    throw new Error('verify: filepath required (string)');
  }

  if (!fs.existsSync(filepath)) {
    throw new Error(`verify: file not found at ${filepath}`);
  }

  try {
    const stats = fs.statSync(filepath);
    const filesize = stats.size;

    if (filesize < 100) {
      throw new Error('verify: file too small (likely corrupted)');
    }

    const result = {
      filepath: filepath,
      filename: path.basename(filepath),
      filesize: filesize,
      valid: true,
      checks: {
        exists: true,
        minSize: filesize >= 100,
        readable: true
      }
    };

    // Check GGUF header (first 4 bytes should be "GGUF")
    if (checkHeader) {
      const buffer = Buffer.alloc(4);
      const fd = fs.openSync(filepath, 'r');
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);

      const header = buffer.toString('utf8');
      const isGguf = header === 'GGUF';
      result.checks.ggufHeader = isGguf;

      if (!isGguf) {
        result.valid = false;
        result.error = 'Invalid GGUF header';
      }
    }

    // Compute SHA256 hash if requested
    if (computeHash) {
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filepath);

        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => {
          result.checks.sha256 = hash.digest('hex');
          resolve(result);
        });
        stream.on('error', err => {
          reject(new Error('verify: hash computation failed: ' + err.message));
        });
      });
    }

    return result;
  } catch (err) {
    throw new Error('verify failed: ' + err.message);
  }
}

/**
 * Register a GGUF model for use
 * @param {object} modelDef - Model definition with: id, name, filename, huggingface, etc.
 * @param {object} opts - Options: { override, activate }
 * @returns {Promise<object>} Registration result
 */
async function register(modelDef, opts = {}) {
  const { override = false, activate = false } = opts;

  if (!modelDef || typeof modelDef !== 'object') {
    throw new Error('register: modelDef required (object)');
  }

  const { id, name, filename, huggingface, category, maker, description, tags } = modelDef;

  if (!id || !filename) {
    throw new Error('register: modelDef must include id and filename');
  }

  const filepath = path.join(MODELS_DIR, filename);

  // Verify file exists
  if (!fs.existsSync(filepath)) {
    throw new Error(`register: file not found at ${filepath}`);
  }

  try {
    // Verify GGUF format
    const verification = await verify(filepath, { checkHeader: true, computeHash: false });
    if (!verification.valid) {
      throw new Error('register: GGUF verification failed: ' + verification.error);
    }

    const result = {
      success: true,
      modelId: id,
      filename: filename,
      filepath: filepath,
      filesize: verification.filesize,
      registered: true,
      activate: activate,
      metadata: {
        name: name || filename,
        category: category || 'general',
        maker: maker || 'unknown',
        description: description || '',
        tags: tags || [],
        huggingface: huggingface || '',
        registeredAt: new Date().toISOString(),
        fileHash: verification.checks.sha256 || null
      }
    };

    return result;
  } catch (err) {
    throw new Error('register failed: ' + err.message);
  }
}

/**
 * List downloaded GGUF models
 * @returns {Promise<Array>} Array of local GGUF files
 */
async function listLocal() {
  try {
    if (!fs.existsSync(MODELS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(MODELS_DIR);
    const ggufFiles = files.filter(f => f.endsWith('.gguf'));

    const models = ggufFiles.map(filename => {
      const filepath = path.join(MODELS_DIR, filename);
      const stats = fs.statSync(filepath);

      return {
        filename: filename,
        filepath: filepath,
        filesize: stats.size,
        fileSizeGB: (stats.size / (1024 ** 3)).toFixed(2),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
    });

    return models;
  } catch (err) {
    throw new Error('listLocal failed: ' + err.message);
  }
}

/**
 * Delete a local GGUF model file
 * @param {string} filename - Filename in models directory
 * @returns {Promise<object>} Deletion result
 */
async function deleteLocal(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('deleteLocal: filename required (string)');
  }

  if (!filename.endsWith('.gguf')) {
    throw new Error('deleteLocal: only GGUF files can be deleted');
  }

  const filepath = path.join(MODELS_DIR, filename);

  // Prevent path traversal
  if (!filepath.startsWith(MODELS_DIR)) {
    throw new Error('deleteLocal: invalid filepath');
  }

  try {
    if (!fs.existsSync(filepath)) {
      return {
        success: false,
        message: 'File not found',
        filename: filename
      };
    }

    fs.unlinkSync(filepath);

    return {
      success: true,
      message: 'File deleted',
      filename: filename,
      filepath: filepath
    };
  } catch (err) {
    throw new Error('deleteLocal failed: ' + err.message);
  }
}

module.exports = {
  search,
  getModelInfo,
  download,
  verify,
  register,
  listLocal,
  deleteLocal,
  MODELS_DIR
};
