const { Pool } = require('pg');
const { databaseUrlAdmin } = require('../config/config.js');

const CREATE_TABLE_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS columns (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      client_id TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `,
  `
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
      planned_date DATE,
      duration_weeks INTEGER NOT NULL DEFAULT 0,
      duration_days INTEGER NOT NULL DEFAULT 0,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, id)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS board_state (
      id INTEGER PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      board JSONB NOT NULL,
      next_task_number INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(64) NOT NULL,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `,
];

const ALTER_TABLE_STATEMENTS = [
  `ALTER TABLE columns DROP COLUMN IF EXISTS user_id;`,
  `ALTER TABLE columns ADD COLUMN IF NOT EXISTS client_id TEXT;`,
  `ALTER TABLE columns ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;`,
  `ALTER TABLE columns ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS columns_project_id_id_idx ON columns(project_id, id);`,
  `ALTER TABLE tasks ALTER COLUMN text TYPE TEXT;`,
  `ALTER TABLE tasks ALTER COLUMN text SET DEFAULT '';`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_id TEXT;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_number INTEGER;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS customer_name TEXT;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_initials TEXT;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_date DATE;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_weeks INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE board_state ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;`,
  `UPDATE tasks t SET project_id = c.project_id FROM columns c WHERE t.column_id = c.id AND t.project_id IS NULL;`,
  `
    UPDATE tasks t
    SET column_id = NULL
    WHERE t.column_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM columns c
        WHERE c.id = t.column_id
          AND c.project_id IS NOT DISTINCT FROM t.project_id
      );
  `,
  `UPDATE tasks SET priority = 'medium' WHERE lower(priority) = 'normal';`,
  `
    UPDATE tasks
    SET priority = 'medium'
    WHERE priority IS NULL
      OR lower(priority) NOT IN ('low', 'medium', 'high');
  `,
  `ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_column_requires_project_chk;`,
  `ALTER TABLE tasks ADD CONSTRAINT tasks_column_requires_project_chk CHECK (column_id IS NULL OR project_id IS NOT NULL) NOT VALID;`,
  `ALTER TABLE tasks VALIDATE CONSTRAINT tasks_column_requires_project_chk;`,
  `ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_project_column_fk;`,
  `
    ALTER TABLE tasks
    ADD CONSTRAINT tasks_project_column_fk
    FOREIGN KEY (project_id, column_id)
    REFERENCES columns(project_id, id)
    ON DELETE SET NULL
    NOT VALID;
  `,
  `ALTER TABLE tasks VALIDATE CONSTRAINT tasks_project_column_fk;`,
  `ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`,
  `ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();`,
];

const DROP_INDEX_STATEMENTS = [
  `DROP INDEX IF EXISTS columns_user_id_name_idx;`,
  `DROP INDEX IF EXISTS columns_user_id_client_id_idx;`,
  `DROP INDEX IF EXISTS columns_client_id_idx;`,
  `DROP INDEX IF EXISTS tasks_user_id_client_id_idx;`,
  `DROP INDEX IF EXISTS tasks_user_id_task_number_idx;`,
  `DROP INDEX IF EXISTS board_state_project_id_idx;`,
  `DROP INDEX IF EXISTS activity_log_created_at_idx;`,
];

const CREATE_INDEX_STATEMENTS = [
  `
    CREATE UNIQUE INDEX IF NOT EXISTS columns_project_id_client_id_idx
    ON columns(project_id, client_id)
    WHERE client_id IS NOT NULL;
  `,
  `
    CREATE INDEX IF NOT EXISTS columns_project_id_position_idx
    ON columns(project_id, position);
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_id_client_id_idx
    ON tasks(project_id, client_id)
    WHERE client_id IS NOT NULL;
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_id_task_number_idx
    ON tasks(project_id, task_number)
    WHERE task_number IS NOT NULL;
  `,
  `
    CREATE INDEX IF NOT EXISTS tasks_project_id_position_idx
    ON tasks(project_id, position);
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS board_state_project_id_idx
    ON board_state(project_id)
    WHERE project_id IS NOT NULL;
  `,
  `
    CREATE INDEX IF NOT EXISTS activity_log_created_at_idx
    ON activity_log(created_at DESC, id DESC);
  `,
];

async function runStatements(pool, statements) {
  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function ensureSchema() {
  const ddlPool = new Pool({ connectionString: databaseUrlAdmin });
  try {
    await runStatements(ddlPool, CREATE_TABLE_STATEMENTS);
    await runStatements(ddlPool, ALTER_TABLE_STATEMENTS);
    await runStatements(ddlPool, DROP_INDEX_STATEMENTS);
    await runStatements(ddlPool, CREATE_INDEX_STATEMENTS);
  } finally {
    await ddlPool.end();
  }
}

module.exports = { ensureSchema };
