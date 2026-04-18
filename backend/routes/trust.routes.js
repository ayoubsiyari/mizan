const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all, get } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

// Sign convention: deposit/refund => +amount; withdrawal/fee => -amount; adjustment => +amount (can be negative)
function balanceExpr() {
  return `COALESCE(SUM(CASE
    WHEN kind IN ('deposit','refund','adjustment') THEN amount
    WHEN kind IN ('withdrawal','fee') THEN -amount
    ELSE 0 END), 0)`;
}

// Per-client balance
router.get('/balance/:clientId', asyncHandler(async (req, res) => {
  const row = await get(
    `SELECT ${balanceExpr()} AS balance FROM trust_transactions
     WHERE firm_id = ? AND client_id = ? AND deleted_at IS NULL`,
    [req.user.firm_id, req.params.clientId]
  );
  res.json({ success: true, data: { balance: row.balance } });
}));

// Balance summary across all clients
router.get('/balances', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT c.id AS client_id, c.first_name, c.last_name,
            ${balanceExpr()} AS balance
     FROM clients c
     LEFT JOIN trust_transactions t ON t.client_id = c.id AND t.deleted_at IS NULL
     WHERE c.firm_id = ? AND c.deleted_at IS NULL
     GROUP BY c.id HAVING balance != 0 OR ${balanceExpr()} != 0
     ORDER BY balance DESC`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

// Firm-wide total
router.get('/summary', asyncHandler(async (req, res) => {
  const row = await get(
    `SELECT ${balanceExpr()} AS total_balance,
            COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount END), 0) AS total_deposits,
            COALESCE(SUM(CASE WHEN kind IN ('withdrawal','fee') THEN amount END), 0) AS total_withdrawals
     FROM trust_transactions WHERE firm_id = ? AND deleted_at IS NULL`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: row });
}));

const base = crudRouter({
  table: 'trust_transactions',
  allowedFields: [
    'client_id', 'case_id', 'kind', 'amount', 'currency', 'description',
    'reference_number', 'bank_name', 'invoice_id', 'transaction_date'
  ],
  searchable: ['description', 'reference_number'],
  filterable: ['kind', 'client_id', 'case_id'],
  defaultSort: 'transaction_date DESC, created_at DESC',
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});
router.use('/', base);
module.exports = router;
