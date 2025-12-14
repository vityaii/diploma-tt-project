const { Pool } = require('pg');
const { databaseUrlAdmin } = require('./config');

const seedBoardState = {
  columns: [
    { id: 'todo', title: 'To Do', cardIds: ['1', '2'] },
    { id: 'inprogress', title: 'In Progress', cardIds: ['3'] },
    { id: 'review', title: 'Review', cardIds: ['4'] },
    { id: 'done', title: 'Done', cardIds: [] },
  ],
  cards: {
    '1': {
      id: '1',
      taskNumber: 44137,
      title: 'Login page UI',
      customer: { name: 'Acme Inc.' },
      description:
        'Make the login screen match the design system (spacing, typography, error states). Add loading state and basic validation.',
      tags: ['auth', 'ui'],
      priority: 'High',
      assignee: { name: 'Viktor', initials: 'VN' },
    },
    '2': {
      id: '2',
      taskNumber: 44138,
      title: 'Create Kanban layout',
      customer: { name: 'Internal' },
      description:
        'Implement kanban page layout with columns, cards and header actions. Keep visuals consistent with the overall app theme.',
      tags: ['ui'],
      priority: 'Medium',
      assignee: { name: 'Alex', initials: 'A' },
    },
    '3': {
      id: '3',
      taskNumber: 44139,
      title: 'Define API contract for tasks',
      customer: { name: 'Backend team' },
      description:
        'Define the REST contract: list/create/update tasks, status transitions, and assignee metadata. Document in OpenAPI format.',
      tags: ['api', 'backend'],
      priority: 'Low',
      assignee: { name: 'Nikita', initials: 'N' },
    },
    '4': {
      id: '4',
      taskNumber: 44140,
      title: 'Card details modal draft',
      customer: { name: 'Acme Inc.' },
      description:
        'Draft details view: customer, assignee, editable description, and action buttons. Keep it clean and fast to scan.',
      tags: ['ux'],
      priority: 'Medium',
      assignee: { name: 'Kate', initials: 'K' },
    },
  },
};

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
      client_id TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, id)
    );
  `);
  await ddlPool.query(`ALTER TABLE columns ADD COLUMN IF NOT EXISTS client_id TEXT;`);
  await ddlPool.query(`ALTER TABLE columns ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;`);
  await ddlPool.query(`DROP INDEX IF EXISTS columns_user_id_name_idx;`);
  await ddlPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS columns_user_id_client_id_idx
    ON columns(user_id, client_id)
    WHERE client_id IS NOT NULL;
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
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_number INTEGER;`);
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS customer_name TEXT;`);
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT;`);
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_initials TEXT;`);
  await ddlPool.query(
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  );
  await ddlPool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;`);
  await ddlPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_user_id_client_id_idx
    ON tasks(user_id, client_id)
    WHERE client_id IS NOT NULL;
  `);
  await ddlPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_user_id_task_number_idx
    ON tasks(user_id, task_number)
    WHERE task_number IS NOT NULL;
  `);

  await ddlPool.query(`
    CREATE TABLE IF NOT EXISTS board_state (
      id INTEGER PRIMARY KEY,
      board JSONB NOT NULL,
      next_task_number INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await ddlPool.query(
    `
      INSERT INTO board_state (id, board, next_task_number)
      VALUES (1, $1::jsonb, $2)
      ON CONFLICT (id) DO NOTHING;
    `,
    [JSON.stringify(seedBoardState), 44141],
  );
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
