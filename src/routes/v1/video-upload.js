const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const router = express.Router();

// Video-Upload-Konfiguration
const ALLOWED_VIDEO_FORMATS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_DURATION = 600; // 10 Minuten in Sekunden
const UPLOAD_PATH = './uploads/videos';

// Multer Storage Konfiguration
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    // Upload-Ordner erstellen falls nicht vorhanden
    try {
      await fs.mkdir(UPLOAD_PATH, { recursive: true });
      cb(null, UPLOAD_PATH);
    } catch (error) {
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    // Unique filename generieren
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `video_${uniqueId}${ext}`);
  }
});

// File Filter für Video-Formate
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ALLOWED_VIDEO_FORMATS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Ungültiges Format: ${ext}. Erlaubt: ${ALLOWED_VIDEO_FORMATS.join(', ')}`), false);
  }
};

// Multer Upload Middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  }
});

// Video-Metadaten Validator
async function validateVideoMetadata(filePath) {
  try {
    // Hier würde normalerweise ffprobe verwendet werden
    // Für jetzt: Basic File Stats
    const stats = await fs.stat(filePath);

    if (stats.size === 0) {
      throw new Error('Video-Datei ist leer');
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`Video-Datei zu groß: ${stats.size} bytes`);
    }

    // TODO: FFprobe Integration für echte Video-Metadaten
    return {
      fileSize: stats.size,
      duration: 120, // Mock-Wert
      width: 1920,   // Mock-Wert
      height: 1080,  // Mock-Wert
      format: path.extname(filePath).substring(1)
    };
  } catch (error) {
    throw new Error(`Metadaten-Validierung fehlgeschlagen: ${error.message}`);
  }
}

// S3 Upload Stub
async function uploadToS3(filePath, fileName) {
  // Mock S3 Upload - Würde normalerweise AWS SDK verwenden
  const mockS3Url = `https://blun-videos.s3.amazonaws.com/uploads/${fileName}`;

  // Simuliere Upload-Delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    url: mockS3Url,
    key: `uploads/${fileName}`,
    bucket: 'blun-videos',
    uploaded: true
  };
}

// POST /v1/video-upload
router.post('/', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Keine Video-Datei hochgeladen',
        code: 'NO_FILE'
      });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;

    // Video-Metadaten validieren
    const metadata = await validateVideoMetadata(filePath);

    // Duration Check
    if (metadata.duration > MAX_DURATION) {
      await fs.unlink(filePath); // Temporäre Datei löschen
      return res.status(400).json({
        error: `Video zu lang: ${metadata.duration}s. Maximum: ${MAX_DURATION}s`,
        code: 'VIDEO_TOO_LONG'
      });
    }

    // S3 Upload
    const s3Result = await uploadToS3(filePath, fileName);

    // Lokale Datei nach S3-Upload löschen
    await fs.unlink(filePath);

    // Video-Eintrag für Database vorbereiten
    const videoRecord = {
      id: crypto.randomUUID(),
      originalName: req.file.originalname,
      fileName: fileName,
      fileSize: metadata.fileSize,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      s3Url: s3Result.url,
      s3Key: s3Result.key,
      uploadedAt: new Date().toISOString(),
      status: 'uploaded'
    };

    // Response
    res.status(201).json({
      success: true,
      message: 'Video erfolgreich hochgeladen',
      video: videoRecord,
      processing: {
        thumbnail: `${s3Result.url.replace('.mp4', '_thumb.jpg')}`,
        preview: `${s3Result.url.replace('.mp4', '_preview.mp4')}`
      }
    });

  } catch (error) {
    console.error('Video-Upload Error:', error);

    // Cleanup bei Error
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Cleanup Error:', cleanupError);
      }
    }

    res.status(500).json({
      error: error.message || 'Video-Upload fehlgeschlagen',
      code: 'UPLOAD_ERROR'
    });
  }
});

// GET /v1/video-upload/formats
router.get('/formats', (req, res) => {
  res.json({
    allowed_formats: ALLOWED_VIDEO_FORMATS,
    max_file_size: MAX_FILE_SIZE,
    max_duration: MAX_DURATION,
    recommended: {
      format: '.mp4',
      codec: 'H.264',
      resolution: '1920x1080',
      bitrate: '5-10 Mbps'
    }
  });
});

// GET /v1/video-upload/status/:id
router.get('/status/:id', (req, res) => {
  // Mock Status Check
  const videoId = req.params.id;

  res.json({
    id: videoId,
    status: 'processing',
    progress: 75,
    stages: {
      upload: 'completed',
      thumbnail: 'processing',
      preview: 'queued',
      encoding: 'queued'
    },
    estimated_completion: new Date(Date.now() + 120000).toISOString()
  });
});

module.exports = router;