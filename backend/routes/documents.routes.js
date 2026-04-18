const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authRequired } = require('../middleware/auth');
const { crudRouter, uuid } = require('../utils/crud');
const { run, get, all } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const config = require('../config');

const router = express.Router();
router.use(authRequired);

// Ensure upload dir exists
if (!fs.existsSync(config.upload.directory)) {
  fs.mkdirSync(config.upload.directory, { recursive: true });
}

// Multer decodes multipart filenames as latin1 per RFC 7578, which mangles
// UTF-8 filenames (Arabic/CJK/emoji). Re-encode to proper UTF-8.
function decodeOriginalName(file) {
  try { return Buffer.from(file.originalname, 'latin1').toString('utf8'); }
  catch { return file.originalname; }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.upload.directory),
  filename: (req, file, cb) => {
    // Fix the in-memory originalname too, so downstream code sees UTF-8.
    file.originalname = decodeOriginalName(file);
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: config.upload.maxFileSize } });

router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError('No file uploaded', 400);
  const {
    title, description, document_type = 'other', category,
    case_id = null, client_id = null, tags
  } = req.body || {};
  if (!title) throw new HttpError('title required', 400);

  const id = uuid();
  await run(
    `INSERT INTO documents (id, firm_id, case_id, client_id, title, description, document_type, category,
       file_name, file_path, file_size, file_mime_type, uploaded_by, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, req.user.firm_id, case_id, client_id, title, description || null,
      document_type, category || null,
      req.file.originalname, req.file.path, req.file.size, req.file.mimetype,
      req.user.id, tags || '[]'
    ]
  );
  const row = await get(`SELECT * FROM documents WHERE id = ?`, [id]);
  res.status(201).json({ success: true, data: row });
}));

router.get('/:id/download', asyncHandler(async (req, res) => {
  const doc = await get(
    `SELECT * FROM documents WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [req.params.id, req.user.firm_id]
  );
  if (!doc) throw new HttpError('Not Found', 404);
  if (!fs.existsSync(doc.file_path)) throw new HttpError('File missing on disk', 404);
  // Use RFC 5987 encoded filename* so non-ASCII (Arabic) names survive Content-Disposition.
  const encoded = encodeURIComponent(doc.file_name);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`
  );
  res.sendFile(path.resolve(doc.file_path));
}));

router.get('/categories', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT DISTINCT category FROM documents WHERE firm_id = ? AND category IS NOT NULL AND deleted_at IS NULL`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows.map((r) => r.category) });
}));

router.get('/templates', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM documents WHERE firm_id = ? AND category = 'template' AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

const base = crudRouter({
  table: 'documents',
  allowedFields: [
    'case_id', 'client_id', 'title', 'description', 'document_type', 'category',
    'file_name', 'file_path', 'file_size', 'file_mime_type', 'is_public',
    'tags', 'metadata'
  ],
  searchable: ['title', 'description', 'file_name'],
  filterable: ['document_type', 'category', 'case_id', 'client_id'],
  beforeCreate: (req, data) => ({ ...data, uploaded_by: req.user.id })
});

router.use('/', base);
module.exports = router;
