const config = require('../config');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFound(req, res) {
  res.status(404).json({ success: false, error: 'Not Found', path: req.originalUrl });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const payload = {
    success: false,
    error: err.message || 'Internal Server Error'
  };
  if (config.nodeEnv !== 'production') payload.stack = err.stack;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json(payload);
}

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

module.exports = { asyncHandler, notFound, errorHandler, HttpError };
