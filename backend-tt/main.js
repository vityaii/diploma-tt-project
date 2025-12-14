const express = require('express');
const session = require('express-session');
const { Sequelize, DataTypes, Op } = require('sequelize');
const authRouter = require('./auth');

const {
  databaseUrlApp,
  databaseUrlAdmin,
  port,
  sessionSecret,
  buildUserDbUrl,
} = require('./config');

const sequelizeCache = new Map();

const defineTaskModel = (sequelizeInstance) => sequelizeInstance.models.Task || sequelizeInstance.define('Task', {
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
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
}));
app.use(authRouter); // /register, /login, /change-password, /logout

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  next();
}

function getBaseSequelize() {
  if (!sequelizeCache.has('_app')) {
    const sequelize = new Sequelize(databaseUrlApp, {
      dialect: 'postgres',
      logging: false,
    });
    defineTaskModel(sequelize);
    sequelizeCache.set('_app', sequelize);
  }
  return sequelizeCache.get('_app');
}

function getUserSequelize(req) {
  if (!req.session.dbUser || !req.session.dbPassword) {
    return getBaseSequelize();
  }
  const key = `${req.session.dbUser}:${req.session.dbPassword}`;
  if (!sequelizeCache.has(key)) {
    const sequelize = new Sequelize(buildUserDbUrl(req.session.dbUser, req.session.dbPassword), {
      dialect: 'postgres',
      logging: false,
    });
    defineTaskModel(sequelize);
    sequelizeCache.set(key, sequelize);
  }
  return sequelizeCache.get(key);
}

async function getTaskModelForReq(req) {
  const sequelize = getUserSequelize(req);
  try {
    await sequelize.authenticate();
    return sequelize.models.Task;
  } catch (err) {
    // fallback to base connection if user-specific creds недоступны
    const base = getBaseSequelize();
    await base.authenticate();
    return base.models.Task;
  }
}

// получить все таски
app.get('/tasks', requireAuth, async (req, res) => {
  try {
    const Tasks = await getTaskModelForReq(req);
    const tasks = await Tasks.findAll({ where: { user_id: req.session.userId } });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// поиск по началу названия: /tasks/search?q=abc
app.get('/tasks/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q.length) {
    return res.status(400).json({ error: 'Укажите q' });
  }
  try {
    const Tasks = await getTaskModelForReq(req);
    const tasks = await Tasks.findAll({
      where: {
        user_id: req.session.userId,
        title: { [Op.iLike]: `${q}%` },
      },
    });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// получить таску по id
app.get('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const Tasks = await getTaskModelForReq(req);
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
    const Tasks = await getTaskModelForReq(req);
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
    const Tasks = await getTaskModelForReq(req);
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
    const Tasks = await getTaskModelForReq(req);
    const tasks = await Tasks.findAll({ where: { user_id: req.session.userId } });
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// удаление задачи по id
app.delete('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const Tasks = await getTaskModelForReq(req);
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

async function bootstrap() {
  const baseSequelize = getBaseSequelize();
  // If an admin connection string is provided, use it only for DDL and keep the app user least-privileged.
  if (!databaseUrlAdmin || databaseUrlAdmin === databaseUrlApp) {
    await baseSequelize.sync({ alter: true });
  } else {
    const adminSequelize = new Sequelize(databaseUrlAdmin, { dialect: 'postgres', logging: false });
    const AdminTasks = defineTaskModel(adminSequelize);
    await adminSequelize.authenticate();
    await AdminTasks.sync({ alter: true });
    await adminSequelize.close();
  }

  await baseSequelize.authenticate();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

bootstrap().catch(err => {
  console.error('Unable to start server:', err);
  process.exit(1);
});
