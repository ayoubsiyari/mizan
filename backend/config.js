require('dotenv').config();
const path = require('path');

const nodeEnv = process.env.NODE_ENV || 'development';

const jwtSecret = process.env.JWT_SECRET || 'change-me-in-production';
if (nodeEnv === 'production' && (!process.env.JWT_SECRET || jwtSecret === 'change-me-in-production' || jwtSecret.length < 32)) {
  console.error('\n[FATAL] JWT_SECRET must be set to a long random string (>=32 chars) in production. Aborting.\n');
  process.exit(1);
}

module.exports = {
  nodeEnv,
  port: parseInt(process.env.PORT, 10) || 3000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8000',

  db: {
    file: process.env.DB_FILE || path.join(__dirname, '..', 'database', 'mizan.db'),
    schemaFile: path.join(__dirname, '..', 'database', 'schema.sql')
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
    rateLimitWindowMin: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH, 10) || 6
  },

  upload: {
    directory: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'assets', 'uploads'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024
  },

  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  }
};
