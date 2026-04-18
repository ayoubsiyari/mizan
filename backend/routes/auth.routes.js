const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { run, get } = require('../db');
const { authRequired } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { uuid } = require('../utils/crud');

const router = express.Router();

function signToken(user, expiresIn = config.jwt.expiresIn) {
  return jwt.sign(
    { sub: user.id, role: user.role, firm_id: user.firm_id },
    config.jwt.secret,
    { expiresIn }
  );
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

// POST /api/auth/register  -> creates a new firm + admin user (first signup)
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, firmName, phone } = req.body || {};
  if (!email || !password || !firstName || !lastName || !firmName) {
    throw new HttpError('Missing required fields: email, password, firstName, lastName, firmName', 400);
  }
  if (password.length < config.security.passwordMinLength) {
    throw new HttpError(`Password must be at least ${config.security.passwordMinLength} characters`, 400);
  }

  const existing = await get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) throw new HttpError('Email already registered', 409);

  const firmId = uuid();
  await run(
    `INSERT INTO firms (id, name, name_ar, email) VALUES (?, ?, ?, ?)`,
    [firmId, firmName, firmName, email]
  );

  const userId = uuid();
  const username = email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 6);
  const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

  await run(
    `INSERT INTO users (id, firm_id, username, email, password_hash, first_name, last_name, phone, role, is_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 1)`,
    [userId, firmId, username, email, passwordHash, firstName, lastName, phone || null]
  );

  const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
  const token = signToken(user);
  res.status(201).json({ success: true, data: { token, user: publicUser(user) } });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError('Email and password required', 400);

  const user = await get(
    `SELECT * FROM users WHERE email = ? AND deleted_at IS NULL`,
    [email]
  );
  if (!user) throw new HttpError('Invalid credentials', 401);
  if (!user.is_active) throw new HttpError('Account disabled', 403);

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError('Invalid credentials', 401);

  await run(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, [user.id]);
  const token = signToken(user);
  res.json({ success: true, data: { token, user: publicUser(user) } });
}));

// POST /api/auth/logout  (stateless JWT -> client-side token removal)
router.post('/logout', authRequired, (req, res) => {
  res.json({ success: true });
});

// POST /api/auth/refresh
router.post('/refresh', authRequired, (req, res) => {
  const token = signToken(req.user);
  res.json({ success: true, data: { token } });
});

// GET /api/auth/validate
router.get('/validate', authRequired, (req, res) => {
  res.json({ success: true, data: { user: publicUser(req.user) } });
});

// GET /api/auth/profile
router.get('/profile', authRequired, asyncHandler(async (req, res) => {
  const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  res.json({ success: true, data: publicUser(user) });
}));

// PUT /api/auth/profile
router.put('/profile', authRequired, asyncHandler(async (req, res) => {
  const allowed = ['first_name', 'last_name', 'phone', 'national_id', 'avatar_url'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    const bodyKey = key === 'first_name' ? 'firstName'
                  : key === 'last_name' ? 'lastName'
                  : key === 'national_id' ? 'nationalId'
                  : key === 'avatar_url' ? 'avatarUrl'
                  : key;
    if (req.body[bodyKey] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(req.body[bodyKey]);
    }
  }
  if (sets.length === 0) return res.json({ success: true, data: publicUser(req.user) });
  params.push(req.user.id);
  await run(`UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  res.json({ success: true, data: publicUser(user) });
}));

// POST /api/auth/change-password
router.post('/change-password', authRequired, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw new HttpError('Both passwords are required', 400);
  if (newPassword.length < config.security.passwordMinLength) {
    throw new HttpError(`Password must be at least ${config.security.passwordMinLength} characters`, 400);
  }
  const u = await get(`SELECT password_hash FROM users WHERE id = ?`, [req.user.id]);
  const ok = await bcrypt.compare(currentPassword, u.password_hash);
  if (!ok) throw new HttpError('Current password is incorrect', 401);
  const hash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
  await run(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`, [hash, req.user.id]);
  res.json({ success: true });
}));

// POST /api/auth/forgot-password  -> issues reset token (returned in dev, would be emailed in prod)
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) throw new HttpError('Email required', 400);
  const user = await get(`SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`, [email]);
  // Always respond the same to avoid user enumeration
  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await run(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      [uuid(), user.id, tokenHash, expiresAt]
    );
    const payload = { success: true };
    if (config.nodeEnv !== 'production') payload.data = { resetToken: rawToken };
    return res.json(payload);
  }
  res.json({ success: true });
}));

// POST /api/auth/reset-password
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) throw new HttpError('Token and password required', 400);
  if (password.length < config.security.passwordMinLength) {
    throw new HttpError(`Password must be at least ${config.security.passwordMinLength} characters`, 400);
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = await get(
    `SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    [tokenHash]
  );
  if (!row) throw new HttpError('Invalid or expired token', 400);
  const hash = await bcrypt.hash(password, config.security.bcryptRounds);
  await run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, row.user_id]);
  await run(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`, [row.id]);
  res.json({ success: true });
}));

module.exports = router;
