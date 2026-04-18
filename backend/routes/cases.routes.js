const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all, get, run } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.get('/:id/timeline', asyncHandler(async (req, res) => {
  const caseId = req.params.id;
  const firmId = req.user.firm_id;
  const hearings = await all(
    `SELECT 'hearing' AS kind, id, title, scheduled_at AS at FROM hearings WHERE case_id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [caseId, firmId]
  );
  const docs = await all(
    `SELECT 'document' AS kind, id, title, created_at AS at FROM documents WHERE case_id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [caseId, firmId]
  );
  const notes = await all(
    `SELECT 'note' AS kind, id, title, created_at AS at FROM notes WHERE case_id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [caseId, firmId]
  );
  const all_ = [...hearings, ...docs, ...notes].sort((a, b) => (a.at < b.at ? 1 : -1));
  res.json({ success: true, data: all_ });
}));

router.get('/:id/documents', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM documents WHERE case_id = ? AND firm_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/:id/hearings', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM hearings WHERE case_id = ? AND firm_id = ? AND deleted_at IS NULL ORDER BY scheduled_at DESC`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/:id/notes', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM notes WHERE case_id = ? AND firm_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!status) throw new HttpError('status required', 400);
  const r = await run(
    `UPDATE cases SET status = ?, updated_at = datetime('now') WHERE id = ? AND firm_id = ?`,
    [status, req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT * FROM cases WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

router.patch('/:id/assign', asyncHandler(async (req, res) => {
  const { lawyerId } = req.body || {};
  const r = await run(
    `UPDATE cases SET assigned_lawyer_id = ?, updated_at = datetime('now') WHERE id = ? AND firm_id = ?`,
    [lawyerId || null, req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT * FROM cases WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

const base = crudRouter({
  table: 'cases',
  allowedFields: [
    'client_id', 'case_number', 'title', 'description', 'case_type', 'status',
    'priority', 'assigned_lawyer_id', 'court_name', 'judge_name', 'opponent_name',
    'opponent_lawyer', 'case_value', 'currency', 'filing_date',
    'expected_resolution_date', 'actual_resolution_date', 'outcome', 'tags', 'is_confidential'
  ],
  searchable: ['case_number', 'title', 'description', 'court_name', 'opponent_name'],
  filterable: ['status', 'case_type', 'priority', 'client_id', 'assigned_lawyer_id'],
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});

router.use('/', base);
module.exports = router;
