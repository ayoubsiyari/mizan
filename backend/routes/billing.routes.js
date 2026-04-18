const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all, get, run } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { renderInvoiceHTML } = require('../utils/print');

const router = express.Router();
router.use(authRequired);

// -------- Invoices --------
const invoicesRouter = express.Router();

// Printable HTML (browser → PDF via print dialog)
invoicesRouter.get('/:id/print', asyncHandler(async (req, res) => {
  const invoice = await get(
    `SELECT i.*, cl.first_name AS client_first, cl.last_name AS client_last, cl.national_id AS client_nid,
            f.name AS firm_name, f.name_ar AS firm_name_ar, f.license_number,
            f.phone AS firm_phone, f.email AS firm_email, f.address AS firm_address
     FROM invoices i
     LEFT JOIN clients cl ON cl.id = i.client_id
     LEFT JOIN firms f ON f.id = i.firm_id
     WHERE i.id = ? AND i.firm_id = ? AND i.deleted_at IS NULL`,
    [req.params.id, req.user.firm_id]
  );
  if (!invoice) throw new HttpError('Not Found', 404);
  const items = await all(`SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at`, [req.params.id]);
  res.type('html').send(renderInvoiceHTML(invoice, items));
}));

invoicesRouter.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!status) throw new HttpError('status required', 400);
  const sentSet = status === 'sent' ? `, sent_at = datetime('now')` : '';
  const r = await run(
    `UPDATE invoices SET status = ?${sentSet}, updated_at = datetime('now')
     WHERE id = ? AND firm_id = ?`,
    [status, req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT * FROM invoices WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

const invoicesBase = crudRouter({
  table: 'invoices',
  allowedFields: [
    'client_id', 'case_id', 'invoice_number', 'title', 'description', 'invoice_date',
    'due_date', 'status', 'subtotal', 'tax_amount', 'discount_amount', 'total_amount',
    'paid_amount', 'currency', 'tax_rate', 'discount_rate', 'payment_terms', 'notes'
  ],
  searchable: ['invoice_number', 'title', 'description'],
  filterable: ['status', 'client_id', 'case_id'],
  defaultSort: 'invoice_date DESC',
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});
invoicesRouter.use('/', invoicesBase);

// -------- Payments --------
const paymentsBase = crudRouter({
  table: 'payments',
  allowedFields: [
    'invoice_id', 'client_id', 'amount', 'payment_method', 'payment_date',
    'reference_number', 'notes', 'status'
  ],
  searchable: ['reference_number', 'notes'],
  filterable: ['payment_method', 'client_id', 'invoice_id', 'status'],
  defaultSort: 'payment_date DESC',
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});

// -------- Expenses --------
const expensesBase = crudRouter({
  table: 'expenses',
  allowedFields: [
    'case_id', 'category', 'description', 'amount', 'currency', 'expense_date',
    'payment_method', 'receipt_number', 'vendor', 'notes', 'is_billable',
    'billed_to_client_id'
  ],
  searchable: ['description', 'vendor', 'category'],
  filterable: ['category', 'case_id', 'is_billable'],
  defaultSort: 'expense_date DESC',
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});

// -------- Reports --------
const reportsRouter = express.Router();

reportsRouter.get('/summary', asyncHandler(async (req, res) => {
  const firmId = req.user.firm_id;
  const invoices = await get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total,
            COALESCE(SUM(paid_amount), 0) AS paid,
            COALESCE(SUM(total_amount - paid_amount), 0) AS outstanding
     FROM invoices WHERE firm_id = ? AND deleted_at IS NULL`,
    [firmId]
  );
  const expenses = await get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
     FROM expenses WHERE firm_id = ? AND deleted_at IS NULL`,
    [firmId]
  );
  res.json({ success: true, data: { invoices, expenses } });
}));

reportsRouter.get('/monthly', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const rows = await all(
    `SELECT strftime('%m', invoice_date) AS month,
            COALESCE(SUM(paid_amount), 0) AS revenue,
            COALESCE(SUM(total_amount), 0) AS billed
     FROM invoices
     WHERE firm_id = ? AND deleted_at IS NULL AND strftime('%Y', invoice_date) = ?
     GROUP BY month ORDER BY month`,
    [req.user.firm_id, String(year)]
  );
  res.json({ success: true, data: rows });
}));

reportsRouter.get('/yearly', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT strftime('%Y', invoice_date) AS year,
            COALESCE(SUM(paid_amount), 0) AS revenue,
            COALESCE(SUM(total_amount), 0) AS billed
     FROM invoices WHERE firm_id = ? AND deleted_at IS NULL
     GROUP BY year ORDER BY year DESC`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

reportsRouter.get('/client/:clientId', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM invoices WHERE firm_id = ? AND client_id = ? AND deleted_at IS NULL
     ORDER BY invoice_date DESC`,
    [req.user.firm_id, req.params.clientId]
  );
  res.json({ success: true, data: rows });
}));

router.use('/invoices', invoicesRouter);
router.use('/payments', paymentsBase);
router.use('/expenses', expensesBase);
router.use('/reports', reportsRouter);

module.exports = router;
