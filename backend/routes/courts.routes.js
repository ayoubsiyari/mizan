const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');
const { all } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.get('/:id/judges', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM judges WHERE court_id = ? AND firm_id = ? AND deleted_at IS NULL ORDER BY name`,
    [req.params.id, req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

const base = crudRouter({
  table: 'courts',
  allowedFields: ['name', 'court_type', 'city', 'address', 'phone', 'email', 'website', 'notes'],
  searchable: ['name', 'court_type', 'city', 'address'],
  filterable: ['court_type', 'city'],
  defaultSort: 'name ASC'
});
router.use('/', base);
module.exports = router;
