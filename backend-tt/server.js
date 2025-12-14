const { Pool } = require('pg');
const { databaseUrlAdmin } = require('./config');

async function ensureSchema() {
  const ddlPool = new Pool({ connectionString: databaseUrlAdmin });
  await ddlPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await ddlPool.query(`
    CREATE TABLE IF NOT EXISTS columns (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, id)
    );
  `);
  await ddlPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS columns_user_id_name_idx
    ON columns(user_id, name);
  `);
  await ddlPool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(100) NOT NULL,
      text VARCHAR(100) NOT NULL,
      stat VARCHAR(100) NOT NULL,
      priority VARCHAR(50) NOT NULL DEFAULT 'normal',
      column_id INTEGER REFERENCES columns(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, id)
    );
  `);
  await ddlPool.query(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS priority VARCHAR(50) NOT NULL DEFAULT 'normal';
  `);
  await ddlPool.query(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS column_id INTEGER REFERENCES columns(id) ON DELETE SET NULL;
  `);
  await ddlPool.end();
}

async function start() {
  await ensureSchema();
  // Основное API поднято в main.js
  require('./main');
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
