const bcrypt = require('bcrypt');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('./jwt');

const DEFAULT_SALT_ROUNDS = 10;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function buildAuthResponse(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  return {
    userId: user.id,
    username: user.username,
    accessToken,
    refreshToken,
  };
}

async function registerUser(pool, { username, password }, { saltRounds = DEFAULT_SALT_ROUNDS } = {}) {
  const exists = await pool.query(
    'SELECT 1 FROM users WHERE username=$1',
    [username],
  );
  if (exists.rowCount) {
    throw httpError(409, 'Имя пользователя занято');
  }

  const hash = await bcrypt.hash(password, saltRounds);
  const { rows } = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING id, username',
    [username, hash],
  );

  const newUser = rows[0];
  await pool.query(
    'INSERT INTO activity_log (event_type, actor_user_id, metadata) VALUES ($1, $2, $3::jsonb)',
    [
      'user_created',
      newUser.id,
      JSON.stringify({
        actorUsername: newUser.username,
        targetUsername: newUser.username,
        targetUserId: newUser.id,
      }),
    ],
  );

  return buildAuthResponse(newUser);
}

async function loginUser(pool, { username, password }) {
  const { rows } = await pool.query(
    'SELECT id, username, password_hash FROM users WHERE username=$1',
    [username],
  );
  if (
    rows.length === 0 ||
    !(await bcrypt.compare(password, rows[0].password_hash))
  ) {
    throw httpError(401, 'Неверные учётные данные');
  }

  return buildAuthResponse(rows[0]);
}

async function changePassword(pool, userId, { oldPassword, newPassword }, { saltRounds = DEFAULT_SALT_ROUNDS } = {}) {
  const { rows } = await pool.query(
    'SELECT id, username, password_hash FROM users WHERE id=$1',
    [userId],
  );
  if (
    rows.length === 0 ||
    !(await bcrypt.compare(oldPassword, rows[0].password_hash))
  ) {
    throw httpError(401, 'Неверные учётные данные');
  }

  const newHash = await bcrypt.hash(newPassword, saltRounds);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
    newHash,
    rows[0].id,
  ]);

  return { message: 'Пароль изменён' };
}

function refreshAccessToken(refreshToken) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    const accessToken = signAccessToken({
      id: payload.userId,
      username: payload.username,
    });
    return { accessToken };
  } catch (err) {
    throw httpError(401, 'Invalid or expired refresh token');
  }
}

module.exports = {
  buildAuthResponse,
  registerUser,
  loginUser,
  changePassword,
  refreshAccessToken,
};
