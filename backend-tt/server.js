const { Pool } = require('pg');
const { databaseUrlAdmin } = require('./config/config.js');

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
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await ddlPool.query(`
    CREATE TABLE IF NOT EXISTS columns (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      client_id TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await ddlPool.query(`ALTER TABLE columns DROP COLUMN IF EXISTS user_id;`);
  await ddlPool.query(`ALTER TABLE columns ADD COLUMN IF NOT EXISTS client_id TEXT;`);
  await ddlPool.query(
    `ALTER TABLE columns ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;`,
  );
  await ddlPool.query(`ALTER TABLE columns ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;`);
  await ddlPool.query(`DROP INDEX IF EXISTS columns_user_id_name_idx;`);
  await ddlPool.query(`DROP INDEX IF EXISTS columns_user_id_client_id_idx;`);
  await ddlPool.query(`DROP INDEX IF EXISTS columns_client_id_idx;`);
  await ddlPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS columns_project_id_client_id_idx
    ON columns(project_id, client_id)
    WHERE client_id IS NOT NULL;
  `);
  await ddlPool.query(`
    CREATE INDEX IF NOT EXISTS columns_project_id_position_idx
    ON columns(project_id, position);
  `);
  await ddlPool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(100) NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      stat VARCHAR(100) NOT NULL,
      priority VARCHAR(50) NOT NULL DEFAULT 'normal',
      column_id INTEGER REFERENCES columns(id) ON DELETE SET NULL,
      client_id TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      task_number INTEGER,
      customer_name TEXT,
      assignee_name TEXT,
      assignee_initials TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, id)
    );
  `);
  await ddlPool.query(`ALTER TABLE tasks ALTER COLUMN text TYPE TEXT;`);
  await ddlPool.query(`ALTER TABLE tasks ALTER COLUMN text SET DEFAULT '';`);
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_id TEXT;`);
  await ddlPool.query(
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;`,
  );
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_number INTEGER;`);
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS customer_name TEXT;`);
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT;`);
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_initials TEXT;`);
  await ddlPool.query(
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  );
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;`);
  await ddlPool.query(`DROP INDEX IF EXISTS tasks_user_id_client_id_idx;`);
  await ddlPool.query(`DROP INDEX IF EXISTS tasks_user_id_task_number_idx;`);
  await ddlPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_id_client_id_idx
    ON tasks(project_id, client_id)
    WHERE client_id IS NOT NULL;
  `);
  await ddlPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_id_task_number_idx
    ON tasks(project_id, task_number)
    WHERE task_number IS NOT NULL;
  `);
  await ddlPool.query(`
    CREATE INDEX IF NOT EXISTS tasks_project_id_position_idx
    ON tasks(project_id, position);
  `);

  await ddlPool.query(`
    CREATE TABLE IF NOT EXISTS board_state (
      id INTEGER PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      board JSONB NOT NULL,
      next_task_number INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await ddlPool.query(
    `ALTER TABLE board_state ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;`,
  );
  await ddlPool.query(`DROP INDEX IF EXISTS board_state_project_id_idx;`);
  await ddlPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS board_state_project_id_idx
    ON board_state(project_id)
    WHERE project_id IS NOT NULL;
  `);
  await ddlPool.end();
}

async function start() {
  await ensureSchema();
  // Основное API поднято в main.js
  require('./app.js');
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
