require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Sequelize, DataTypes } = require('sequelize');
const { Pool } = require('pg');
const connectPgSimple = require('connect-pg-simple');
const authRouter = require('./auth');

const {
  DATABASE_URL = 'postgres://postgres:root@localhost:5432/ttbd',
  PORT = 7070,
  SESSION_SECRET = 'change_me',
} = process.env;

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

const pool = new Pool({ connectionString: DATABASE_URL });
const PgStore = connectPgSimple(session);

const Tasks = sequelize.define('Task', {
  id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: { // id создателя
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: { // название таски
    type: DataTypes.STRING,
    allowNull: false,
  },
  text: { // содержимое таски
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '',
  },
  stat: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Создана',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
  },
}, {
  tableName: 'tasks',
  timestamps: false,
});

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new PgStore({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  cookie: {
    httpOnly: true,
    sameSite: false, // позволяем отправлять cookie на POST/PUT из Postman/браузера
    secure: false,   // для http на локали
  },
}));
app.locals.db = pool;
app.use(authRouter); // /register, /login, /change-password, /logout

// отладка сессии
app.use((req, res, next) => {
  console.log(
    `${req.method} ${req.path}`,
    'cookie:', req.headers.cookie || '-',
    'sessionId:', req.sessionID,
    'userId:', req.session?.userId || '-'
  );
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  next();
}

// получить все таски
app.get('/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await Tasks.findAll({ where: { user_id: req.session.userId } });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// получить таску по id
app.get('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = await Tasks.findOne({
      where: { id: req.params.id, user_id: req.session.userId },
    });
    if (!task) {
      return res.status(404).json({ error: 'Не нашлась задача' });
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// создать таску
app.post('/tasks', requireAuth, async (req, res) => {
  const { title, text = '', stat = 'Создана' } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Необходимо указать title' });
  }

  try {
    const task = await Tasks.create({
      user_id: req.session.userId,
      title,
      text,
      stat,
    });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Редактировать таску по id
app.put('/tasks/:id', requireAuth, async (req, res) => {
  const { title, text, stat } = req.body;
  if (title === undefined && text === undefined && stat === undefined) {
    return res.status(400).json({ error: 'Нечего обновлять' });
  }

  try {
    const task = await Tasks.findOne({
      where: { id: req.params.id, user_id: req.session.userId },
    });
    if (!task) {
      return res.status(404).json({ error: 'Не найдена задача' });
    }
    if (title !== undefined) task.title = title;
    if (text !== undefined) task.text = text;
    if (stat !== undefined) task.stat = stat;
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// вернёт все задачи при запросе к корню
app.get('/', requireAuth, async (req, res) => {
  try {
    const tasks = await Tasks.findAll({ where: { user_id: req.session.userId } });
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// отладка сессии
app.get('/whoami', (req, res) => {
  res.json({
    sessionId: req.sessionID,
    session: req.session,
    cookies: req.headers.cookie || null,
  });
});
// удаление задачи по id
app.delete('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await Tasks.destroy({
      where: { id: req.params.id, user_id: req.session.userId },
    });
    if (!deleted) {
      return res.status(404).json({ error: 'Не найдена задача' });
    }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

sequelize.authenticate()
  .then(() => pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `))
  .then(() => sequelize.sync({ alter: true }))
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });
