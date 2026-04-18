const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter, uuid } = require('../utils/crud');
const { run, get, all } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

// --- Timer state is stored as rows with ended_at=NULL ---
router.get('/running', asyncHandler(async (req, res) => {
  const row = await get(
    `SELECT * FROM time_entries WHERE firm_id = ? AND user_id = ? AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    [req.user.firm_id, req.user.id]
  );
  res.json({ success: true, data: row || null });
}));

router.post('/start', asyncHandler(async (req, res) => {
  const existing = await get(
    `SELECT id FROM time_entries WHERE firm_id = ? AND user_id = ? AND ended_at IS NULL AND deleted_at IS NULL`,
    [req.user.firm_id, req.user.id]
  );
  if (existing) throw new HttpError('يوجد مؤقت قيد التشغيل بالفعل', 400);
  const { case_id = null, client_id = null, task_id = null, description = '', hourly_rate = null } = req.body || {};
  if (!description) throw new HttpError('description required', 400);
  const id = uuid();
  const now = new Date().toISOString();
  await run(
    `INSERT INTO time_entries (id, firm_id, user_id, case_id, client_id, task_id, description, started_at, hourly_rate, entry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'))`,
    [id, req.user.firm_id, req.user.id, case_id, client_id, task_id, description, now, hourly_rate]
  );
  const row = await get(`SELECT * FROM time_entries WHERE id = ?`, [id]);
  res.status(201).json({ success: true, data: row });
}));

router.post('/stop', asyncHandler(async (req, res) => {
  const row = await get(
    `SELECT * FROM time_entries WHERE firm_id = ? AND user_id = ? AND ended_at IS NULL AND deleted_at IS NULL`,
    [req.user.firm_id, req.user.id]
  );
  if (!row) throw new HttpError('لا يوجد مؤقت قيد التشغيل', 400);
  const end = new Date();
  const start = new Date(row.started_at.replace(' ', 'T') + (row.started_at.includes('Z') ? '' : 'Z'));
  const mins = Math.max(1, Math.round((end - start) / 60000));
  const amount = row.hourly_rate ? (mins / 60) * row.hourly_rate : null;
  await run(
    `UPDATE time_entries SET ended_at = ?, duration_minutes = ?, amount = ?, updated_at = datetime('now') WHERE id = ?`,
    [end.toISOString(), mins, amount, row.id]
  );
  const updated = await get(`SELECT * FROM time_entries WHERE id = ?`, [row.id]);
  res.json({ success: true, data: updated });
}));

// Summary for a case / client / user
router.get('/summary', asyncHandler(async (req, res) => {
  const { case_id, client_id, user_id, from, to } = req.query;
  const params = [req.user.firm_id];
  const conds = [`firm_id = ?`, `deleted_at IS NULL`];
  if (case_id)   { conds.push('case_id = ?');   params.push(case_id); }
  if (client_id) { conds.push('client_id = ?'); params.push(client_id); }
  if (user_id)   { conds.push('user_id = ?');   params.push(user_id); }
  if (from)      { conds.push('entry_date >= ?'); params.push(from); }
  if (to)        { conds.push('entry_date <= ?'); params.push(to); }
  const row = await get(
    `SELECT COALESCE(SUM(duration_minutes), 0) AS minutes,
            COALESCE(SUM(CASE WHEN is_billable = 1 THEN duration_minutes END), 0) AS billable_minutes,
            COALESCE(SUM(CASE WHEN is_billable = 1 THEN amount END), 0) AS billable_amount,
            COUNT(*) AS entries
     FROM time_entries WHERE ${conds.join(' AND ')}`,
    params
  );
  res.json({ success: true, data: row });
}));

// Convert unbilled entries for a case/client into an invoice
router.post('/bill', asyncHandler(async (req, res) => {
  const { client_id, case_id, invoice_number, title, due_date } = req.body || {};
  if (!client_id || !invoice_number || !title || !due_date) {
    throw new HttpError('client_id, invoice_number, title, due_date required', 400);
  }
  const entries = await all(
    `SELECT * FROM time_entries
     WHERE firm_id = ? AND client_id = ? AND is_billable = 1 AND is_billed = 0 AND deleted_at IS NULL
       ${case_id ? 'AND case_id = ?' : ''}`,
    case_id ? [req.user.firm_id, client_id, case_id] : [req.user.firm_id, client_id]
  );
  if (!entries.length) throw new HttpError('لا توجد إدخالات قابلة للتحصيل', 400);

  const subtotal = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const tax = subtotal * 0.15;
  const total = subtotal + tax;
  const invoiceId = uuid();
  await run(
    `INSERT INTO invoices (id, firm_id, client_id, case_id, invoice_number, title, invoice_date, due_date,
       subtotal, tax_rate, tax_amount, total_amount, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, date('now'), ?, ?, 15, ?, ?, 'draft', ?)`,
    [invoiceId, req.user.firm_id, client_id, case_id || null, invoice_number, title, due_date,
     subtotal, tax, total, req.user.id]
  );
  for (const e of entries) {
    await run(
      `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, tax_rate, total_amount)
       VALUES (?, ?, ?, ?, ?, 15, ?)`,
      [uuid(), invoiceId, e.description, (e.duration_minutes / 60), e.hourly_rate || 0, e.amount || 0]
    );
    await run(
      `UPDATE time_entries SET is_billed = 1, invoice_id = ? WHERE id = ?`,
      [invoiceId, e.id]
    );
  }
  const invoice = await get(`SELECT * FROM invoices WHERE id = ?`, [invoiceId]);
  res.status(201).json({ success: true, data: invoice });
}));

const base = crudRouter({
  table: 'time_entries',
  allowedFields: [
    'case_id', 'client_id', 'task_id', 'description', 'started_at', 'ended_at',
    'duration_minutes', 'hourly_rate', 'amount', 'currency', 'is_billable', 'entry_date'
  ],
  searchable: ['description'],
  filterable: ['case_id', 'client_id', 'user_id', 'is_billable', 'is_billed'],
  defaultSort: 'entry_date DESC, started_at DESC',
  beforeCreate: (req, data) => ({
    ...data,
    user_id: req.user.id,
    amount: data.amount != null ? data.amount : (data.hourly_rate && data.duration_minutes ? (data.duration_minutes / 60) * data.hourly_rate : null)
  }),
  beforeUpdate: (req, data) => {
    if (data.hourly_rate != null || data.duration_minutes != null) {
      const hr = data.hourly_rate;
      const dm = data.duration_minutes;
      if (hr != null && dm != null) data.amount = (dm / 60) * hr;
    }
    return data;
  }
});
router.use('/', base);
module.exports = router;
