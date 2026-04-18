const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all, get, run } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

// Today's visitors (helper)
router.get('/today', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT v.*, u.first_name AS assigned_first, u.last_name AS assigned_last
     FROM visitors v LEFT JOIN users u ON u.id = v.assigned_to
     WHERE v.firm_id = ? AND v.deleted_at IS NULL
       AND date(v.checked_in_at) = date('now','localtime')
     ORDER BY
       CASE v.status WHEN 'waiting' THEN 0 WHEN 'in_meeting' THEN 1 ELSE 2 END,
       v.checked_in_at DESC`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const today = await get(
    `SELECT COUNT(*) AS c FROM visitors
     WHERE firm_id = ? AND deleted_at IS NULL AND date(checked_in_at) = date('now','localtime')`,
    [req.user.firm_id]
  );
  const waiting = await get(
    `SELECT COUNT(*) AS c FROM visitors
     WHERE firm_id = ? AND deleted_at IS NULL AND status = 'waiting'`,
    [req.user.firm_id]
  );
  const inMeeting = await get(
    `SELECT COUNT(*) AS c FROM visitors
     WHERE firm_id = ? AND deleted_at IS NULL AND status = 'in_meeting'`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: { today: today.c, waiting: waiting.c, inMeeting: inMeeting.c } });
}));

// Convenience transitions
router.post('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  const valid = ['waiting', 'in_meeting', 'done', 'cancelled', 'no_show'];
  if (!valid.includes(status)) throw new HttpError('Invalid status', 400);
  const setCheckout = (status === 'done' || status === 'cancelled' || status === 'no_show')
    ? `, checked_out_at = COALESCE(checked_out_at, datetime('now'))`
    : '';
  const r = await run(
    `UPDATE visitors SET status = ?${setCheckout}, updated_at = datetime('now')
     WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [status, req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Visitor not found', 404);
  res.json({ success: true });
}));

const base = crudRouter({
  table: 'visitors',
  allowedFields: [
    'client_id', 'full_name', 'phone', 'national_id', 'reason', 'assigned_to',
    'status', 'checked_in_at', 'checked_out_at', 'notes'
  ],
  searchable: ['full_name', 'phone', 'national_id', 'reason'],
  filterable: ['status', 'assigned_to', 'client_id'],
  defaultSort: 'checked_in_at DESC',
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});

router.use('/', base);

module.exports = router;
