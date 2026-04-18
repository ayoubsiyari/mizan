const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all, run, get } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.get('/upcoming', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM hearings WHERE firm_id = ? AND deleted_at IS NULL
       AND scheduled_at >= datetime('now') AND status IN ('scheduled')
     ORDER BY scheduled_at ASC LIMIT 20`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/today', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM hearings WHERE firm_id = ? AND deleted_at IS NULL
       AND date(scheduled_at) = date('now') ORDER BY scheduled_at ASC`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/calendar', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const params = [req.user.firm_id];
  let where = `firm_id = ? AND deleted_at IS NULL`;
  if (from) { where += ` AND scheduled_at >= ?`; params.push(from); }
  if (to)   { where += ` AND scheduled_at <= ?`; params.push(to); }
  const rows = await all(`SELECT * FROM hearings WHERE ${where} ORDER BY scheduled_at ASC`, params);
  res.json({ success: true, data: rows });
}));

router.post('/:id/reschedule', asyncHandler(async (req, res) => {
  const { scheduledAt } = req.body || {};
  if (!scheduledAt) throw new HttpError('scheduledAt required', 400);
  const r = await run(
    `UPDATE hearings SET scheduled_at = ?, status = 'scheduled', updated_at = datetime('now')
     WHERE id = ? AND firm_id = ?`,
    [scheduledAt, req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT * FROM hearings WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

const base = crudRouter({
  table: 'hearings',
  allowedFields: [
    'case_id', 'hearing_type', 'title', 'description', 'scheduled_at', 'duration',
    'court_name', 'court_room', 'judge_name', 'status', 'outcome', 'next_hearing_id', 'notes'
  ],
  searchable: ['title', 'court_name', 'judge_name'],
  filterable: ['hearing_type', 'status', 'case_id'],
  defaultSort: 'scheduled_at DESC',
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});
router.use('/', base);
module.exports = router;
