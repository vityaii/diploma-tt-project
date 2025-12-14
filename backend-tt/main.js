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

function defineModels(sequelizeInstance) {
  const BoardState = sequelizeInstance.models.BoardState || sequelizeInstance.define('BoardState', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    board: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    next_task_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'board_state',
    timestamps: false,
  });

  const Column = sequelizeInstance.models.Column || sequelizeInstance.define('Column', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'columns',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['user_id', 'name'] },
    ],
  });

  const Task = sequelizeInstance.models.Task || sequelizeInstance.define('Task', {
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
    stat: { // имя колонки, к которой привязана карточка
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Создана',
    },
    priority: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'normal',
    },
    column_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
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

  Column.hasMany(Task, { foreignKey: 'column_id' });
  Task.belongsTo(Column, { foreignKey: 'column_id' });

  return { Task, Column, BoardState };
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
}));
app.use(authRouter); // /register, /login, /change-password, /logout

function defaultBoardState() {
  return {
    columns: [
      { id: 'todo', title: 'To Do', cardIds: [] },
      { id: 'inprogress', title: 'In Progress', cardIds: [] },
      { id: 'review', title: 'Review', cardIds: [] },
      { id: 'done', title: 'Done', cardIds: [] },
    ],
    cards: {},
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/board', async (req, res) => {
  try {
    const sequelize = getBaseSequelize();
    const { BoardState } = sequelize.models;
    const state = await BoardState.findByPk(1);
    if (!state) {
      const created = await BoardState.create({
        id: 1,
        board: defaultBoardState(),
        next_task_number: 1,
      });
      return res.json({ board: created.board, nextTaskNumber: created.next_task_number });
    }
    res.json({ board: state.board, nextTaskNumber: state.next_task_number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/board', async (req, res) => {
  const { board, nextTaskNumber } = req.body || {};
  if (!board || typeof board !== 'object') {
    return res.status(400).json({ error: 'Missing board' });
  }
  if (!Number.isFinite(Number(nextTaskNumber)) || Number(nextTaskNumber) < 1) {
    return res.status(400).json({ error: 'Invalid nextTaskNumber' });
  }
  if (!Array.isArray(board.columns) || typeof board.cards !== 'object' || board.cards === null) {
    return res.status(400).json({ error: 'Invalid board shape' });
  }

  try {
    const sequelize = getBaseSequelize();
    const { BoardState } = sequelize.models;
    await BoardState.upsert({
      id: 1,
      board,
      next_task_number: Number(nextTaskNumber),
      updated_at: Sequelize.literal('CURRENT_TIMESTAMP'),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    defineModels(sequelize);
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
    defineModels(sequelize);
    sequelizeCache.set(key, sequelize);
  }
  return sequelizeCache.get(key);
}

async function getModelsForReq(req) {
  const sequelize = getUserSequelize(req);
  try {
    await sequelize.authenticate();
    return { ...sequelize.models, sequelize };
  } catch (err) {
    const base = getBaseSequelize();
    await base.authenticate();
    return { ...base.models, sequelize: base };
  }
}

async function ensureColumnForUser(Column, userId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const existing = await Column.findOne({ where: { user_id: userId, name: trimmed } });
  if (existing) return existing;
  return Column.create({ user_id: userId, name: trimmed });
}

async function validateColumnById(Column, userId, columnId) {
  if (columnId === undefined || columnId === null) return null;
  const col = await Column.findOne({ where: { id: columnId, user_id: userId } });
  if (!col) {
    const err = new Error('Колонка не найдена');
    err.status = 404;
    throw err;
  }
  return col;
}

// получить все таски
app.get('/tasks', requireAuth, async (req, res) => {
  try {
    const { Task } = await getModelsForReq(req);
    const tasks = await Task.findAll({ where: { user_id: req.session.userId } });
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
    const { Task } = await getModelsForReq(req);
    const tasks = await Task.findAll({
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
    const { Task } = await getModelsForReq(req);
    const task = await Task.findOne({
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
  const { title, text = '', stat = 'Создана', priority = 'normal', columnId } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Необходимо указать title' });
  }

  try {
    const { Task, Column } = await getModelsForReq(req);

    let resolvedColumn = null;
    if (columnId !== undefined) {
      resolvedColumn = await validateColumnById(Column, req.session.userId, Number(columnId));
    } else if (stat) {
      resolvedColumn = await ensureColumnForUser(Column, req.session.userId, stat);
    }

    const task = await Task.create({
      user_id: req.session.userId,
      title,
      text,
      stat: resolvedColumn ? resolvedColumn.name : stat,
      priority,
      column_id: resolvedColumn ? resolvedColumn.id : null,
    });
    res.status(201).json(task);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Редактировать таску по id
app.put('/tasks/:id', requireAuth, async (req, res) => {
  const { title, text, stat, priority, columnId } = req.body;
  if (title === undefined && text === undefined && stat === undefined && priority === undefined && columnId === undefined) {
    return res.status(400).json({ error: 'Нечего обновлять' });
  }

  try {
    const { Task, Column } = await getModelsForReq(req);
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.session.userId },
    });
    if (!task) {
      return res.status(404).json({ error: 'Не найдена задача' });
    }

    let resolvedColumn = null;
    if (columnId !== undefined) {
      if (columnId === null) {
        return res.status(400).json({ error: 'columnId не может быть null' });
      }
      resolvedColumn = await validateColumnById(Column, req.session.userId, Number(columnId));
    } else if (stat !== undefined) {
      resolvedColumn = await ensureColumnForUser(Column, req.session.userId, stat);
    }

    if (title !== undefined) task.title = title;
    if (text !== undefined) task.text = text;
    if (priority !== undefined) task.priority = priority;

    if (columnId !== undefined || stat !== undefined) {
      if (resolvedColumn) {
        task.stat = resolvedColumn.name;
        task.column_id = resolvedColumn.id;
      } else if (stat !== undefined) {
        task.stat = stat;
        task.column_id = null;
      }
    }

    await task.save();
    res.json(task);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// вернёт все задачи при запросе к корню
app.get('/', requireAuth, async (req, res) => {
  try {
    const { Task } = await getModelsForReq(req);
    const tasks = await Task.findAll({ where: { user_id: req.session.userId } });
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Фильтрация задач по приоритету/статусу/пользователю
app.get('/tasks/filter', requireAuth, async (req, res) => {
  const { priority, stat, userId, columnId } = req.query;
  const targetUserId = userId ? Number(userId) : req.session.userId;
  if (Number.isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Некорректный userId' });
  }

  const where = { user_id: targetUserId };
  if (priority) where.priority = priority;
  if (stat) where.stat = stat;
  if (columnId !== undefined) {
    const parsedColumnId = Number(columnId);
    if (Number.isNaN(parsedColumnId)) {
      return res.status(400).json({ error: 'Некорректный columnId' });
    }
    where.column_id = parsedColumnId;
  }

  try {
    const { Task } = await getModelsForReq(req);
    const tasks = await Task.findAll({ where });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Поиск пользователей по префиксу имени: /users/search?q=abc
app.get('/users/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q.length) {
    return res.status(400).json({ error: 'Укажите q' });
  }
  try {
    const sequelize = getBaseSequelize();
    const User = sequelize.models.User || sequelize.define('User', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    }, {
      tableName: 'users',
      timestamps: false,
    });

    const users = await User.findAll({
      where: { username: { [Op.iLike]: `${q}%` } },
      attributes: ['id', 'username'],
      limit: 20,
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Список колонок с задачами
app.get('/columns', requireAuth, async (req, res) => {
  try {
    const { Column, Task } = await getModelsForReq(req);
    const columns = await Column.findAll({
      where: { user_id: req.session.userId },
      include: [{
        model: Task,
        required: false,
        where: { user_id: req.session.userId },
      }],
      order: [['id', 'ASC']],
    });
    res.json(columns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Создать колонку
app.post('/columns', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Укажите name' });
  }
  try {
    const { Column } = await getModelsForReq(req);
    const existing = await Column.findOne({ where: { user_id: req.session.userId, name } });
    if (existing) {
      return res.status(409).json({ error: 'Колонка с таким названием уже существует' });
    }
    const column = await Column.create({ user_id: req.session.userId, name });
    res.status(201).json(column);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// удаление задачи по id
app.delete('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { Task } = await getModelsForReq(req);
    const deleted = await Task.destroy({
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

async function backfillColumns(baseSequelize) {
  const { Task, Column } = baseSequelize.models;
  const tasks = await Task.findAll({
    attributes: ['id', 'user_id', 'stat', 'column_id'],
  });

  const cache = new Map(); // key: `${userId}:${stat}`
  for (const task of tasks) {
    const statName = (task.stat || '').trim();
    if (!statName) continue;
    const key = `${task.user_id}:${statName}`;

    let column = cache.get(key);
    if (!column) {
      column = await Column.findOne({ where: { user_id: task.user_id, name: statName } });
      if (!column) {
        column = await Column.create({ user_id: task.user_id, name: statName });
      }
      cache.set(key, column);
    }

    if (task.column_id !== column.id) {
      task.column_id = column.id;
      await task.save();
    }
  }
}

async function bootstrap() {
  const baseSequelize = getBaseSequelize();
  const { Task, Column, BoardState } = baseSequelize.models;

  // If an admin connection string is provided, use it for DDL only.
  if (!databaseUrlAdmin || databaseUrlAdmin === databaseUrlApp) {
    await Column.sync({ alter: true });
    await Task.sync({ alter: true });
    await BoardState.sync({ alter: true });
  } else {
    const adminSequelize = new Sequelize(databaseUrlAdmin, { dialect: 'postgres', logging: false });
    const adminModels = defineModels(adminSequelize);
    await adminSequelize.authenticate();
    await adminModels.Column.sync({ alter: true });
    await adminModels.Task.sync({ alter: true });
    await adminModels.BoardState.sync({ alter: true });
    await adminSequelize.close();
  }

  await backfillColumns(baseSequelize);
  await baseSequelize.authenticate();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

bootstrap().catch(err => {
  console.error('Unable to start server:', err);
  process.exit(1);
});
