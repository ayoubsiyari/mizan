const express = require('express');
const { authRequired } = require('../middleware/auth');
const { uuid } = require('../utils/crud');
const { run, get, all } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM notifications WHERE firm_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100`,
    [req.user.firm_id, req.user.id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/unread', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM notifications WHERE firm_id = ? AND user_id = ? AND is_read = 0 ORDER BY created_at DESC`,
    [req.user.firm_id, req.user.id]
  );
  res.json({ success: true, data: rows });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await run(
    `UPDATE notifications SET is_read = 1, read_at = datetime('now')
     WHERE firm_id = ? AND user_id = ? AND is_read = 0`,
    [req.user.firm_id, req.user.id]
  );
  res.json({ success: true });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const r = await run(
    `UPDATE notifications SET is_read = 1, read_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  res.json({ success: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const r = await run(
    `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  res.json({ success: true });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { title, message, type = 'info', channel = 'in_app', priority = 'medium', userId, data } = req.body || {};
  if (!title || !message) throw new HttpError('title and message required', 400);
  const id = uuid();
  await run(
    `INSERT INTO notifications (id, firm_id, user_id, title, message, type, channel, priority, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.firm_id, userId || req.user.id, title, message, type, channel, priority, JSON.stringify(data || {})]
  );
  const row = await get(`SELECT * FROM notifications WHERE id = ?`, [id]);
  res.status(201).json({ success: true, data: row });
}));

module.exports = router;
