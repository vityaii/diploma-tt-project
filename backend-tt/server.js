// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');

// const authRouter = require('./auth');    потом добавлю
const weatherRouter = require('./main');

async function start() {
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Создаём таблицы, если их нет
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(100) NOT NULL,
      text VARCHAR(100) NOT NULL,
      stat VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, id)
    );
  `);

  const app = express();
  app.locals.db = pool;
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  }));

  // Роуты
  // app.use('/auth', authRouter);      WIP
  app.use('/main', weatherRouter);

  // вывод ошибок
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  });

  // Старт
  const PORT = process.env.PORT || 7070;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});