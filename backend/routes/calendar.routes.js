const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.get('/types', (req, res) => {
  res.json({
    success: true,
    data: ['meeting', 'hearing', 'deadline', 'task', 'reminder', 'other']
  });
});

async function rangeQuery(req, res, from, to) {
  const rows = await all(
    `SELECT * FROM calendar_events
     WHERE firm_id = ? AND deleted_at IS NULL AND start_time >= ? AND start_time < ?
     ORDER BY start_time ASC`,
    [req.user.firm_id, from, to]
  );
  res.json({ success: true, data: rows });
}

router.get('/month', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  const from = new Date(year, month - 1, 1).toISOString();
  const to = new Date(year, month, 1).toISOString();
  await rangeQuery(req, res, from, to);
}));

router.get('/week', asyncHandler(async (req, res) => {
  const d = new Date(req.query.date);
  const day = d.getDay();
  const start = new Date(d); start.setDate(d.getDate() - day); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 7);
  await rangeQuery(req, res, start.toISOString(), end.toISOString());
}));

router.get('/day', asyncHandler(async (req, res) => {
  const d = new Date(req.query.date); d.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setDate(d.getDate() + 1);
  await rangeQuery(req, res, d.toISOString(), end.toISOString());
}));

const base = crudRouter({
  table: 'calendar_events',
  allowedFields: [
    'user_id', 'case_id', 'client_id', 'title', 'description', 'event_type',
    'start_time', 'end_time', 'is_all_day', 'location', 'attendees', 'status',
    'priority', 'reminder_minutes'
  ],
  searchable: ['title', 'description', 'location'],
  filterable: ['event_type', 'status', 'user_id', 'case_id'],
  defaultSort: 'start_time ASC',
  beforeCreate: (req, data) => ({
    ...data,
    user_id: data.user_id || req.user.id,
    created_by: req.user.id
  })
});

router.use('/', base);
module.exports = router;
