const path = require('path');
const dotenvPath = path.resolve(__dirname, '.env');

// Load environment variables from .env located next to this file
require('dotenv').config({ path: dotenvPath });

const databaseUrlApp = process.env.DATABASE_URL_APP || process.env.DATABASE_URL;
const databaseUrlAdmin = process.env.DATABASE_URL_ADMIN || databaseUrlApp;

if (!databaseUrlApp || !databaseUrlApp.trim()) {
  throw new Error('Missing required environment variable: DATABASE_URL_APP or DATABASE_URL');
}

if (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim()) {
  throw new Error('Missing required environment variable: SESSION_SECRET');
}

const port = Number(process.env.PORT) || 7070;

module.exports = {
  databaseUrlApp: databaseUrlApp.trim(),
  databaseUrlAdmin: databaseUrlAdmin.trim(),
  sessionSecret: process.env.SESSION_SECRET.trim(),
  port,
};
