const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('../utils/crud');

const router = express.Router();
router.use(authRequired);

const base = crudRouter({
  table: 'judges',
  allowedFields: ['court_id', 'name', 'title', 'specialization', 'phone', 'email', 'notes'],
  searchable: ['name', 'title', 'specialization'],
  filterable: ['court_id', 'specialization'],
  defaultSort: 'name ASC'
});
router.use('/', base);
module.exports = router;
