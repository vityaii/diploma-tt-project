const path = require('path');
const dotenvPath = path.resolve(__dirname, '.env');

// Load environment variables from .env located next to this file
require('dotenv').config({ path: dotenvPath });

const databaseUrlApp = process.env.DATABASE_URL_APP || process.env.DATABASE_URL;
const databaseUrlAdmin = process.env.DATABASE_URL_ADMIN || databaseUrlApp;
const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
const jwtAccessExpires = process.env.JWT_ACCESS_EXPIRES || '15m';
const jwtRefreshExpires = process.env.JWT_REFRESH_EXPIRES || '30d';

if (!databaseUrlApp || !databaseUrlApp.trim()) {
  throw new Error('Missing required environment variable: DATABASE_URL_APP or DATABASE_URL');
}

if (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim()) {
  throw new Error('Missing required environment variable: SESSION_SECRET');
}
if (!jwtAccessSecret || !jwtAccessSecret.trim()) {
  throw new Error('Missing required environment variable: JWT_ACCESS_SECRET');
}
if (!jwtRefreshSecret || !jwtRefreshSecret.trim()) {
  throw new Error('Missing required environment variable: JWT_REFRESH_SECRET');
}

const port = Number(process.env.PORT) || 7070;

module.exports = {
  databaseUrlApp: databaseUrlApp.trim(),
  databaseUrlAdmin: databaseUrlAdmin.trim(),
  sessionSecret: process.env.SESSION_SECRET.trim(),
  jwtAccessSecret: jwtAccessSecret.trim(),
  jwtRefreshSecret: jwtRefreshSecret.trim(),
  jwtAccessExpires,
  jwtRefreshExpires,
  port,
};
