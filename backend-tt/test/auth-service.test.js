process.env.DATABASE_URL_APP = process.env.DATABASE_URL_APP || 'postgres://test:test@localhost:5432/test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const {
  registerUser,
  loginUser,
  changePassword,
  refreshAccessToken,
} = require('../auth/auth-service');
const { signRefreshToken, verifyAccessToken } = require('../auth/jwt');

function createPool(handler) {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params });
      return handler(sql, params, queries);
    },
  };
}

test('registerUser creates a user, stores activity log and returns JWT tokens', async () => {
  const pool = createPool(async (sql, params) => {
    if (sql.includes('SELECT 1 FROM users')) {
      assert.deepEqual(params, ['new_user']);
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes('INSERT INTO users')) {
      assert.equal(params[0], 'new_user');
      assert.equal(await bcrypt.compare('secret123', params[1]), true);
      return { rowCount: 1, rows: [{ id: 7, username: 'new_user' }] };
    }
    if (sql.includes('INSERT INTO activity_log')) {
      assert.equal(params[0], 'user_created');
      assert.equal(params[1], 7);
      assert.deepEqual(JSON.parse(params[2]), {
        actorUsername: 'new_user',
        targetUsername: 'new_user',
        targetUserId: 7,
      });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const response = await registerUser(pool, {
    username: 'new_user',
    password: 'secret123',
  }, { saltRounds: 4 });

  assert.equal(response.userId, 7);
  assert.equal(response.username, 'new_user');
  assert.equal(verifyAccessToken(response.accessToken).userId, 7);
  assert.equal(typeof response.refreshToken, 'string');
  assert.equal(pool.queries.length, 3);
});

test('registerUser rejects duplicate username', async () => {
  const pool = createPool(async (sql) => {
    if (sql.includes('SELECT 1 FROM users')) {
      return { rowCount: 1, rows: [{ exists: 1 }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await assert.rejects(
    () => registerUser(pool, { username: 'busy_user', password: 'secret123' }, { saltRounds: 4 }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Имя пользователя занято');
      return true;
    },
  );
});

test('loginUser authenticates valid credentials and returns JWT tokens', async () => {
  const passwordHash = await bcrypt.hash('secret123', 4);
  const pool = createPool(async (sql, params) => {
    assert.equal(sql.includes('SELECT id, username, password_hash FROM users'), true);
    assert.deepEqual(params, ['known_user']);
    return {
      rowCount: 1,
      rows: [{ id: 11, username: 'known_user', password_hash: passwordHash }],
    };
  });

  const response = await loginUser(pool, {
    username: 'known_user',
    password: 'secret123',
  });

  assert.equal(response.userId, 11);
  assert.equal(verifyAccessToken(response.accessToken).username, 'known_user');
});

test('loginUser rejects missing user and invalid password', async () => {
  const missingPool = createPool(async () => ({ rowCount: 0, rows: [] }));
  await assert.rejects(
    () => loginUser(missingPool, { username: 'missing', password: 'secret123' }),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.message, 'Неверные учётные данные');
      return true;
    },
  );

  const passwordHash = await bcrypt.hash('secret123', 4);
  const invalidPasswordPool = createPool(async () => ({
    rowCount: 1,
    rows: [{ id: 11, username: 'known_user', password_hash: passwordHash }],
  }));
  await assert.rejects(
    () => loginUser(invalidPasswordPool, { username: 'known_user', password: 'bad-password' }),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.message, 'Неверные учётные данные');
      return true;
    },
  );
});

test('changePassword verifies old password and updates password hash', async () => {
  const oldHash = await bcrypt.hash('old-secret', 4);
  const pool = createPool(async (sql, params) => {
    if (sql.includes('SELECT id, username, password_hash FROM users WHERE id=$1')) {
      assert.deepEqual(params, [21]);
      return { rowCount: 1, rows: [{ id: 21, username: 'owner', password_hash: oldHash }] };
    }
    if (sql.includes('UPDATE users SET password_hash=$1 WHERE id=$2')) {
      assert.equal(params[1], 21);
      assert.equal(await bcrypt.compare('new-secret', params[0]), true);
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const response = await changePassword(pool, 21, {
    oldPassword: 'old-secret',
    newPassword: 'new-secret',
  }, { saltRounds: 4 });

  assert.deepEqual(response, { message: 'Пароль изменён' });
  assert.equal(pool.queries.length, 2);
});

test('changePassword rejects invalid old password', async () => {
  const oldHash = await bcrypt.hash('old-secret', 4);
  const pool = createPool(async () => ({
    rowCount: 1,
    rows: [{ id: 21, username: 'owner', password_hash: oldHash }],
  }));

  await assert.rejects(
    () => changePassword(pool, 21, { oldPassword: 'bad-secret', newPassword: 'new-secret' }),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.message, 'Неверные учётные данные');
      return true;
    },
  );
});

test('refreshAccessToken returns access token only for valid refresh token', () => {
  const refreshToken = signRefreshToken({ id: 15, username: 'refresh_user' });
  const response = refreshAccessToken(refreshToken);

  assert.equal(verifyAccessToken(response.accessToken).userId, 15);

  assert.throws(
    () => refreshAccessToken('invalid.token.value'),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.message, 'Invalid or expired refresh token');
      return true;
    },
  );
});
