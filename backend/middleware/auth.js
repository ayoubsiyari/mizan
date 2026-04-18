const jwt = require('jsonwebtoken');
const config = require('../config');
const { get } = require('../db');

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const payload = jwt.verify(token, config.jwt.secret);
    const user = await get(
      `SELECT id, firm_id, username, email, first_name, last_name, role, is_active
       FROM users WHERE id = ? AND deleted_at IS NULL`,
      [payload.sub]
    );
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { authRequired, requireRole };
