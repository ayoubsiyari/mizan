const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all, get } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

// Ensure a client belongs to the current firm (used by sub-resources)
async function ensureClient(clientId, firmId) {
  const row = await get(
    `SELECT id FROM clients WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [clientId, firmId]
  );
  if (!row) throw new HttpError('الموكل غير موجود', 404);
}

const base = crudRouter({
  table: 'clients',
  allowedFields: [
    'first_name', 'last_name', 'email', 'phone', 'national_id', 'passport_number',
    'date_of_birth', 'gender', 'address', 'city', 'postal_code', 'country',
    'company_name', 'company_cr', 'client_type', 'notes', 'tags', 'is_active'
  ],
  searchable: ['first_name', 'last_name', 'email', 'phone', 'company_name', 'national_id'],
  filterable: ['client_type', 'is_active', 'city'],
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});

// Sub-resources mounted before generic router
router.get('/:id/cases', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM cases WHERE client_id = ? AND firm_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/:id/documents', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM documents WHERE client_id = ? AND firm_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/:id/billing', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM invoices WHERE client_id = ? AND firm_id = ? AND deleted_at IS NULL ORDER BY invoice_date DESC`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/:id/payments', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT p.*, i.invoice_number, i.title AS invoice_title
     FROM payments p
     LEFT JOIN invoices i ON i.id = p.invoice_id
     WHERE p.client_id = ? AND p.firm_id = ? AND p.deleted_at IS NULL
     ORDER BY p.payment_date DESC, p.created_at DESC`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/:id/contracts', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM contracts
     WHERE client_id = ? AND firm_id = ? AND deleted_at IS NULL AND status != 'template'
     ORDER BY created_at DESC`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.get('/:id/trust', asyncHandler(async (req, res) => {
  const [txs, bal] = await Promise.all([
    all(
      `SELECT * FROM trust_transactions
       WHERE client_id = ? AND firm_id = ? AND deleted_at IS NULL
       ORDER BY transaction_date DESC, created_at DESC`,
      [req.params.id, req.user.firm_id]
    ),
    get(
      `SELECT COALESCE(SUM(CASE WHEN kind IN ('deposit','refund') THEN amount
                                WHEN kind IN ('withdrawal','fee') THEN -amount
                                ELSE amount END), 0) AS balance
       FROM trust_transactions
       WHERE client_id = ? AND firm_id = ? AND deleted_at IS NULL`,
      [req.params.id, req.user.firm_id]
    )
  ]);
  res.json({ success: true, data: { balance: bal.balance || 0, transactions: txs } });
}));

// Consolidated overview — client info + KPI counters, one call
router.get('/:id/overview', asyncHandler(async (req, res) => {
  const firm = req.user.firm_id;
  const id = req.params.id;
  const client = await get(
    `SELECT * FROM clients WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [id, firm]
  );
  if (!client) throw new HttpError('الموكل غير موجود', 404);

  const [cases, openCases, docs, contracts, inv, trust, upcomingHearings] = await Promise.all([
    get(`SELECT COUNT(*) AS c FROM cases WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    get(`SELECT COUNT(*) AS c FROM cases WHERE client_id=? AND firm_id=? AND deleted_at IS NULL AND status IN ('active','pending')`, [id, firm]),
    get(`SELECT COUNT(*) AS c FROM documents WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    get(`SELECT COUNT(*) AS c FROM contracts WHERE client_id=? AND firm_id=? AND deleted_at IS NULL AND status!='template'`, [id, firm]),
    get(`SELECT COALESCE(SUM(total_amount),0) AS billed, COALESCE(SUM(paid_amount),0) AS paid,
                COALESCE(SUM(total_amount - paid_amount),0) AS outstanding
         FROM invoices WHERE client_id=? AND firm_id=? AND deleted_at IS NULL AND status != 'cancelled'`, [id, firm]),
    get(`SELECT COALESCE(SUM(CASE WHEN kind IN ('deposit','refund') THEN amount
                                  WHEN kind IN ('withdrawal','fee') THEN -amount
                                  ELSE amount END),0) AS balance
         FROM trust_transactions WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    get(`SELECT COUNT(*) AS c FROM hearings h
         JOIN cases c ON c.id = h.case_id
         WHERE c.client_id=? AND h.firm_id=? AND h.deleted_at IS NULL
               AND h.scheduled_at >= datetime('now') AND h.status='scheduled'`, [id, firm])
  ]);

  res.json({
    success: true,
    data: {
      client,
      stats: {
        cases: cases.c,
        openCases: openCases.c,
        documents: docs.c,
        contracts: contracts.c,
        upcomingHearings: upcomingHearings.c,
        billed: inv.billed,
        paid: inv.paid,
        outstanding: inv.outstanding,
        trustBalance: trust.balance
      }
    }
  });
}));

// Unified activity timeline — cases, hearings, documents, contracts, invoices,
// payments, trust transactions, notes, deadlines (completed or missed), tasks.
router.get('/:id/timeline', asyncHandler(async (req, res) => {
  const firm = req.user.firm_id;
  const id = req.params.id;
  await ensureClient(id, firm);
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

  const [cases, hearings, docs, contracts, invoices, payments, trust, notes, deadlines, tasks] = await Promise.all([
    all(`SELECT id, case_number, title, case_type, status, created_at AS ts FROM cases
         WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    all(`SELECT h.id, h.case_id, h.title, h.hearing_type, h.scheduled_at AS ts, h.status, h.court_name, c.case_number
         FROM hearings h JOIN cases c ON c.id=h.case_id
         WHERE c.client_id=? AND h.firm_id=? AND h.deleted_at IS NULL`, [id, firm]),
    all(`SELECT id, title, document_type, file_name, case_id, created_at AS ts
         FROM documents WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    all(`SELECT id, title, contract_type, status, value, currency, created_at AS ts, signed_at
         FROM contracts WHERE client_id=? AND firm_id=? AND deleted_at IS NULL AND status!='template'`, [id, firm]),
    all(`SELECT id, invoice_number, title, total_amount, paid_amount, status, currency, invoice_date AS ts
         FROM invoices WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    all(`SELECT p.id, p.amount, p.payment_method, p.payment_date AS ts, p.reference_number,
                i.invoice_number
         FROM payments p LEFT JOIN invoices i ON i.id=p.invoice_id
         WHERE p.client_id=? AND p.firm_id=? AND p.deleted_at IS NULL`, [id, firm]),
    all(`SELECT id, kind, amount, currency, description, transaction_date AS ts
         FROM trust_transactions WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    all(`SELECT id, title, category, created_at AS ts FROM notes
         WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    all(`SELECT id, title, due_at AS ts, status, priority FROM deadlines
         WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm]),
    all(`SELECT id, title, status, due_date AS ts FROM tasks
         WHERE client_id=? AND firm_id=? AND deleted_at IS NULL`, [id, firm])
  ]);

  const events = [];
  cases.forEach((r) => events.push({ kind: 'case_opened', ts: r.ts, ref_id: r.id,
    title: `تم فتح قضية: ${r.case_number} — ${r.title}`,
    meta: { case_type: r.case_type, status: r.status } }));
  hearings.forEach((r) => events.push({ kind: 'hearing', ts: r.ts, ref_id: r.id,
    title: `جلسة ${r.hearing_type === 'initial' ? 'افتتاحية' : ''} — ${r.title || r.case_number}`,
    meta: { status: r.status, court_name: r.court_name, case_id: r.case_id } }));
  docs.forEach((r) => events.push({ kind: 'document', ts: r.ts, ref_id: r.id,
    title: `تم رفع مستند: ${r.title}`,
    meta: { document_type: r.document_type, file_name: r.file_name, case_id: r.case_id } }));
  contracts.forEach((r) => {
    events.push({ kind: 'contract_created', ts: r.ts, ref_id: r.id,
      title: `تم إنشاء عقد: ${r.title}`,
      meta: { contract_type: r.contract_type, status: r.status, value: r.value, currency: r.currency } });
    if (r.signed_at) {
      events.push({ kind: 'contract_signed', ts: r.signed_at, ref_id: r.id,
        title: `تم توقيع العقد: ${r.title}`, meta: {} });
    }
  });
  invoices.forEach((r) => events.push({ kind: 'invoice', ts: r.ts, ref_id: r.id,
    title: `فاتورة ${r.invoice_number} — ${r.title}`,
    meta: { total_amount: r.total_amount, paid_amount: r.paid_amount, status: r.status, currency: r.currency } }));
  payments.forEach((r) => events.push({ kind: 'payment', ts: r.ts, ref_id: r.id,
    title: `دفعة ${r.invoice_number ? `للفاتورة ${r.invoice_number}` : ''}`,
    meta: { amount: r.amount, payment_method: r.payment_method, reference_number: r.reference_number } }));
  trust.forEach((r) => events.push({ kind: `trust_${r.kind}`, ts: r.ts, ref_id: r.id,
    title: `حركة أمانة (${r.kind === 'deposit' ? 'إيداع' : r.kind === 'withdrawal' ? 'سحب' : r.kind === 'fee' ? 'رسوم' : r.kind === 'refund' ? 'استرجاع' : 'تسوية'})`,
    meta: { amount: r.amount, currency: r.currency, description: r.description } }));
  notes.forEach((r) => events.push({ kind: 'note', ts: r.ts, ref_id: r.id,
    title: `ملاحظة: ${r.title}`, meta: { category: r.category } }));
  deadlines.forEach((r) => events.push({ kind: 'deadline', ts: r.ts, ref_id: r.id,
    title: `موعد: ${r.title}`, meta: { status: r.status, priority: r.priority } }));
  tasks.forEach((r) => { if (r.ts) events.push({ kind: 'task', ts: r.ts, ref_id: r.id,
    title: `مهمة: ${r.title}`, meta: { status: r.status } }); });

  events.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  res.json({ success: true, data: events.slice(0, limit) });
}));

router.use('/', base);

module.exports = router;
