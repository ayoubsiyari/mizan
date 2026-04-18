const express = require('express');
const bcrypt = require('bcryptjs');
const { authRequired, requireRole } = require('../middleware/auth');
const { uuid } = require('../utils/crud');
const { run, get, all } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const config = require('../config');

const router = express.Router();
router.use(authRequired);

// Profile (alias to auth profile)
router.get('/profile', asyncHandler(async (req, res) => {
  const user = await get(`SELECT id, firm_id, username, email, first_name, last_name, phone, role, avatar_url FROM users WHERE id = ?`, [req.user.id]);
  res.json({ success: true, data: user });
}));

// Firm info
router.get('/firm', asyncHandler(async (req, res) => {
  const firm = await get(`SELECT * FROM firms WHERE id = ?`, [req.user.firm_id]);
  res.json({ success: true, data: firm });
}));

router.put('/firm', requireRole('admin'), asyncHandler(async (req, res) => {
  const allowed = ['name', 'name_ar', 'license_number', 'cr_number', 'address', 'city',
                   'postal_code', 'phone', 'email', 'website', 'logo_url', 'settings'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (sets.length === 0) {
    const firm = await get(`SELECT * FROM firms WHERE id = ?`, [req.user.firm_id]);
    return res.json({ success: true, data: firm });
  }
  params.push(req.user.firm_id);
  await run(`UPDATE firms SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  const firm = await get(`SELECT * FROM firms WHERE id = ?`, [req.user.firm_id]);
  res.json({ success: true, data: firm });
}));

// Key-value settings scoped to firm or user
function makeScope(scope) {
  return {
    list: async (req, res) => {
      const rows = await all(
        `SELECT key, value FROM settings WHERE scope = ? AND ${scope === 'firm' ? 'firm_id = ?' : 'user_id = ?'}`,
        [scope, scope === 'firm' ? req.user.firm_id : req.user.id]
      );
      const obj = {};
      for (const r of rows) {
        try { obj[r.key] = JSON.parse(r.value); } catch { obj[r.key] = r.value; }
      }
      res.json({ success: true, data: obj });
    },
    update: async (req, res) => {
      const entries = Object.entries(req.body || {});
      for (const [key, value] of entries) {
        const valStr = JSON.stringify(value);
        const ownerCol = scope === 'firm' ? 'firm_id' : 'user_id';
        const ownerVal = scope === 'firm' ? req.user.firm_id : req.user.id;
        const existing = await get(
          `SELECT id FROM settings WHERE scope = ? AND ${ownerCol} = ? AND key = ?`,
          [scope, ownerVal, key]
        );
        if (existing) {
          await run(
            `UPDATE settings SET value = ?, updated_at = datetime('now') WHERE id = ?`,
            [valStr, existing.id]
          );
        } else {
          await run(
            `INSERT INTO settings (id, ${ownerCol}, scope, key, value) VALUES (?, ?, ?, ?, ?)`,
            [uuid(), ownerVal, scope, key, valStr]
          );
        }
      }
      res.json({ success: true });
    }
  };
}

const notifScope = makeScope('user');
router.get('/notifications', asyncHandler((req, res) => notifScope.list(req, res)));
router.put('/notifications', asyncHandler((req, res) => notifScope.update(req, res)));

const appearanceScope = makeScope('user');
router.get('/appearance', asyncHandler((req, res) => appearanceScope.list(req, res)));
router.put('/appearance', asyncHandler((req, res) => appearanceScope.update(req, res)));

const securityScope = makeScope('user');
router.get('/security', asyncHandler((req, res) => securityScope.list(req, res)));
router.put('/security', asyncHandler((req, res) => securityScope.update(req, res)));

// ---- Firm users management (admin) ----
const USER_COLS = `id, username, email, first_name, last_name, phone, role, job_title,
                   nav_permissions, is_active, is_verified, last_login_at, created_at`;

router.get('/users', requireRole('admin'), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT ${USER_COLS} FROM users WHERE firm_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.post('/users', requireRole('admin'), asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, role = 'lawyer', phone,
          jobTitle, navPermissions } = req.body || {};
  if (!email || !password || !firstName || !lastName) throw new HttpError('Missing required fields', 400);
  if (password.length < config.security.passwordMinLength) throw new HttpError('Password too short', 400);
  const exists = await get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (exists) throw new HttpError('Email already used', 409);
  const id = uuid();
  const hash = await bcrypt.hash(password, config.security.bcryptRounds);
  const username = email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6);
  const navJson = Array.isArray(navPermissions) ? JSON.stringify(navPermissions) : null;
  await run(
    `INSERT INTO users (id, firm_id, username, email, password_hash, first_name, last_name,
                        phone, role, job_title, nav_permissions, is_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, req.user.firm_id, username, email, hash, firstName, lastName,
     phone || null, role, jobTitle || null, navJson]
  );
  const row = await get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]);
  res.status(201).json({ success: true, data: row });
}));

router.put('/users/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const map = {
    firstName: 'first_name', lastName: 'last_name', phone: 'phone',
    role: 'role', isActive: 'is_active', jobTitle: 'job_title',
    navPermissions: 'nav_permissions'
  };
  const sets = [];
  const params = [];
  for (const [bodyKey, col] of Object.entries(map)) {
    if (req.body[bodyKey] === undefined) continue;
    let value = req.body[bodyKey];
    if (col === 'nav_permissions') {
      value = value === null ? null : JSON.stringify(Array.isArray(value) ? value : []);
    }
    sets.push(`${col} = ?`);
    params.push(value);
  }
  if (sets.length === 0) return res.json({ success: true });
  params.push(req.params.id, req.user.firm_id);
  const r = await run(
    `UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now')
     WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    params
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

// Admin: reset another user's password
router.post('/users/:id/reset-password', requireRole('admin'), asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < config.security.passwordMinLength) {
    throw new HttpError('Password too short', 400);
  }
  const hash = await bcrypt.hash(password, config.security.bcryptRounds);
  const r = await run(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now')
     WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [hash, req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  res.json({ success: true });
}));

router.delete('/users/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw new HttpError('Cannot delete self', 400);
  const r = await run(
    `UPDATE users SET deleted_at = datetime('now'), is_active = 0
     WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  res.json({ success: true });
}));

module.exports = router;
