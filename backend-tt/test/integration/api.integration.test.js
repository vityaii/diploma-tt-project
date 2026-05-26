process.env.DATABASE_URL_APP = process.env.DATABASE_URL_APP || 'postgres://postgres:root@localhost:5431/ttbd';
process.env.DATABASE_URL_ADMIN = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL_APP;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'integration-session-secret';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'integration-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'integration-refresh-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const app = require('../../app');
const authRouter = require('../../auth/auth');
const { ensureSchema } = require('../../db/ensure-schema');
const {
  getBaseSequelize,
  closeSequelizeCache,
} = require('../../db/sequelize');

const shouldRun = process.env.RUN_INTEGRATION === '1';

async function listen(expressApp) {
  const server = expressApp.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return server;
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

if (!shouldRun) {
  test('integration tests are skipped by default', { skip: 'Run npm run test:integration to execute DB-backed tests' }, () => {});
} else {
  let server;
  let baseUrl;
  const cleanup = {
    username: null,
    projectId: null,
  };

  test.before(async () => {
    await ensureSchema();
    server = await listen(app);
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  test.after(async () => {
    try {
      const sequelize = getBaseSequelize();

      if (cleanup.projectId) {
        await sequelize.query('DELETE FROM tasks WHERE project_id = $1', { bind: [cleanup.projectId] });
        await sequelize.query('DELETE FROM board_state WHERE project_id = $1', { bind: [cleanup.projectId] });
        await sequelize.query('DELETE FROM columns WHERE project_id = $1', { bind: [cleanup.projectId] });
        await sequelize.query('DELETE FROM projects WHERE id = $1', { bind: [cleanup.projectId] });
      }
      if (cleanup.username) {
        await sequelize.query(`
          DELETE FROM activity_log
          WHERE actor_user_id IN (
            SELECT id FROM users WHERE username = $1
          )
        `, { bind: [cleanup.username] });
        await sequelize.query('DELETE FROM users WHERE username = $1', { bind: [cleanup.username] });
      }
    } catch (err) {
      console.warn(`Integration cleanup failed: ${err.message}`);
    } finally {
      await closeServer(server);
      await closeSequelizeCache();
      await authRouter.closeFallbackPool();
    }
  });

  test('Postman collection integration scenarios work with PostgreSQL', async (t) => {
    const suffix = randomUUID().slice(0, 8);
    const state = {
      username: `itest_${suffix}`,
      password: `Pass_${suffix}`,
      newPassword: `NewPass_${suffix}`,
      projectName: `Integration Project ${suffix}`,
      accessToken: null,
      refreshToken: null,
      authHeaders: null,
      userId: null,
      projectId: null,
      createdColumnId: null,
      createdTaskId: null,
    };
    cleanup.username = state.username;

    await t.test('01 GET /api/health returns API status', async () => {
      const response = await request(baseUrl, '/api/health');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { ok: true });
    });

    await t.test('02 POST /register creates user and returns tokens', async () => {
      const response = await request(baseUrl, '/register', {
        method: 'POST',
        body: JSON.stringify({
          username: state.username,
          password: state.password,
        }),
      });
      assert.equal(response.status, 201);
      assert.equal(response.body.username, state.username);
      assert.equal(typeof response.body.accessToken, 'string');
      assert.equal(typeof response.body.refreshToken, 'string');
      state.userId = response.body.userId;
    });

    await t.test('03 POST /login authenticates user', async () => {
      const response = await request(baseUrl, '/login', {
        method: 'POST',
        body: JSON.stringify({
          username: state.username,
          password: state.password,
        }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.userId, state.userId);
      assert.equal(typeof response.body.accessToken, 'string');
      assert.equal(typeof response.body.refreshToken, 'string');
      state.accessToken = response.body.accessToken;
      state.refreshToken = response.body.refreshToken;
      state.authHeaders = { authorization: `Bearer ${state.accessToken}` };
    });

    await t.test('04 POST /refresh returns a new access token', async () => {
      const response = await request(baseUrl, '/refresh', {
        method: 'POST',
        body: JSON.stringify({
          refreshToken: state.refreshToken,
        }),
      });
      assert.equal(response.status, 200);
      assert.equal(typeof response.body.accessToken, 'string');
    });

    await t.test('05 GET /users/search finds registered user', async () => {
      const response = await request(baseUrl, `/users/search?q=${encodeURIComponent(state.username.slice(0, 10))}`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.some((user) => user.id === state.userId), true);
    });

    await t.test('06 POST /change-password changes password', async () => {
      const response = await request(baseUrl, '/change-password', {
        method: 'POST',
        headers: state.authHeaders,
        body: JSON.stringify({
          oldPassword: state.password,
          newPassword: state.newPassword,
        }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { message: 'Пароль изменён' });
    });

    await t.test('07 POST /login works with changed password', async () => {
      const response = await request(baseUrl, '/login', {
        method: 'POST',
        body: JSON.stringify({
          username: state.username,
          password: state.newPassword,
        }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.userId, state.userId);
    });

    await t.test('08 POST /api/projects creates project', async () => {
      const response = await request(baseUrl, '/api/projects', {
        method: 'POST',
        headers: state.authHeaders,
        body: JSON.stringify({
          name: state.projectName,
          theme: 'integration',
        }),
      });
      assert.equal(response.status, 201);
      assert.equal(response.body.name, state.projectName);
      state.projectId = response.body.id;
      cleanup.projectId = state.projectId;
    });

    await t.test('09 GET /api/projects returns created project', async () => {
      const response = await request(baseUrl, '/api/projects', {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.some((project) => project.id === state.projectId), true);
    });

    await t.test('10 GET /api/projects/:projectId/board returns default board', async () => {
      const response = await request(baseUrl, `/api/projects/${state.projectId}/board`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(
        response.body.board.columns.map((column) => column.id),
        ['todo', 'inprogress', 'review', 'done'],
      );
    });

    await t.test('11 GET /api/board returns board by query projectId', async () => {
      const response = await request(baseUrl, `/api/board?projectId=${state.projectId}`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(
        response.body.board.columns.map((column) => column.id),
        ['todo', 'inprogress', 'review', 'done'],
      );
    });

    await t.test('12 PUT /api/projects/:projectId/board updates board state', async () => {
      const nextBoard = {
        columns: [
          { id: 'todo', title: 'To Do', cardIds: ['card-1'] },
          { id: 'done', title: 'Done', cardIds: [] },
        ],
        cards: {
          'card-1': {
            title: 'Integration task',
            description: 'Created through integration test',
            priority: 'High',
            tags: ['integration'],
            plannedDate: '2026-05-25',
            durationWeeks: 1,
            durationDays: 2,
            assignee: { name: 'QA Engineer', initials: 'QA' },
          },
        },
      };

      const response = await request(baseUrl, `/api/projects/${state.projectId}/board`, {
        method: 'PUT',
        headers: state.authHeaders,
        body: JSON.stringify({ board: nextBoard }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { ok: true });
    });

    await t.test('13 GET /api/projects/:projectId/board returns updated board', async () => {
      const response = await request(baseUrl, `/api/projects/${state.projectId}/board`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.board.columns, [
        { id: 'todo', title: 'To Do', cardIds: ['card-1'] },
        { id: 'done', title: 'Done', cardIds: [] },
      ]);
      assert.equal(response.body.board.cards['card-1'].title, 'Integration task');
      assert.equal(response.body.board.cards['card-1'].priority, 'High');
    });

    await t.test('14 GET / returns root task list', async () => {
      const response = await request(baseUrl, '/', {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal(Array.isArray(response.body), true);
    });

    await t.test('15 GET /columns returns project columns', async () => {
      const response = await request(baseUrl, `/columns?projectId=${state.projectId}`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(
        response.body.map((column) => column.client_id || String(column.id)),
        ['todo', 'done'],
      );
    });

    await t.test('16 POST /columns creates column', async () => {
      const response = await request(baseUrl, '/columns', {
        method: 'POST',
        headers: state.authHeaders,
        body: JSON.stringify({
          name: `Blocked ${suffix}`,
          projectId: state.projectId,
        }),
      });
      assert.equal(response.status, 201);
      assert.equal(response.body.name, `Blocked ${suffix}`);
      assert.equal(response.body.project_id, state.projectId);
      state.createdColumnId = response.body.id;
    });

    await t.test('17 POST /tasks creates task', async () => {
      const response = await request(baseUrl, '/tasks', {
        method: 'POST',
        headers: state.authHeaders,
        body: JSON.stringify({
          projectId: state.projectId,
          columnId: state.createdColumnId,
          title: `Manual task ${suffix}`,
          text: 'Created through /tasks',
          priority: 'low',
          customerName: 'Integration customer',
          assigneeName: 'Integration assignee',
          tags: ['postman', 'integration'],
          plannedDate: '2026-05-26',
          durationWeeks: 0,
          durationDays: 3,
        }),
      });
      assert.equal(response.status, 201);
      assert.equal(response.body.title, `Manual task ${suffix}`);
      assert.equal(response.body.project_id, state.projectId);
      assert.equal(response.body.column_id, state.createdColumnId);
      state.createdTaskId = response.body.id;
    });

    await t.test('18 GET /tasks returns task by projectId', async () => {
      const response = await request(baseUrl, `/tasks?projectId=${state.projectId}`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.some((task) => task.id === state.createdTaskId), true);
    });

    await t.test('19 GET /api/projects/:projectId/tasks returns project tasks', async () => {
      const response = await request(baseUrl, `/api/projects/${state.projectId}/tasks`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.some((task) => task.id === state.createdTaskId), true);
    });

    await t.test('20 GET /tasks/:id returns task by ID', async () => {
      const response = await request(baseUrl, `/tasks/${state.createdTaskId}`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.title, `Manual task ${suffix}`);
    });

    await t.test('21 GET /tasks/search finds task by title', async () => {
      const response = await request(baseUrl, `/tasks/search?q=${encodeURIComponent(`Manual task ${suffix}`)}`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.some((task) => task.id === state.createdTaskId), true);
    });

    await t.test('22 PUT /tasks/:id updates task', async () => {
      const response = await request(baseUrl, `/tasks/${state.createdTaskId}`, {
        method: 'PUT',
        headers: state.authHeaders,
        body: JSON.stringify({
          title: `Updated manual task ${suffix}`,
          priority: 'high',
          plannedDate: '2026-05-27',
          durationWeeks: 1,
          durationDays: 1,
        }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.title, `Updated manual task ${suffix}`);
      assert.equal(response.body.priority, 'high');
    });

    await t.test('23 GET /tasks/filter returns task by project and priority', async () => {
      const response = await request(
        baseUrl,
        `/tasks/filter?projectId=${state.projectId}&priority=high`,
        { headers: state.authHeaders },
      );
      assert.equal(response.status, 200);
      assert.equal(response.body.some((task) => task.id === state.createdTaskId), true);
    });

    await t.test('24 GET /api/changelog returns project and task events', async () => {
      const response = await request(baseUrl, '/api/changelog?limit=50', {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal(Array.isArray(response.body), true);
      assert.equal(
        response.body.some((entry) => (
          entry.event_type === 'project_created' &&
          entry.metadata?.projectId === state.projectId
        )),
        true,
      );
      assert.equal(
        response.body.some((entry) => (
          entry.event_type === 'task_created' &&
          entry.metadata?.projectId === state.projectId
        )),
        true,
      );
    });

    await t.test('25 DELETE /tasks/:id removes task', async () => {
      const response = await request(baseUrl, `/tasks/${state.createdTaskId}`, {
        method: 'DELETE',
        headers: state.authHeaders,
      });
      assert.equal(response.status, 204);
      assert.equal(response.body, null);
    });

    await t.test('26 GET /tasks/:id returns 404 after delete', async () => {
      const response = await request(baseUrl, `/tasks/${state.createdTaskId}`, {
        headers: state.authHeaders,
      });
      assert.equal(response.status, 404);
    });

    await t.test('27 POST /logout ends session', async () => {
      const response = await request(baseUrl, '/logout', {
        method: 'POST',
        headers: state.authHeaders,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { message: 'Вы вышли' });
    });
  });
}
