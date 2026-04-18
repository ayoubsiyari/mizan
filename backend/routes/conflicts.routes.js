// Conflict-of-interest checker: look up name/email/national_id in existing clients
// AND in cases' opponent_name fields. Returns a list of potential conflicts.
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { all } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.post('/check', asyncHandler(async (req, res) => {
  const { name, email, phone, national_id } = req.body || {};
  if (!name && !email && !national_id && !phone) {
    throw new HttpError('Provide at least one of: name, email, phone, national_id', 400);
  }

  const results = { clients: [], opponents: [], cases: [] };
  const likeName = name ? `%${name}%` : null;

  if (name || email || national_id || phone) {
    const params = [req.user.firm_id];
    const conds = [`firm_id = ?`, `deleted_at IS NULL`];
    const any = [];
    if (likeName) { any.push(`first_name || ' ' || last_name LIKE ?`); params.push(likeName); any.push(`company_name LIKE ?`); params.push(likeName); }
    if (email)       { any.push(`email = ?`);       params.push(email); }
    if (national_id) { any.push(`national_id = ?`); params.push(national_id); }
    if (phone)       { any.push(`phone = ?`);       params.push(phone); }
    conds.push(`(${any.join(' OR ')})`);
    results.clients = await all(
      `SELECT id, first_name, last_name, email, phone, national_id, company_name
       FROM clients WHERE ${conds.join(' AND ')} LIMIT 20`,
      params
    );
  }

  if (likeName) {
    results.opponents = await all(
      `SELECT id, case_number, title, opponent_name, opponent_lawyer, status
       FROM cases WHERE firm_id = ? AND deleted_at IS NULL
         AND (opponent_name LIKE ? OR opponent_lawyer LIKE ?) LIMIT 20`,
      [req.user.firm_id, likeName, likeName]
    );
  }

  const hasConflict = results.clients.length > 0 || results.opponents.length > 0;
  res.json({ success: true, data: { hasConflict, ...results } });
}));

module.exports = router;
