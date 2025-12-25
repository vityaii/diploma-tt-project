// auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const { databaseUrlApp, buildUserDbUrl } = require('../config/config');

const router = express.Router();
const saltRounds = 10;
const fallbackPool = new Pool({ connectionString: databaseUrlApp });

function getPool(req) {
  return req.app?.locals?.db || fallbackPool;
}

async function verifyDbLogin(username, password) {
  const pool = new Pool({ connectionString: buildUserDbUrl(username, password) });
  try {
    await pool.query('SELECT 1');
    return true;
  } finally {
    await pool.end();
  }
}

function stashDbCreds(req, username, password) {
  req.session.dbUser = username;
  req.session.dbPassword = password;
}

// принимать JSON и form-urlencoded, чтобы не тянуть пароли через querystring
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// проверка сессии 
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
}

// POST /auth/register новый пользователь
router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3 })
      .withMessage('Имя пользователя должно быть ≥3 символов')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Имя пользователя может содержать только латинские буквы, цифры и _'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Пароль должен быть ≥6 символов'),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) {
        return res.status(400).json({ errors: errs.array() });
      }

      const { username, password } = req.body;
      const pool = getPool(req);

      const exists = await pool.query(
        'SELECT 1 FROM users WHERE username=$1',
        [username]
      );
      if (exists.rowCount) {
        return res.status(409).json({ message: 'Имя пользователя занято' });
      }

      const hash = await bcrypt.hash(password, saltRounds);
      const { rows } = await pool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING id, username',
        [username, hash]
      );

      const newUser = rows[0]; // содержит id и username
      req.session.regenerate(err => {
        if (err) return next(err);
        req.session.userId = newUser.id;
        stashDbCreds(req, username, password);
        req.session.save(saveErr => {
          if (saveErr) return next(saveErr);
          res.status(201).json({
            userId: newUser.id,
            username: newUser.username,
          });
        });
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/login существующий пользователь
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Требуется username'),
    body('password').isLength({ min: 1 }).withMessage('Требуется password'),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) {
        return res.status(400).json({ errors: errs.array() });
      }

      const { username, password } = req.body;
      const pool = getPool(req);

      const { rows } = await pool.query(
        'SELECT id, username, password_hash FROM users WHERE username=$1',
        [username]
      );
      if (
        rows.length === 0 ||
        !(await bcrypt.compare(password, rows[0].password_hash))
      ) {
        return res.status(401).json({ message: 'Неверные учётные данные' });
      }

      const user = rows[0];
      req.session.regenerate(err => {
        if (err) return next(err);
        req.session.userId = user.id;
        stashDbCreds(req, username, password);
        req.session.save(saveErr => {
          if (saveErr) return next(saveErr);
          res.json({
            userId: user.id,
            username: user.username,
          });
        });
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/change-password смена пароля 
router.post(
  '/change-password',
  [
    requireAuth,
    body('oldPassword').isLength({ min: 1 }).withMessage('Требуется старый пароль'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Новый пароль должен быть ≥6 символов'),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) {
        return res.status(400).json({ errors: errs.array() });
      }

      const { oldPassword, newPassword } = req.body;
      const pool = getPool(req);

      const { rows } = await pool.query(
        'SELECT id, username, password_hash FROM users WHERE id=$1',
        [req.session.userId]
      );
      if (
        rows.length === 0 ||
        !(await bcrypt.compare(oldPassword, rows[0].password_hash))
      ) {
        return res.status(401).json({ message: 'Неверные учётные данные' });
      }

      const newHash = await bcrypt.hash(newPassword, saltRounds);
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
        newHash,
        rows[0].id,
      ]);

      stashDbCreds(req, rows[0].username, newPassword);
      res.json({ message: 'Пароль изменён' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/logout выход из сессии
router.post('/logout', requireAuth, (req, res) => {
  const sessionId = req.sessionID;
  req.session.destroy(() => {
    if (sessionId) {
      res.clearCookie('connect.sid');
    }
    res.json({ message: 'Вы вышли' });
  });
});

module.exports = router;
