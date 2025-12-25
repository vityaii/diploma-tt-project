const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const { Sequelize, DataTypes, Op } = require('sequelize');
const authRouter = require('./auth');

const {
  databaseUrlApp,
  databaseUrlAdmin,
  port,
  sessionSecret,
  buildUserDbUrl,
} = require('./config/config');

const sequelizeCache = new Map();

function defineModels(sequelizeInstance) {
  const User = sequelizeInstance.models.User || sequelizeInstance.define('User', {
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
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'users',
    timestamps: false,
  });

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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    client_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'columns',
    timestamps: false,
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
      type: DataTypes.TEXT,
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
    client_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    task_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    customer_name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assignee_name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assignee_initials: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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

  return { Task, Column, BoardState, User };
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

const openapiPath = path.resolve(__dirname, 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  const openapiSpec = yaml.load(fs.readFileSync(openapiPath, 'utf8'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
}

app.use(authRouter); // /register, /login, /change-password, /logout

let cachedApiUserId = null;

async function getOrCreateApiUserId(sequelize) {
  if (cachedApiUserId) return cachedApiUserId;
  const { User } = sequelize.models;
  let user = await User.findOne({ order: [['id', 'ASC']] });
  if (user) {
    cachedApiUserId = user.id;
    return cachedApiUserId;
  }

  const suffix = Math.random().toString(16).slice(2, 8);
  user = await User.create({
    username: `demo_${suffix}`,
    password_hash: `demo_${suffix}`,
  });
  cachedApiUserId = user.id;
  return cachedApiUserId;
}

async function syncBoardToTables(sequelize, board) {
  const { Column, Task } = sequelize.models;
  const userId = await getOrCreateApiUserId(sequelize);

  const columnOrder = Array.isArray(board.columns) ? board.columns : [];
  const cards = board.cards && typeof board.cards === 'object' ? board.cards : {};

  const columnIdToDb = new Map();
  const desiredColumnClientIds = [];

  await sequelize.transaction(async (t) => {
    for (let i = 0; i < columnOrder.length; i += 1) {
      const col = columnOrder[i];
      if (!col || typeof col !== 'object') continue;
      const clientId = String(col.id ?? '').trim();
      const title = String(col.title ?? '').trim();
      if (!clientId || !title) continue;

      desiredColumnClientIds.push(clientId);
      let dbCol = await Column.findOne({ where: { client_id: clientId }, transaction: t });
      if (!dbCol) {
        dbCol = await Column.create(
          { client_id: clientId, name: title, position: i },
          { transaction: t },
        );
      } else {
        await dbCol.update({ name: title, position: i }, { transaction: t });
      }
      columnIdToDb.set(clientId, dbCol);
    }

    const cardIdToPlacement = new Map(); // client_id -> { columnClientId, position }
    for (const col of columnOrder) {
      if (!col || typeof col !== 'object') continue;
      const colClientId = String(col.id ?? '').trim();
      const cardIds = Array.isArray(col.cardIds) ? col.cardIds : [];
      for (let pos = 0; pos < cardIds.length; pos += 1) {
        const cardClientId = String(cardIds[pos] ?? '').trim();
        if (!cardClientId) continue;
        cardIdToPlacement.set(cardClientId, { columnClientId: colClientId, position: pos });
      }
    }

    const desiredTaskClientIds = Object.keys(cards).map((k) => String(k));

    for (const taskClientId of desiredTaskClientIds) {
      const card = cards[taskClientId];
      if (!card || typeof card !== 'object') continue;

      const placement = cardIdToPlacement.get(taskClientId);
      const colClientId = placement?.columnClientId ?? null;
      const dbCol = colClientId ? columnIdToDb.get(colClientId) : null;

      const taskNumber = Number(card.taskNumber);
      const title = String(card.title ?? '').trim();
      const description = String(card.description ?? '');
      const priority = String(card.priority ?? 'Medium');
      const customerName = String(card.customer?.name ?? '').trim();
      const assigneeName = String(card.assignee?.name ?? '').trim();
      const assigneeInitials = String(card.assignee?.initials ?? '').trim();
      const tags = Array.isArray(card.tags) ? card.tags : [];

      const update = {
        user_id: userId,
        client_id: taskClientId,
        task_number: Number.isFinite(taskNumber) ? taskNumber : null,
        title: title || 'Untitled task',
        text: description,
        stat: dbCol ? dbCol.name : String(card.stat ?? 'To Do'),
        priority,
        column_id: dbCol ? dbCol.id : null,
        position: placement?.position ?? 0,
        customer_name: customerName || null,
        assignee_name: assigneeName || null,
        assignee_initials: assigneeInitials || null,
        tags,
      };

      const existing = await Task.findOne({ where: { user_id: userId, client_id: taskClientId }, transaction: t });
      if (!existing) {
        await Task.create(update, { transaction: t });
      } else {
        await existing.update(update, { transaction: t });
      }
    }

    await Task.destroy({
      where: { user_id: userId, client_id: { [Op.ne]: null, [Op.notIn]: desiredTaskClientIds } },
      transaction: t,
    });

    await Column.destroy({
      where: { client_id: { [Op.ne]: null, [Op.notIn]: desiredColumnClientIds } },
      transaction: t,
    });
  });
}

async function buildBoardFromTables(sequelize) {
  const { Column, Task } = sequelize.models;
  const userId = await getOrCreateApiUserId(sequelize);

  const columns = await Column.findAll({
    where: { client_id: { [Op.ne]: null } },
    order: [['position', 'ASC'], ['id', 'ASC']],
  });

  const tasks = await Task.findAll({
    where: { user_id: userId, client_id: { [Op.ne]: null } },
    order: [['position', 'ASC'], ['id', 'ASC']],
  });

  const tasksByColumnId = new Map();
  for (const t of tasks) {
    const colId = t.column_id ?? null;
    const list = tasksByColumnId.get(colId) ?? [];
    list.push(t);
    tasksByColumnId.set(colId, list);
  }

  const board = {
    columns: columns.map((c) => {
      const colTasks = tasksByColumnId.get(c.id) ?? [];
      return {
        id: c.client_id ?? String(c.id),
        title: c.name,
        cardIds: colTasks.map((t) => t.client_id ?? String(t.id)),
      };
    }),
    cards: {},
  };

  for (const t of tasks) {
    const clientId = t.client_id ?? String(t.id);
    board.cards[clientId] = {
      id: clientId,
      taskNumber: t.task_number ?? t.id,
      title: t.title,
      customer: t.customer_name ? { name: t.customer_name } : undefined,
      description: t.text ?? '',
      tags: Array.isArray(t.tags) ? t.tags : [],
      priority: t.priority || 'Medium',
      assignee: t.assignee_name
        ? { name: t.assignee_name, initials: t.assignee_initials || t.assignee_name.slice(0, 2).toUpperCase() }
        : undefined,
    };
  }

  return { board, userId };
}

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
// API для получения доски
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
      await syncBoardToTables(sequelize, created.board);
    }

    const freshState = await BoardState.findByPk(1);
    let built = await buildBoardFromTables(sequelize);
    if (built.board.columns.length === 0 && Object.keys(built.board.cards).length === 0 && freshState?.board) {
      await syncBoardToTables(sequelize, freshState.board);
      built = await buildBoardFromTables(sequelize);
    }

    res.json({ board: built.board, nextTaskNumber: freshState?.next_task_number ?? 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// API для обновления доски
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
    await syncBoardToTables(sequelize, board);
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

async function ensureColumnByName(Column, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const existing = await Column.findOne({ where: { name: trimmed } });
  if (existing) return existing;
  return Column.create({ name: trimmed });
}

async function validateColumnById(Column, columnId) {
  if (columnId === undefined || columnId === null) return null;
  const col = await Column.findOne({ where: { id: columnId } });
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
      resolvedColumn = await validateColumnById(Column, Number(columnId));
    } else if (stat) {
      resolvedColumn = await ensureColumnByName(Column, stat);
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
      resolvedColumn = await validateColumnById(Column, Number(columnId));
    } else if (stat !== undefined) {
      resolvedColumn = await ensureColumnByName(Column, stat);
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
    const existing = await Column.findOne({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'Колонка с таким названием уже существует' });
    }
    const column = await Column.create({ name });
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

  const cache = new Map(); // key: stat
  for (const task of tasks) {
    const statName = (task.stat || '').trim();
    if (!statName) continue;
    const key = statName;

    let column = cache.get(key);
    if (!column) {
      column = await Column.findOne({ where: { name: statName } });
      if (!column) {
        column = await Column.create({ name: statName });
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
  const { Task, Column, BoardState, User } = baseSequelize.models;

  // If an admin connection string is provided, use it for DDL only.
  if (!databaseUrlAdmin || databaseUrlAdmin === databaseUrlApp) {
    await User.sync({ alter: true });
    await Column.sync({ alter: true });
    await Task.sync({ alter: true });
    await BoardState.sync({ alter: true });
  } else {
    const adminSequelize = new Sequelize(databaseUrlAdmin, { dialect: 'postgres', logging: false });
    const adminModels = defineModels(adminSequelize);
    await adminSequelize.authenticate();
    await adminModels.User.sync({ alter: true });
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
