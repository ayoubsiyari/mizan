// Mizan Law API + static frontend server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const db = require('./db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Security
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

// CORS
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    return cb(null, true); // Dev-friendly; tighten in prod via env-configured list
  },
  credentials: true
}));

// Rate limiter on auth endpoints
const authLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMin * 60 * 1000,
  max: config.security.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password'], authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health
app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime(), env: config.nodeEnv });
});

// Public endpoints (no auth — token-secured)
app.use('/api/public', require('./routes/public-sign.routes'));

// API routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/clients', require('./routes/clients.routes'));
app.use('/api/cases', require('./routes/cases.routes'));
app.use('/api/documents', require('./routes/documents.routes'));
app.use('/api/hearings', require('./routes/hearings.routes'));
app.use('/api/calendar', require('./routes/calendar.routes'));
app.use('/api/billing', require('./routes/billing.routes'));
app.use('/api/tasks', require('./routes/tasks.routes'));
app.use('/api/notes', require('./routes/notes.routes'));
app.use('/api/contracts', require('./routes/contracts.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/search', require('./routes/search.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/courts', require('./routes/courts.routes'));
app.use('/api/judges', require('./routes/judges.routes'));
app.use('/api/time-entries', require('./routes/time-entries.routes'));
app.use('/api/deadlines', require('./routes/deadlines.routes'));
app.use('/api/trust', require('./routes/trust.routes'));
app.use('/api/conflicts', require('./routes/conflicts.routes'));

// Static frontend (serve from project root)
const webRoot = path.resolve(__dirname, '..');
app.use(express.static(webRoot, { index: 'index.html' }));

// SPA fallback for non-/api routes
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(webRoot, 'index.html'));
});

app.use('/api', notFound);
app.use(errorHandler);

async function start() {
  await db.init();
  const reminder = require('./reminder-worker');
  reminder.start();
  app.listen(config.port, () => {
    console.log(`\n🏛️  Mizan Law server running`);
    console.log(`   API:      http://localhost:${config.port}/api`);
    console.log(`   Frontend: http://localhost:${config.port}/`);
    console.log(`   Env:      ${config.nodeEnv}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', () => { console.log('\nShutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nShutting down...'); process.exit(0); });

module.exports = app;
