const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const { Sequelize, DataTypes, Op } = require('sequelize');
const authRouter = require('./auth/auth');
const { requireAuth } = require('./auth/require-auth');

const {
  databaseUrlApp,
  databaseUrlAdmin,
  port,
  sessionSecret,
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

  const Project = sequelizeInstance.models.Project || sequelizeInstance.define('Project', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    theme: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'projects',
    timestamps: false,
  });

  const BoardState = sequelizeInstance.models.BoardState || sequelizeInstance.define('BoardState', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    project_id: {
      type: DataTypes.INTEGER,
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
    project_id: {
      type: DataTypes.INTEGER,
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
    planned_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    duration_weeks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    duration_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
  Project.hasMany(Column, { foreignKey: 'project_id' });
  Project.hasMany(Task, { foreignKey: 'project_id' });
  Column.belongsTo(Project, { foreignKey: 'project_id' });
  Task.belongsTo(Project, { foreignKey: 'project_id' });

  return { Task, Column, BoardState, User, Project };
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
let openapiSpec = null;
try {
  openapiSpec = yaml.load(fs.readFileSync(openapiPath, 'utf8'));
} catch (err) {
  console.warn(`OpenAPI spec not loaded from ${openapiPath}:`, err.message);
}
if (!openapiSpec) {
  openapiSpec = {
    openapi: '3.0.0',
    info: { title: 'API', version: '0.0.0' },
    paths: {},
  };
}
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use(authRouter); // /register, /login, /change-password, /logout

let cachedApiUserId = null;
let cachedDefaultProjectId = null;

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

async function getOrCreateDefaultProjectId(sequelize) {
  if (cachedDefaultProjectId) return cachedDefaultProjectId;
  const { Project, Column, Task, BoardState } = sequelize.models;
  let project = await Project.findOne({ order: [['id', 'ASC']] });
  if (!project) {
    project = await Project.create({ name: 'Default Project', theme: 'General' });
  }
  cachedDefaultProjectId = project.id;

  const projectCount = await Project.count();
  if (projectCount === 1) {
    await Column.update(
      { project_id: cachedDefaultProjectId },
      { where: { project_id: { [Op.is]: null } } },
    );
    await Task.update(
      { project_id: cachedDefaultProjectId },
      { where: { project_id: { [Op.is]: null } } },
    );
    await BoardState.update(
      { project_id: cachedDefaultProjectId },
      { where: { project_id: { [Op.is]: null } } },
    );
  }

  return cachedDefaultProjectId;
}

function normalizeDateOnly(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function coerceNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function normalizePlanningValues(input) {
  const plannedDate = normalizeDateOnly(input?.plannedDate ?? input?.planned_date);
  const totalDays =
    coerceNonNegativeInteger(input?.durationWeeks ?? input?.duration_weeks) * 7 +
    coerceNonNegativeInteger(input?.durationDays ?? input?.duration_days);

  return {
    plannedDate,
    durationWeeks: Math.floor(totalDays / 7),
    durationDays: totalDays % 7,
  };
}

function parsePlanningPayload(body, base = {}) {
  const provided =
    body?.plannedDate !== undefined ||
    body?.planned_date !== undefined ||
    body?.durationWeeks !== undefined ||
    body?.duration_weeks !== undefined ||
    body?.durationDays !== undefined ||
    body?.duration_days !== undefined;

  if (!provided) return { provided: false };

  const rawPlannedDate = body?.plannedDate ?? body?.planned_date;
  if (
    rawPlannedDate !== undefined &&
    rawPlannedDate !== null &&
    String(rawPlannedDate).trim() !== '' &&
    !normalizeDateOnly(rawPlannedDate)
  ) {
    return { error: 'Некорректный plannedDate. Используйте YYYY-MM-DD' };
  }

  for (const [key, value] of [
    ['durationWeeks', body?.durationWeeks ?? body?.duration_weeks],
    ['durationDays', body?.durationDays ?? body?.duration_days],
  ]) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: `Некорректный ${key}` };
    }
  }

  const merged = {
    plannedDate:
      rawPlannedDate !== undefined
        ? rawPlannedDate
        : (base.plannedDate ?? base.planned_date),
    durationWeeks:
      body?.durationWeeks ?? body?.duration_weeks ?? base.durationWeeks ?? base.duration_weeks,
    durationDays:
      body?.durationDays ?? body?.duration_days ?? base.durationDays ?? base.duration_days,
  };

  return {
    provided: true,
    ...normalizePlanningValues(merged),
  };
}

async function syncBoardToTables(sequelize, board, projectId) {
  const { Column, Task } = sequelize.models;
  const normalizedProjectId = Number(projectId);
  if (!Number.isFinite(normalizedProjectId)) {
    throw new Error('Invalid projectId for board sync');
  }
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
      let dbCol = await Column.findOne({
        where: { client_id: clientId, project_id: normalizedProjectId },
        transaction: t,
      });
      if (!dbCol) {
        dbCol = await Column.create(
          { client_id: clientId, name: title, position: i, project_id: normalizedProjectId },
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
      const planning = normalizePlanningValues(card);

      const update = {
        user_id: userId,
        client_id: taskClientId,
        project_id: normalizedProjectId,
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
        planned_date: planning.plannedDate,
        duration_weeks: planning.durationWeeks,
        duration_days: planning.durationDays,
        tags,
      };

      const existing = await Task.findOne({
        where: { user_id: userId, client_id: taskClientId, project_id: normalizedProjectId },
        transaction: t,
      });
      if (!existing) {
        await Task.create(update, { transaction: t });
      } else {
        await existing.update(update, { transaction: t });
      }
    }

    await Task.destroy({
      where: {
        user_id: userId,
        project_id: normalizedProjectId,
        client_id: { [Op.ne]: null, [Op.notIn]: desiredTaskClientIds },
      },
      transaction: t,
    });

    await Column.destroy({
      where: {
        project_id: normalizedProjectId,
        client_id: { [Op.ne]: null, [Op.notIn]: desiredColumnClientIds },
      },
      transaction: t,
    });
  });
}

async function buildBoardFromTables(sequelize, projectId) {
  const { Column, Task } = sequelize.models;
  const normalizedProjectId = Number(projectId);
  if (!Number.isFinite(normalizedProjectId)) {
    throw new Error('Invalid projectId for board build');
  }
  const userId = await getOrCreateApiUserId(sequelize);

  const columns = await Column.findAll({
    where: { project_id: normalizedProjectId, client_id: { [Op.ne]: null } },
    order: [['position', 'ASC'], ['id', 'ASC']],
  });

  const tasks = await Task.findAll({
    where: { user_id: userId, project_id: normalizedProjectId, client_id: { [Op.ne]: null } },
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
      plannedDate: t.planned_date ?? undefined,
      durationWeeks: Number.isFinite(Number(t.duration_weeks)) ? Number(t.duration_weeks) : 0,
      durationDays: Number.isFinite(Number(t.duration_days)) ? Number(t.duration_days) : 0,
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

async function ensureBoardStateForProject(sequelize, projectId) {
  const { BoardState } = sequelize.models;
  let state = await BoardState.findOne({ where: { project_id: projectId } });
  if (state) return state;

  const byId = await BoardState.findByPk(projectId);
  if (byId && (byId.project_id === null || byId.project_id === undefined)) {
    await byId.update({ project_id: projectId });
    return byId;
  }

  return BoardState.create({
    id: projectId,
    project_id: projectId,
    board: defaultBoardState(),
    next_task_number: 1,
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const sequelize = getBaseSequelize();
    const { Project } = sequelize.models;
    const projects = await Project.findAll({ order: [['id', 'ASC']] });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', requireAuth, async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const theme = String(req.body?.theme ?? '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Укажите name' });
  }
  try {
    const sequelize = getBaseSequelize();
    const { Project } = sequelize.models;
    const project = await Project.create({ name, theme });

    const state = await ensureBoardStateForProject(sequelize, project.id);
    await syncBoardToTables(sequelize, state.board, project.id);

    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:projectId/board', requireAuth, async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Некорректный projectId' });
  }
  try {
    const sequelize = getBaseSequelize();
    const { Project } = sequelize.models;
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    const state = await ensureBoardStateForProject(sequelize, projectId);
    await syncBoardToTables(sequelize, state.board, projectId);

    let built = await buildBoardFromTables(sequelize, projectId);
    if (built.board.columns.length === 0 && Object.keys(built.board.cards).length === 0 && state.board) {
      await syncBoardToTables(sequelize, state.board, projectId);
      built = await buildBoardFromTables(sequelize, projectId);
    }

    res.json({ board: built.board, nextTaskNumber: state.next_task_number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:projectId/board', requireAuth, async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Некорректный projectId' });
  }
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
    const { Project, BoardState } = sequelize.models;
    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    const existing = await ensureBoardStateForProject(sequelize, projectId);
    await existing.update({
      board,
      next_task_number: Number(nextTaskNumber),
      updated_at: Sequelize.literal('CURRENT_TIMESTAMP'),
    });

    await syncBoardToTables(sequelize, board, projectId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API для получения доски
app.get('/api/board', async (req, res) => {
  try {
    const sequelize = getBaseSequelize();
    const defaultProjectId = await getOrCreateDefaultProjectId(sequelize);

    const state = await ensureBoardStateForProject(sequelize, defaultProjectId);
    await syncBoardToTables(sequelize, state.board, defaultProjectId);

    let built = await buildBoardFromTables(sequelize, defaultProjectId);
    if (built.board.columns.length === 0 && Object.keys(built.board.cards).length === 0 && state.board) {
      await syncBoardToTables(sequelize, state.board, defaultProjectId);
      built = await buildBoardFromTables(sequelize, defaultProjectId);
    }

    res.json({ board: built.board, nextTaskNumber: state?.next_task_number ?? 1 });
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
    const defaultProjectId = await getOrCreateDefaultProjectId(sequelize);

    const existing = await ensureBoardStateForProject(sequelize, defaultProjectId);
    await existing.update({
      board,
      next_task_number: Number(nextTaskNumber),
      updated_at: Sequelize.literal('CURRENT_TIMESTAMP'),
    });
    await syncBoardToTables(sequelize, board, defaultProjectId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

async function getModelsForReq(req) {
  const sequelize = getBaseSequelize();
  await sequelize.authenticate();
  return { ...sequelize.models, sequelize };
}

async function ensureColumnByName(Column, name, projectId) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const where = { name: trimmed };
  if (projectId !== undefined) where.project_id = projectId;
  const existing = await Column.findOne({ where });
  if (existing) return existing;
  return Column.create({ name: trimmed, project_id: projectId ?? null });
}

async function validateColumnById(Column, columnId, projectId) {
  if (columnId === undefined || columnId === null) return null;
  const where = { id: columnId };
  if (projectId !== undefined) where.project_id = projectId;
  const col = await Column.findOne({ where });
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
    const tasks = await Task.findAll({ where: { user_id: req.auth.userId } });
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
        user_id: req.auth.userId,
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
      where: { id: req.params.id, user_id: req.auth.userId },
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
  const {
    title,
    text = '',
    stat = 'Создана',
    priority = 'normal',
    columnId,
    projectId,
  } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Необходимо указать title' });
  }

  try {
    const { Task, Column } = await getModelsForReq(req);
    const resolvedProjectId = projectId !== undefined ? Number(projectId) : undefined;
    if (resolvedProjectId !== undefined && Number.isNaN(resolvedProjectId)) {
      return res.status(400).json({ error: 'Некорректный projectId' });
    }

    const planning = parsePlanningPayload(req.body);
    if (planning.error) {
      return res.status(400).json({ error: planning.error });
    }

    let resolvedColumn = null;
    if (columnId !== undefined) {
      resolvedColumn = await validateColumnById(Column, Number(columnId), resolvedProjectId);
    } else if (stat) {
      resolvedColumn = await ensureColumnByName(Column, stat, resolvedProjectId);
    }

    const task = await Task.create({
      user_id: req.auth.userId,
      title,
      text,
      stat: resolvedColumn ? resolvedColumn.name : stat,
      priority,
      column_id: resolvedColumn ? resolvedColumn.id : null,
      project_id: resolvedProjectId ?? null,
      planned_date: planning.provided ? planning.plannedDate : null,
      duration_weeks: planning.provided ? planning.durationWeeks : 0,
      duration_days: planning.provided ? planning.durationDays : 0,
    });
    res.status(201).json(task);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Редактировать таску по id
app.put('/tasks/:id', requireAuth, async (req, res) => {
  const { title, text, stat, priority, columnId, projectId } = req.body;
  if (
    title === undefined &&
    text === undefined &&
    stat === undefined &&
    priority === undefined &&
    columnId === undefined &&
    projectId === undefined &&
    req.body.plannedDate === undefined &&
    req.body.durationWeeks === undefined &&
    req.body.durationDays === undefined &&
    req.body.planned_date === undefined &&
    req.body.duration_weeks === undefined &&
    req.body.duration_days === undefined
  ) {
    return res.status(400).json({ error: 'Нечего обновлять' });
  }

  try {
    const { Task, Column } = await getModelsForReq(req);
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.auth.userId },
    });
    if (!task) {
      return res.status(404).json({ error: 'Не найдена задача' });
    }

    const resolvedProjectId = projectId !== undefined ? Number(projectId) : undefined;
    if (resolvedProjectId !== undefined && Number.isNaN(resolvedProjectId)) {
      return res.status(400).json({ error: 'Некорректный projectId' });
    }

    const planning = parsePlanningPayload(req.body, {
      plannedDate: task.planned_date,
      durationWeeks: task.duration_weeks,
      durationDays: task.duration_days,
    });
    if (planning.error) {
      return res.status(400).json({ error: planning.error });
    }

    let resolvedColumn = null;
    if (columnId !== undefined) {
      if (columnId === null) {
        return res.status(400).json({ error: 'columnId не может быть null' });
      }
      resolvedColumn = await validateColumnById(Column, Number(columnId), resolvedProjectId);
    } else if (stat !== undefined) {
      resolvedColumn = await ensureColumnByName(Column, stat, resolvedProjectId);
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

    if (resolvedProjectId !== undefined) {
      task.project_id = resolvedProjectId;
    }

    if (planning.provided) {
      task.planned_date = planning.plannedDate;
      task.duration_weeks = planning.durationWeeks;
      task.duration_days = planning.durationDays;
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
    const tasks = await Task.findAll({ where: { user_id: req.auth.userId } });
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Фильтрация задач по приоритету/статусу/пользователю
app.get('/tasks/filter', requireAuth, async (req, res) => {
  const { priority, stat, userId, columnId, projectId } = req.query;
  const targetUserId = userId ? Number(userId) : req.auth.userId;
  if (Number.isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Некорректный userId' });
  }

  const where = { user_id: targetUserId };
  if (priority) where.priority = priority;
  if (stat) where.stat = stat;
  if (projectId !== undefined) {
    const parsedProjectId = Number(projectId);
    if (Number.isNaN(parsedProjectId)) {
      return res.status(400).json({ error: 'Некорректный projectId' });
    }
    where.project_id = parsedProjectId;
  }
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
    const projectId = req.query.projectId !== undefined ? Number(req.query.projectId) : undefined;
    if (projectId !== undefined && Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Некорректный projectId' });
    }
    const where = {};
    if (projectId !== undefined) where.project_id = projectId;
    const columns = await Column.findAll({
      where,
      include: [{
        model: Task,
        required: false,
        where: { user_id: req.auth.userId, ...(projectId !== undefined ? { project_id: projectId } : {}) },
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
    const projectId = req.body.projectId !== undefined ? Number(req.body.projectId) : undefined;
    if (projectId !== undefined && Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Некорректный projectId' });
    }
    const where = { name };
    if (projectId !== undefined) where.project_id = projectId;
    const existing = await Column.findOne({ where });
    if (existing) {
      return res.status(409).json({ error: 'Колонка с таким названием уже существует' });
    }
    const column = await Column.create({ name, project_id: projectId ?? null });
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
      where: { id: req.params.id, user_id: req.auth.userId },
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
    attributes: ['id', 'user_id', 'stat', 'column_id', 'project_id'],
  });

  const cache = new Map(); // key: stat
  for (const task of tasks) {
    const statName = (task.stat || '').trim();
    if (!statName) continue;
    const key = `${task.project_id ?? 'none'}:${statName}`;

    let column = cache.get(key);
    if (!column) {
      column = await Column.findOne({
        where: { name: statName, project_id: task.project_id ?? null },
      });
      if (!column) {
        column = await Column.create({ name: statName, project_id: task.project_id ?? null });
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
  const { Task, Column, BoardState, User, Project } = baseSequelize.models;

  // If an admin connection string is provided, use it for DDL only.
  if (!databaseUrlAdmin || databaseUrlAdmin === databaseUrlApp) {
    await User.sync({ alter: true });
    await Project.sync({ alter: true });
    await Column.sync({ alter: true });
    await Task.sync({ alter: true });
    await BoardState.sync({ alter: true });
  } else {
    const adminSequelize = new Sequelize(databaseUrlAdmin, { dialect: 'postgres', logging: false });
    const adminModels = defineModels(adminSequelize);
    await adminSequelize.authenticate();
    await adminModels.User.sync({ alter: true });
    await adminModels.Project.sync({ alter: true });
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
