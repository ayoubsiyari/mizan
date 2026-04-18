const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter, uuid } = require('../utils/crud');
const { run, get, all } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!status) throw new HttpError('status required', 400);
  const completedAt = status === 'completed' ? `, completed_at = datetime('now')` : '';
  const r = await run(
    `UPDATE tasks SET status = ?${completedAt}, updated_at = datetime('now') WHERE id = ? AND firm_id = ?`,
    [status, req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT * FROM tasks WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

router.patch('/:id/assign', asyncHandler(async (req, res) => {
  const { userId } = req.body || {};
  const r = await run(
    `UPDATE tasks SET assigned_to = ?, updated_at = datetime('now') WHERE id = ? AND firm_id = ?`,
    [userId || null, req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT * FROM tasks WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

router.get('/:id/comments', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT c.*, u.first_name, u.last_name FROM task_comments c
     JOIN users u ON u.id = c.user_id
     WHERE task_id = ? ORDER BY c.created_at ASC`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
}));

router.post('/:id/comments', asyncHandler(async (req, res) => {
  const { comment } = req.body || {};
  if (!comment) throw new HttpError('comment required', 400);
  const task = await get(
    `SELECT id FROM tasks WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [req.params.id, req.user.firm_id]
  );
  if (!task) throw new HttpError('Task not found', 404);
  const id = uuid();
  await run(
    `INSERT INTO task_comments (id, task_id, user_id, comment) VALUES (?, ?, ?, ?)`,
    [id, req.params.id, req.user.id, comment]
  );
  const row = await get(`SELECT * FROM task_comments WHERE id = ?`, [id]);
  res.status(201).json({ success: true, data: row });
}));

const base = crudRouter({
  table: 'tasks',
  allowedFields: [
    'case_id', 'client_id', 'assigned_to', 'title', 'description', 'status',
    'priority', 'due_date', 'estimated_hours', 'actual_hours', 'tags',
    'completion_percentage'
  ],
  searchable: ['title', 'description'],
  filterable: ['status', 'priority', 'assigned_to', 'case_id', 'client_id'],
  defaultSort: 'due_date ASC',
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});

router.use('/', base);
module.exports = router;
