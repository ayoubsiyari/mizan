const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

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

router.use('/', base);

module.exports = router;
