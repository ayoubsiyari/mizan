const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.get('/categories', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT DISTINCT category FROM notes WHERE firm_id = ? AND category IS NOT NULL AND deleted_at IS NULL`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows.map((r) => r.category) });
}));

router.get('/tags', asyncHandler(async (req, res) => {
  // Tags are JSON arrays stored as TEXT. Return the raw union set (simple pass).
  const rows = await all(
    `SELECT tags FROM notes WHERE firm_id = ? AND deleted_at IS NULL`,
    [req.user.firm_id]
  );
  const set = new Set();
  for (const r of rows) {
    try { JSON.parse(r.tags || '[]').forEach((t) => set.add(t)); } catch {}
  }
  res.json({ success: true, data: [...set] });
}));

const base = crudRouter({
  table: 'notes',
  allowedFields: [
    'case_id', 'client_id', 'title', 'content', 'category', 'tags',
    'is_private', 'is_pinned'
  ],
  searchable: ['title', 'content'],
  filterable: ['category', 'case_id', 'client_id', 'is_pinned'],
  beforeCreate: (req, data) => ({ ...data, user_id: req.user.id })
});

router.use('/', base);
module.exports = router;
