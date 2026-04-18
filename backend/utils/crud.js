// Generic CRUD route factory for firm-scoped resources with soft-delete.
const express = require('express');
const crypto = require('crypto');
const { run, get, all } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

function uuid() {
  return crypto.randomUUID();
}

function buildWhere(filters, params) {
  const clauses = [];
  for (const [col, val] of Object.entries(filters)) {
    if (val === undefined || val === null || val === '') continue;
    clauses.push(`${col} = ?`);
    params.push(val);
  }
  return clauses;
}

/**
 * Create CRUD router.
 * opts:
 *   table: 'clients'
 *   allowedFields: ['first_name','last_name',...]  -> fields accepted on create/update
 *   searchable: ['first_name','last_name','email'] -> columns for ?q=... LIKE search
 *   filterable: ['status','case_type',...]         -> columns that can be filtered via query
 *   ownership: 'firm'                               -> restrict to req.user.firm_id (default)
 *   defaultSort: 'created_at DESC'
 *   beforeCreate(req, data) -> mutate data
 *   beforeUpdate(req, data, existing) -> mutate data
 */
function crudRouter(opts) {
  const {
    table,
    allowedFields,
    searchable = [],
    filterable = [],
    defaultSort = 'created_at DESC',
    beforeCreate,
    beforeUpdate
  } = opts;

  const router = express.Router();

  const pick = (body) => {
    const out = {};
    for (const f of allowedFields) {
      if (body[f] !== undefined) out[f] = body[f];
    }
    return out;
  };

  // List
  router.get('/', asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const params = [req.user.firm_id];
    const clauses = [`firm_id = ?`, `deleted_at IS NULL`];

    for (const col of filterable) {
      if (req.query[col] !== undefined && req.query[col] !== '') {
        clauses.push(`${col} = ?`);
        params.push(req.query[col]);
      }
    }

    if (req.query.q && searchable.length) {
      const q = `%${req.query.q}%`;
      const searchClauses = searchable.map((c) => `${c} LIKE ?`);
      clauses.push(`(${searchClauses.join(' OR ')})`);
      searchable.forEach(() => params.push(q));
    }

    const where = clauses.join(' AND ');
    const totalRow = await get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params);

    const rows = await all(
      `SELECT * FROM ${table} WHERE ${where} ORDER BY ${defaultSort} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total: totalRow.n, totalPages: Math.ceil(totalRow.n / limit) }
    });
  }));

  // Get
  router.get('/:id', asyncHandler(async (req, res) => {
    const row = await get(
      `SELECT * FROM ${table} WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
      [req.params.id, req.user.firm_id]
    );
    if (!row) throw new HttpError('Not Found', 404);
    res.json({ success: true, data: row });
  }));

  // Create
  router.post('/', asyncHandler(async (req, res) => {
    let data = pick(req.body);
    if (beforeCreate) data = (await beforeCreate(req, data)) || data;

    const id = uuid();
    const cols = ['id', 'firm_id', ...Object.keys(data)];
    const vals = [id, req.user.firm_id, ...Object.values(data)];
    const placeholders = cols.map(() => '?').join(', ');

    await run(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      vals
    );

    const row = await get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.status(201).json({ success: true, data: row });
  }));

  // Update
  router.put('/:id', asyncHandler(async (req, res) => {
    const existing = await get(
      `SELECT * FROM ${table} WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
      [req.params.id, req.user.firm_id]
    );
    if (!existing) throw new HttpError('Not Found', 404);

    let data = pick(req.body);
    if (beforeUpdate) data = (await beforeUpdate(req, data, existing)) || data;
    if (Object.keys(data).length === 0) {
      return res.json({ success: true, data: existing });
    }

    const sets = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    const params = [...Object.values(data), req.params.id, req.user.firm_id];
    await run(
      `UPDATE ${table} SET ${sets}, updated_at = datetime('now') WHERE id = ? AND firm_id = ?`,
      params
    );
    const row = await get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    res.json({ success: true, data: row });
  }));

  // Soft delete
  router.delete('/:id', asyncHandler(async (req, res) => {
    const result = await run(
      `UPDATE ${table} SET deleted_at = datetime('now') WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
      [req.params.id, req.user.firm_id]
    );
    if (result.changes === 0) throw new HttpError('Not Found', 404);
    res.json({ success: true });
  }));

  return router;
}

module.exports = { crudRouter, uuid, buildWhere };
