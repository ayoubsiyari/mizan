const express = require('express');
const { authRequired } = require('../middleware/auth');
const { all } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

async function runSearch(firmId, q, types) {
  const like = `%${q}%`;
  const results = [];

  if (!types || types.includes('clients')) {
    const rows = await all(
      `SELECT id, first_name || ' ' || last_name AS title, email, phone, 'client' AS type
       FROM clients WHERE firm_id = ? AND deleted_at IS NULL
       AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR company_name LIKE ?)
       LIMIT 10`,
      [firmId, like, like, like, like, like]
    );
    results.push(...rows);
  }
  if (!types || types.includes('cases')) {
    const rows = await all(
      `SELECT id, case_number, title, status, 'case' AS type FROM cases
       WHERE firm_id = ? AND deleted_at IS NULL
       AND (case_number LIKE ? OR title LIKE ? OR description LIKE ?) LIMIT 10`,
      [firmId, like, like, like]
    );
    results.push(...rows);
  }
  if (!types || types.includes('documents')) {
    const rows = await all(
      `SELECT id, title, category, 'document' AS type FROM documents
       WHERE firm_id = ? AND deleted_at IS NULL AND (title LIKE ? OR description LIKE ? OR file_name LIKE ?) LIMIT 10`,
      [firmId, like, like, like]
    );
    results.push(...rows);
  }
  if (!types || types.includes('notes')) {
    const rows = await all(
      `SELECT id, title, category, 'note' AS type FROM notes
       WHERE firm_id = ? AND deleted_at IS NULL AND (title LIKE ? OR content LIKE ?) LIMIT 10`,
      [firmId, like, like]
    );
    results.push(...rows);
  }
  return results;
}

router.get('/', asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ success: true, data: [] });
  const data = await runSearch(req.user.firm_id, q);
  res.json({ success: true, data });
}));

for (const kind of ['clients', 'cases', 'documents', 'notes']) {
  router.get(`/${kind}`, asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });
    const data = await runSearch(req.user.firm_id, q, [kind]);
    res.json({ success: true, data });
  }));
}

module.exports = router;
