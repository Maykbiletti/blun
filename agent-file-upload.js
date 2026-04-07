'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/agent-uploads';
const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || '/tmp/agent-uploads/thumbnails';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10); // 10 MB
const UPLOAD_API_PORT = parseInt(process.env.UPLOAD_API_PORT || '3840', 10);
const THUMB_WIDTH = parseInt(process.env.THUMB_WIDTH || '200', 10);
const THUMB_HEIGHT = parseInt(process.env.THUMB_HEIGHT || '200', 10);
const THUMB_QUALITY = parseInt(process.env.THUMB_QUALITY || '80', 10);
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:4200').split(',');

const ALLOWED_IMAGES = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico']);
const ALLOWED_DOCS = new Set(['.pdf', '.txt', '.md', '.json', '.csv', '.xml', '.html', '.log', '.yaml', '.yml', '.toml']);
const ALLOWED_EXTENSIONS = new Set([...ALLOWED_IMAGES, ...ALLOWED_DOCS]);

const MIME_MAP = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
  '.json': 'application/json', '.csv': 'text/csv', '.xml': 'application/xml',
  '.html': 'text/html', '.log': 'text/plain', '.yaml': 'application/yaml',
  '.yml': 'application/yaml', '.toml': 'application/toml',
};

// ---------------------------------------------------------------------------
// DB Init
// ---------------------------------------------------------------------------
async function initUploadDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_uploads (
      id            SERIAL PRIMARY KEY,
      file_id       VARCHAR(64) UNIQUE NOT NULL,
      agent_id      VARCHAR(100) NOT NULL,
      original_name VARCHAR(500) NOT NULL,
      stored_name   VARCHAR(200) NOT NULL,
      extension     VARCHAR(20) NOT NULL,
      mime_type     VARCHAR(100) NOT NULL,
      file_size     INTEGER NOT NULL,
      file_hash     VARCHAR(128) NOT NULL,
      category      VARCHAR(20) NOT NULL DEFAULT 'document',
      context       TEXT,
      tags          JSONB DEFAULT '[]',
      linked_to_memory BOOLEAN DEFAULT false,
      memory_ref    VARCHAR(200),
      uploaded_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_memory_attachments (
      id          SERIAL PRIMARY KEY,
      agent_id    VARCHAR(100) NOT NULL,
      file_id     VARCHAR(64) NOT NULL REFERENCES agent_uploads(file_id),
      memory_key  VARCHAR(200) NOT NULL,
      description TEXT,
      attached_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_uploads_agent ON agent_uploads (agent_id, uploaded_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_uploads_category ON agent_uploads (category, uploaded_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_uploads_hash ON agent_uploads (file_hash)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_memory_attach_agent ON agent_memory_attachments (agent_id, attached_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_memory_attach_file ON agent_memory_attachments (file_id)`);

  // Thumbnail column
  await pool.query(`ALTER TABLE agent_uploads ADD COLUMN IF NOT EXISTS has_thumbnail BOOLEAN DEFAULT false`);

  // Ensure upload + thumbnail directories exist
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

  if (!sharp) {
    console.warn('[FileUpload] WARNUNG: sharp nicht installiert — Thumbnails deaktiviert. Installieren mit: npm i sharp');
  }
}

// ---------------------------------------------------------------------------
// Multipart Parser (zero-dependency)
// ---------------------------------------------------------------------------
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);
    if (!boundaryMatch) return reject(new Error('No multipart boundary found'));

    const boundary = boundaryMatch[1];
    const chunks = [];
    let totalSize = 0;

    req.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE + 4096) {
        req.destroy();
        return reject(new Error(`File exceeds maximum size of ${MAX_FILE_SIZE} bytes`));
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const parts = extractParts(buffer, boundary);
        resolve(parts);
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

function extractParts(buffer, boundary) {
  const results = { fields: {}, file: null };
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(buffer, boundaryBuf);

  for (const part of parts) {
    const headerEnd = findDoubleCRLF(part);
    if (headerEnd < 0) continue;

    const headerStr = part.slice(0, headerEnd).toString('utf-8');
    const body = part.slice(headerEnd + 4); // skip \r\n\r\n

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    if (filenameMatch) {
      // Trim trailing \r\n from body
      let fileBody = body;
      if (fileBody.length >= 2 && fileBody[fileBody.length - 2] === 0x0d && fileBody[fileBody.length - 1] === 0x0a) {
        fileBody = fileBody.slice(0, fileBody.length - 2);
      }
      results.file = {
        fieldName,
        originalName: filenameMatch[1],
        buffer: fileBody,
        size: fileBody.length,
      };
    } else {
      let val = body.toString('utf-8').trim();
      if (val.endsWith('\r\n')) val = val.slice(0, -2);
      results.fields[fieldName] = val;
    }
  }

  return results;
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  while (start < buffer.length) {
    const idx = buffer.indexOf(delimiter, start);
    if (idx < 0) {
      parts.push(buffer.slice(start));
      break;
    }
    if (idx > start) parts.push(buffer.slice(start, idx));
    start = idx + delimiter.length;
  }
  return parts;
}

function findDoubleCRLF(buffer) {
  for (let i = 0; i < buffer.length - 3; i++) {
    if (buffer[i] === 0x0d && buffer[i + 1] === 0x0a && buffer[i + 2] === 0x0d && buffer[i + 3] === 0x0a) {
      return i;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateFileId() {
  return crypto.randomBytes(16).toString('hex');
}

function hashFile(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function categorize(ext) {
  return ALLOWED_IMAGES.has(ext) ? 'image' : 'document';
}

function sanitizeFilename(name) {
  // Strip path components — only keep the basename
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function validateFile(originalName, buffer) {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Dateityp '${ext}' nicht erlaubt. Erlaubt: ${[...ALLOWED_EXTENSIONS].join(', ')}` };
  }
  if (buffer.length > MAX_FILE_SIZE) {
    return { ok: false, error: `Datei zu gross: ${(buffer.length / 1048576).toFixed(2)} MB (Max: ${(MAX_FILE_SIZE / 1048576).toFixed(0)} MB)` };
  }
  if (buffer.length === 0) {
    return { ok: false, error: 'Leere Datei' };
  }
  // Basic magic-byte check for images
  if (ALLOWED_IMAGES.has(ext)) {
    const valid = validateImageMagic(ext, buffer);
    if (!valid) {
      return { ok: false, error: `Datei-Inhalt passt nicht zur Endung '${ext}'` };
    }
  }
  return { ok: true, ext, mime: MIME_MAP[ext] || 'application/octet-stream', category: categorize(ext) };
}

function validateImageMagic(ext, buffer) {
  if (buffer.length < 4) return false;
  const head = buffer.slice(0, 8);
  switch (ext) {
    case '.png': return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    case '.jpg': case '.jpeg': return head[0] === 0xff && head[1] === 0xd8;
    case '.gif': return head.toString('ascii', 0, 3) === 'GIF';
    case '.webp': return head.toString('ascii', 0, 4) === 'RIFF' && buffer.length > 11 && buffer.toString('ascii', 8, 12) === 'WEBP';
    case '.bmp': return head[0] === 0x42 && head[1] === 0x4d;
    case '.svg': return buffer.toString('utf-8', 0, Math.min(200, buffer.length)).includes('<svg');
    case '.ico': return (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01 && head[3] === 0x00);
    default: return true;
  }
}

// ---------------------------------------------------------------------------
// Thumbnail Generation
// ---------------------------------------------------------------------------
const THUMBABLE = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

async function generateThumbnail(fileId, storedName, ext) {
  if (!sharp || !THUMBABLE.has(ext)) return false;
  try {
    const srcPath = path.join(UPLOAD_DIR, storedName);
    const thumbName = `thumb_${fileId}.webp`;
    const thumbPath = path.join(THUMBNAIL_DIR, thumbName);

    await sharp(srcPath)
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: THUMB_QUALITY })
      .toFile(thumbPath);

    return true;
  } catch (err) {
    console.error(`[Thumbnail] Fehler fuer ${fileId}:`, err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// CORS Middleware (fuer Fritz' Frontend)
// ---------------------------------------------------------------------------
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin && FRONTEND_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (FRONTEND_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function createRouter(pool) {
  const router = express.Router();
  router.use(corsMiddleware);

  // ---- POST /upload — Datei hochladen -----------------------------------
  router.post('/upload', async (req, res) => {
    try {
      const parsed = await parseMultipart(req);
      if (!parsed.file) {
        return res.status(400).json({ error: 'Keine Datei im Request' });
      }

      const agentId = parsed.fields.agent_id;
      if (!agentId) {
        return res.status(400).json({ error: 'agent_id ist Pflichtfeld' });
      }

      const originalName = sanitizeFilename(parsed.file.originalName);
      const buffer = parsed.file.buffer;
      const validation = validateFile(originalName, buffer);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      // Duplicate check via hash
      const fileHash = hashFile(buffer);
      const dupCheck = await pool.query(
        'SELECT file_id, original_name FROM agent_uploads WHERE file_hash = $1 AND agent_id = $2',
        [fileHash, agentId]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({
          error: 'Datei existiert bereits',
          existing: { file_id: dupCheck.rows[0].file_id, original_name: dupCheck.rows[0].original_name }
        });
      }

      const fileId = generateFileId();
      const storedName = `${fileId}${validation.ext}`;
      const filePath = path.join(UPLOAD_DIR, storedName);

      // Write to disk
      fs.writeFileSync(filePath, buffer);

      // DB insert
      const context = parsed.fields.context || null;
      let tags = [];
      if (parsed.fields.tags) {
        try { tags = JSON.parse(parsed.fields.tags); } catch { return res.status(400).json({ error: 'tags muss gueltiges JSON-Array sein' }); }
        if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags muss ein Array sein' });
      }

      // Generate thumbnail for images (async, non-blocking)
      const hasThumbnail = await generateThumbnail(fileId, storedName, validation.ext);

      await pool.query(`
        INSERT INTO agent_uploads (file_id, agent_id, original_name, stored_name, extension, mime_type, file_size, file_hash, category, context, tags, has_thumbnail)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [fileId, agentId, originalName, storedName, validation.ext, validation.mime, buffer.length, fileHash, validation.category, context, JSON.stringify(tags), hasThumbnail]);

      res.status(201).json({
        file_id: fileId,
        original_name: originalName,
        stored_name: storedName,
        mime_type: validation.mime,
        category: validation.category,
        size: buffer.length,
        size_human: `${(buffer.length / 1024).toFixed(1)} KB`,
        has_thumbnail: hasThumbnail,
        thumbnail_url: hasThumbnail ? `/api/chat/thumbnail/${fileId}` : null,
      });
    } catch (err) {
      if (err.message.includes('maximum size')) {
        return res.status(413).json({ error: err.message });
      }
      console.error('[Upload] Error:', err.message);
      res.status(500).json({ error: 'Upload fehlgeschlagen' });
    }
  });

  // ---- POST /attach-to-memory — Datei an Agent-Memory anhaengen --------
  router.post('/attach-to-memory', express.json(), async (req, res) => {
    try {
      const { agent_id, file_id, memory_key, description } = req.body;
      if (!agent_id || !file_id || !memory_key) {
        return res.status(400).json({ error: 'agent_id, file_id und memory_key sind Pflichtfelder' });
      }

      // Verify file exists
      const fileCheck = await pool.query('SELECT id FROM agent_uploads WHERE file_id = $1 AND agent_id = $2', [file_id, agent_id]);
      if (fileCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Datei nicht gefunden' });
      }

      await pool.query(`
        INSERT INTO agent_memory_attachments (agent_id, file_id, memory_key, description)
        VALUES ($1, $2, $3, $4)
      `, [agent_id, file_id, memory_key, description || null]);

      await pool.query('UPDATE agent_uploads SET linked_to_memory = true, memory_ref = $1 WHERE file_id = $2', [memory_key, file_id]);

      res.json({ status: 'attached', file_id, memory_key });
    } catch (err) {
      console.error('[AttachMemory] Error:', err.message);
      res.status(500).json({ error: 'Verknuepfung fehlgeschlagen' });
    }
  });

  // ---- GET /files/:agentId — Alle Dateien eines Agents -------------------
  router.get('/files/:agentId', async (req, res) => {
    try {
      const { category } = req.query;
      let query = `
        SELECT file_id, original_name, extension, mime_type, file_size, category, context, tags,
               linked_to_memory, memory_ref, uploaded_at
        FROM agent_uploads WHERE agent_id = $1
      `;
      const params = [req.params.agentId];

      if (category) {
        query += ' AND category = $2';
        params.push(category);
      }

      query += ' ORDER BY uploaded_at DESC';

      const { rows } = await pool.query(query, params);
      res.json({ agent_id: req.params.agentId, count: rows.length, files: rows });
    } catch (err) {
      console.error('[ListFiles] Error:', err.message);
      res.status(500).json({ error: 'Abfrage fehlgeschlagen' });
    }
  });

  // ---- GET /file/:fileId — Einzelne Datei-Info ---------------------------
  router.get('/file/:fileId', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT u.*, array_agg(json_build_object('memory_key', m.memory_key, 'description', m.description, 'attached_at', m.attached_at))
               FILTER (WHERE m.id IS NOT NULL) AS memory_links
        FROM agent_uploads u
        LEFT JOIN agent_memory_attachments m ON m.file_id = u.file_id
        WHERE u.file_id = $1
        GROUP BY u.id
      `, [req.params.fileId]);

      if (rows.length === 0) return res.status(404).json({ error: 'Datei nicht gefunden' });
      res.json(rows[0]);
    } catch (err) {
      console.error('[FileInfo] Error:', err.message);
      res.status(500).json({ error: 'Abfrage fehlgeschlagen' });
    }
  });

  // ---- GET /download/:fileId — Datei herunterladen -----------------------
  router.get('/download/:fileId', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT stored_name, original_name, mime_type FROM agent_uploads WHERE file_id = $1',
        [req.params.fileId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Datei nicht gefunden' });

      const filePath = path.join(UPLOAD_DIR, rows[0].stored_name);
      if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'Datei auf Disk nicht gefunden' });

      res.setHeader('Content-Type', rows[0].mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${rows[0].original_name}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error('[Download] Error:', err.message);
      res.status(500).json({ error: 'Download fehlgeschlagen' });
    }
  });

  // ---- GET /memory/:agentId — Memory-Attachments eines Agents ------------
  router.get('/memory/:agentId', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT m.memory_key, m.description, m.attached_at,
               u.file_id, u.original_name, u.category, u.mime_type, u.file_size
        FROM agent_memory_attachments m
        JOIN agent_uploads u ON u.file_id = m.file_id
        WHERE m.agent_id = $1
        ORDER BY m.attached_at DESC
      `, [req.params.agentId]);

      res.json({ agent_id: req.params.agentId, count: rows.length, attachments: rows });
    } catch (err) {
      console.error('[MemoryAttach] Error:', err.message);
      res.status(500).json({ error: 'Abfrage fehlgeschlagen' });
    }
  });

  // ---- DELETE /file/:fileId — Datei loeschen -----------------------------
  router.delete('/file/:fileId', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT stored_name FROM agent_uploads WHERE file_id = $1', [req.params.fileId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Datei nicht gefunden' });

      // Delete from disk
      const filePath = path.join(UPLOAD_DIR, rows[0].stored_name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      // Delete from DB
      await pool.query('DELETE FROM agent_memory_attachments WHERE file_id = $1', [req.params.fileId]);
      await pool.query('DELETE FROM agent_uploads WHERE file_id = $1', [req.params.fileId]);

      res.json({ status: 'deleted', file_id: req.params.fileId });
    } catch (err) {
      console.error('[DeleteFile] Error:', err.message);
      res.status(500).json({ error: 'Loeschen fehlgeschlagen' });
    }
  });

  // ---- GET /thumbnail/:fileId — Thumbnail herunterladen ------------------
  router.get('/thumbnail/:fileId', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT file_id, has_thumbnail, original_name FROM agent_uploads WHERE file_id = $1',
        [req.params.fileId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Datei nicht gefunden' });
      if (!rows[0].has_thumbnail) return res.status(404).json({ error: 'Kein Thumbnail vorhanden' });

      const thumbPath = path.join(THUMBNAIL_DIR, `thumb_${req.params.fileId}.webp`);
      if (!fs.existsSync(thumbPath)) return res.status(410).json({ error: 'Thumbnail auf Disk nicht gefunden' });

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      fs.createReadStream(thumbPath).pipe(res);
    } catch (err) {
      console.error('[Thumbnail] Error:', err.message);
      res.status(500).json({ error: 'Thumbnail-Abfrage fehlgeschlagen' });
    }
  });

  // ---- GET /stats — Upload-Statistiken -----------------------------------
  router.get('/stats', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) AS total_files,
          COALESCE(SUM(file_size), 0) AS total_bytes,
          COUNT(*) FILTER (WHERE category = 'image') AS images,
          COUNT(*) FILTER (WHERE category = 'document') AS documents,
          COUNT(*) FILTER (WHERE linked_to_memory = true) AS linked_to_memory,
          COUNT(*) FILTER (WHERE uploaded_at > NOW() - INTERVAL '24 hours') AS last_24h,
          COUNT(*) FILTER (WHERE has_thumbnail = true) AS with_thumbnails
        FROM agent_uploads
      `);

      const stats = rows[0];
      stats.total_human = `${(parseInt(stats.total_bytes) / 1048576).toFixed(2)} MB`;
      res.json(stats);
    } catch (err) {
      console.error('[Stats] Error:', err.message);
      res.status(500).json({ error: 'Stats fehlgeschlagen' });
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Standalone Server
// ---------------------------------------------------------------------------
if (require.main === module) {
  const { Pool } = require('pg');
  const pool = new Pool(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { host: '/var/run/postgresql', database: 'blun_agents', user: process.env.USER || 'root' }
  );

  const app = express();

  initUploadDb(pool).then(() => {
    app.use('/api/chat', createRouter(pool));

    app.listen(UPLOAD_API_PORT, () => {
      console.log(`[FileUpload] Server laeuft auf Port ${UPLOAD_API_PORT}`);
      console.log(`[FileUpload] Upload-Dir: ${UPLOAD_DIR}`);
      console.log(`[FileUpload] Thumbnail-Dir: ${THUMBNAIL_DIR}`);
      console.log(`[FileUpload] Max Size: ${(MAX_FILE_SIZE / 1048576).toFixed(0)} MB`);
      console.log(`[FileUpload] Thumbnails: ${sharp ? `aktiv (${THUMB_WIDTH}x${THUMB_HEIGHT}, WebP Q${THUMB_QUALITY})` : 'DEAKTIVIERT (npm i sharp)'}`);
      console.log(`[FileUpload] CORS Origins: ${FRONTEND_ORIGINS.join(', ')}`);
      console.log(`[FileUpload] Erlaubte Typen: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
    });
  }).catch(err => {
    console.error('[FileUpload] Init fehlgeschlagen:', err.message);
    process.exit(1);
  });
}

module.exports = { createRouter, initUploadDb };
