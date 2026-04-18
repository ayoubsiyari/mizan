const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all, run, get } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.get('/upcoming', asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
  const rows = await all(
    `SELECT * FROM deadlines
     WHERE firm_id = ? AND deleted_at IS NULL AND status = 'open'
       AND datetime(due_at) <= datetime('now', '+' || ? || ' days')
     ORDER BY due_at ASC`,
    [req.user.firm_id, days]
  );
  res.json({ success: true, data: rows });
}));

router.get('/overdue', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM deadlines
     WHERE firm_id = ? AND deleted_at IS NULL AND status = 'open'
       AND datetime(due_at) < datetime('now')
     ORDER BY due_at ASC`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.patch('/:id/complete', asyncHandler(async (req, res) => {
  const r = await run(
    `UPDATE deadlines SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND firm_id = ?`,
    [req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT * FROM deadlines WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

const base = crudRouter({
  table: 'deadlines',
  allowedFields: [
    'case_id', 'client_id', 'assigned_to', 'title', 'description', 'due_at',
    'reminder_days', 'priority', 'status'
  ],
  searchable: ['title', 'description'],
  filterable: ['status', 'priority', 'case_id', 'assigned_to'],
  defaultSort: 'due_at ASC',
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});
router.use('/', base);
module.exports = router;
