const path = require('path');
const dotenvPath = path.resolve(__dirname, '.env');

// Load environment variables from .env located next to this file
require('dotenv').config({ path: dotenvPath });

const requiredVars = ['DATABASE_URL', 'SESSION_SECRET'];
requiredVars.forEach(key => {
  if (!process.env[key] || !process.env[key].trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const port = Number(process.env.PORT) || 7070;

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET.trim(),
  port,
};
