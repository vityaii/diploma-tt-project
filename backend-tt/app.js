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


const DEFAULT_BOARD_COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'inprogress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
];

function isPositiveIntLike(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function normalizePriorityForStorage(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'low') return 'low';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium' || normalized === 'normal') return 'medium';
  return 'medium';
}

function normalizePriorityForBoard(value) {
  const normalized = normalizePriorityForStorage(value);
  if (normalized === 'low') return 'Low';
  if (normalized === 'high') return 'High';
  return 'Medium';
}

function normalizeNullableText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => String(tag ?? '').trim())
    .filter(Boolean)
    .slice(0, 20);
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

async function ensureProjectExists(Project, projectId, transaction) {
  const project = await Project.findByPk(projectId, { transaction });
  if (!project) {
    const err = new Error('Проект не найден');
    err.status = 404;
    throw err;
  }
  return project;
}

async function ensureDefaultColumnsForProject(Column, projectId, transaction) {
  const count = await Column.count({
    where: { project_id: projectId },
    transaction,
  });
  if (count > 0) return;

  for (let index = 0; index < DEFAULT_BOARD_COLUMNS.length; index += 1) {
    const entry = DEFAULT_BOARD_COLUMNS[index];
    await Column.create({
      project_id: projectId,
      client_id: entry.id,
      name: entry.title,
      position: index,
    }, { transaction });
  }
}

function cardIdFromTask(task) {
  return task.client_id ? String(task.client_id) : String(task.id);
}

function mapTaskToBoardCard(task) {
  return {
    id: cardIdFromTask(task),
    taskNumber: isPositiveIntLike(task.task_number) ? Number(task.task_number) : Number(task.id),
    title: task.title,
    customer: task.customer_name ? { name: task.customer_name } : undefined,
    description: task.text ?? '',
    tags: normalizeTags(task.tags),
    priority: normalizePriorityForBoard(task.priority),
    plannedDate: task.planned_date ?? undefined,
    durationWeeks: Number.isFinite(Number(task.duration_weeks)) ? Number(task.duration_weeks) : 0,
    durationDays: Number.isFinite(Number(task.duration_days)) ? Number(task.duration_days) : 0,
    assignee: task.assignee_name
      ? {
        name: task.assignee_name,
        initials: task.assignee_initials || task.assignee_name.slice(0, 2).toUpperCase(),
      }
      : undefined,
  };
}

async function getNextTaskNumber(Task, projectId, transaction) {
  const [maxTaskNumber, maxTaskId] = await Promise.all([
    Task.max('task_number', {
      where: { project_id: projectId },
      transaction,
    }),
    Task.max('id', {
      where: { project_id: projectId },
      transaction,
    }),
  ]);
  const maxTaskNumberValue = Number.isFinite(Number(maxTaskNumber)) ? Number(maxTaskNumber) : 0;
  const maxTaskIdValue = Number.isFinite(Number(maxTaskId)) ? Number(maxTaskId) : 0;
  return Math.max(maxTaskNumberValue, maxTaskIdValue) + 1;
}

async function getNextTaskPosition(Task, projectId, columnId, transaction) {
  const maxPosition = await Task.max('position', {
    where: { project_id: projectId, column_id: columnId },
    transaction,
  });
  return Number.isFinite(Number(maxPosition)) ? Number(maxPosition) + 1 : 0;
}

async function syncBoardToTables(sequelize, board, projectId, userId) {
  const { Column, Task } = sequelize.models;
  const normalizedProjectId = Number(projectId);
  if (!Number.isFinite(normalizedProjectId)) {
    throw new Error('Invalid projectId for board sync');
  }
  const normalizedUserId = Number(userId);
  if (!Number.isFinite(normalizedUserId)) {
    throw new Error('Invalid userId for board sync');
  }

  const inputColumns = Array.isArray(board.columns) ? board.columns : [];
  const inputCards = board.cards && typeof board.cards === 'object' ? board.cards : {};

  await sequelize.transaction(async (t) => {
    const [existingColumns, existingTasks] = await Promise.all([
      Column.findAll({
        where: { project_id: normalizedProjectId },
        order: [['position', 'ASC'], ['id', 'ASC']],
        transaction: t,
      }),
      Task.findAll({
        where: { project_id: normalizedProjectId },
        order: [['position', 'ASC'], ['id', 'ASC']],
        transaction: t,
      }),
    ]);

    const columnsByDbId = new Map(existingColumns.map((column) => [String(column.id), column]));
    const columnsByClientId = new Map(
      existingColumns
        .filter((column) => column.client_id)
        .map((column) => [String(column.client_id), column]),
    );
    const tasksByDbId = new Map(existingTasks.map((task) => [String(task.id), task]));
    const tasksByClientId = new Map(
      existingTasks
        .filter((task) => task.client_id)
        .map((task) => [String(task.client_id), task]),
    );

    const boardColumnIdToDbColumn = new Map();
    const desiredColumnDbIds = new Set();

    for (let index = 0; index < inputColumns.length; index += 1) {
      const column = inputColumns[index];
      if (!column || typeof column !== 'object') continue;

      const boardColumnId = String(column.id ?? '').trim();
      const title = String(column.title ?? '').trim();
      if (!boardColumnId || !title) continue;

      let dbColumn = columnsByDbId.get(boardColumnId) || columnsByClientId.get(boardColumnId);
      if (!dbColumn) {
        dbColumn = await Column.create({
          project_id: normalizedProjectId,
          client_id: boardColumnId,
          name: title,
          position: index,
        }, { transaction: t });
      } else {
        const patch = { name: title, position: index };
        if (!dbColumn.client_id && !isPositiveIntLike(boardColumnId)) {
          patch.client_id = boardColumnId;
        }
        await dbColumn.update(patch, { transaction: t });
      }

      boardColumnIdToDbColumn.set(boardColumnId, dbColumn);
      desiredColumnDbIds.add(dbColumn.id);
      columnsByDbId.set(String(dbColumn.id), dbColumn);
      if (dbColumn.client_id) columnsByClientId.set(String(dbColumn.client_id), dbColumn);
    }

    const cardPlacement = new Map();
    for (const column of inputColumns) {
      if (!column || typeof column !== 'object') continue;
      const boardColumnId = String(column.id ?? '').trim();
      const cardIds = Array.isArray(column.cardIds) ? column.cardIds : [];
      for (let position = 0; position < cardIds.length; position += 1) {
        const boardCardId = String(cardIds[position] ?? '').trim();
        if (!boardCardId) continue;
        cardPlacement.set(boardCardId, { boardColumnId, position });
      }
    }

    let nextTaskNumber = await getNextTaskNumber(Task, normalizedProjectId, t);
    const desiredTaskDbIds = new Set();
    const fallbackColumn = boardColumnIdToDbColumn.values().next().value || null;

    for (const [boardCardIdRaw, rawCard] of Object.entries(inputCards)) {
      const boardCardId = String(boardCardIdRaw);
      if (!rawCard || typeof rawCard !== 'object') continue;

      const existingTask = tasksByDbId.get(boardCardId) || tasksByClientId.get(boardCardId);
      const placement = cardPlacement.get(boardCardId);
      const placedColumn = placement ? boardColumnIdToDbColumn.get(placement.boardColumnId) : null;
      const resolvedColumn = placedColumn || fallbackColumn;
      const normalizedTitle = String(rawCard.title ?? '').trim();
      const planning = normalizePlanningValues(rawCard);
      const taskNumberFromPayload = Number(rawCard.taskNumber);

      const taskNumber = (
        Number.isFinite(taskNumberFromPayload) && taskNumberFromPayload > 0
          ? Math.trunc(taskNumberFromPayload)
          : (
            existingTask && isPositiveIntLike(existingTask.task_number)
              ? Number(existingTask.task_number)
              : nextTaskNumber++
          )
      );

      const patch = {
        project_id: normalizedProjectId,
        title: normalizedTitle || 'Untitled task',
        text: String(rawCard.description ?? ''),
        stat: resolvedColumn ? resolvedColumn.name : 'To Do',
        priority: normalizePriorityForStorage(rawCard.priority),
        column_id: resolvedColumn ? resolvedColumn.id : null,
        position: placement?.position ?? 0,
        task_number: taskNumber,
        customer_name: normalizeNullableText(rawCard.customer?.name),
        assignee_name: normalizeNullableText(rawCard.assignee?.name),
        assignee_initials: normalizeNullableText(rawCard.assignee?.initials),
        planned_date: planning.plannedDate,
        duration_weeks: planning.durationWeeks,
        duration_days: planning.durationDays,
        tags: normalizeTags(rawCard.tags),
      };

      if (!existingTask) {
        const created = await Task.create({
          ...patch,
          user_id: normalizedUserId,
          client_id: isPositiveIntLike(boardCardId) ? null : boardCardId,
        }, { transaction: t });
        desiredTaskDbIds.add(created.id);
        continue;
      }

      if (!existingTask.client_id && !isPositiveIntLike(boardCardId)) {
        patch.client_id = boardCardId;
      }
      await existingTask.update(patch, { transaction: t });
      desiredTaskDbIds.add(existingTask.id);
    }

    const taskIdsToDelete = existingTasks
      .map((task) => task.id)
      .filter((id) => !desiredTaskDbIds.has(id));
    if (taskIdsToDelete.length > 0) {
      await Task.destroy({
        where: {
          id: { [Op.in]: taskIdsToDelete },
          project_id: normalizedProjectId,
        },
        transaction: t,
      });
    }

    const columnIdsToDelete = existingColumns
      .map((column) => column.id)
      .filter((id) => !desiredColumnDbIds.has(id));
    if (columnIdsToDelete.length > 0) {
      await Column.destroy({
        where: {
          id: { [Op.in]: columnIdsToDelete },
          project_id: normalizedProjectId,
        },
        transaction: t,
      });
    }
  });
}

async function buildBoardFromTables(sequelize, projectId) {
  const { Column, Task } = sequelize.models;
  const normalizedProjectId = Number(projectId);
  if (!Number.isFinite(normalizedProjectId)) {
    throw new Error('Invalid projectId for board build');
  }

  const columns = await Column.findAll({
    where: { project_id: normalizedProjectId },
    order: [['position', 'ASC'], ['id', 'ASC']],
  });

  const tasks = await Task.findAll({
    where: { project_id: normalizedProjectId },
    order: [['position', 'ASC'], ['id', 'ASC']],
  });

  const tasksByColumnId = new Map();
  for (const task of tasks) {
    const columnId = task.column_id ?? null;
    const list = tasksByColumnId.get(columnId) ?? [];
    list.push(task);
    tasksByColumnId.set(columnId, list);
  }

  const boardColumns = columns.map((column) => {
    const columnTasks = tasksByColumnId.get(column.id) ?? [];
    return {
      id: column.client_id || String(column.id),
      title: column.name,
      cardIds: columnTasks.map((task) => cardIdFromTask(task)),
    };
  });

  if (boardColumns.length === 0) {
    boardColumns.push(...DEFAULT_BOARD_COLUMNS.map((entry) => ({
      ...entry,
      cardIds: [],
    })));
  }

  const knownColumnIds = new Set(columns.map((column) => column.id));
  const unassignedTasks = tasks.filter((task) => !task.column_id || !knownColumnIds.has(task.column_id));
  if (unassignedTasks.length > 0) {
    boardColumns.push({
      id: 'unassigned',
      title: 'Unassigned',
      cardIds: unassignedTasks.map((task) => cardIdFromTask(task)),
    });
  }

  const board = {
    columns: boardColumns,
    cards: {},
  };

  for (const task of tasks) {
    board.cards[cardIdFromTask(task)] = mapTaskToBoardCard(task);
  }

  const nextTaskNumber = await getNextTaskNumber(Task, normalizedProjectId);
  return { board, nextTaskNumber };
}

function parseProjectIdInput(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
}

function parseProjectIdFromRequest(req) {
  return parseProjectIdInput(req.query.projectId ?? req.query.project_id);
}

async function getBoardPayload(sequelize, projectId) {
  const { Project, Column } = sequelize.models;
  await ensureProjectExists(Project, projectId);
  await ensureDefaultColumnsForProject(Column, projectId);
  return buildBoardFromTables(sequelize, projectId);
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
    const { Project, Column } = sequelize.models;
    const createdProject = await sequelize.transaction(async (transaction) => {
      const project = await Project.create({ name, theme }, { transaction });
      await ensureDefaultColumnsForProject(Column, project.id, transaction);
      return project;
    });
    res.status(201).json(createdProject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:projectId/board', requireAuth, async (req, res) => {
  const projectId = parseProjectIdInput(req.params.projectId);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Некорректный projectId' });
  }

  try {
    const sequelize = getBaseSequelize();
    const payload = await getBoardPayload(sequelize, projectId);
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/projects/:projectId/tasks', requireAuth, async (req, res) => {
  const projectId = parseProjectIdInput(req.params.projectId);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Некорректный projectId' });
  }

  try {
    const { Project, Task } = await getModelsForReq(req);
    await ensureProjectExists(Project, projectId);
    const tasks = await Task.findAll({
      where: { project_id: projectId },
      order: [['position', 'ASC'], ['id', 'ASC']],
    });
    res.json(tasks);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/api/projects/:projectId/board', requireAuth, async (req, res) => {
  const projectId = parseProjectIdInput(req.params.projectId);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Некорректный projectId' });
  }

  const { board } = req.body || {};
  if (!board || typeof board !== 'object') {
    return res.status(400).json({ error: 'Missing board' });
  }
  if (!Array.isArray(board.columns) || typeof board.cards !== 'object' || board.cards === null) {
    return res.status(400).json({ error: 'Invalid board shape' });
  }

  try {
    const sequelize = getBaseSequelize();
    const { Project, Column } = sequelize.models;
    await ensureProjectExists(Project, projectId);
    await ensureDefaultColumnsForProject(Column, projectId);
    await syncBoardToTables(sequelize, board, projectId, req.auth.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Backward compatibility: explicit projectId query is required.
app.get('/api/board', requireAuth, async (req, res) => {
  const projectId = parseProjectIdFromRequest(req);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Укажите projectId в query' });
  }

  try {
    const sequelize = getBaseSequelize();
    const payload = await getBoardPayload(sequelize, projectId);
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/api/board', requireAuth, async (req, res) => {
  const projectId = parseProjectIdFromRequest(req);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Укажите projectId в query' });
  }

  const { board } = req.body || {};
  if (!board || typeof board !== 'object') {
    return res.status(400).json({ error: 'Missing board' });
  }
  if (!Array.isArray(board.columns) || typeof board.cards !== 'object' || board.cards === null) {
    return res.status(400).json({ error: 'Invalid board shape' });
  }

  try {
    const sequelize = getBaseSequelize();
    const { Project, Column } = sequelize.models;
    await ensureProjectExists(Project, projectId);
    await ensureDefaultColumnsForProject(Column, projectId);
    await syncBoardToTables(sequelize, board, projectId, req.auth.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
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

function parseEntityId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
}

function readProjectIdFromBody(body) {
  return parseEntityId(body?.projectId ?? body?.project_id);
}

function readColumnIdFromBody(body) {
  return parseEntityId(body?.columnId ?? body?.column_id);
}

function readColumnClientIdFromBody(body) {
  const raw = body?.columnClientId ?? body?.column_client_id;
  const normalized = normalizeNullableText(raw);
  return normalized ? String(normalized) : null;
}

async function findColumnByName(Column, name, projectId, transaction) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  return Column.findOne({
    where: { name: trimmed, project_id: projectId },
    transaction,
  });
}

async function validateColumnById(Column, columnId, projectId, transaction) {
  if (!Number.isInteger(columnId) || columnId < 1) {
    const err = new Error('Некорректный columnId');
    err.status = 400;
    throw err;
  }

  const where = { id: columnId };
  if (projectId !== undefined && projectId !== null) where.project_id = projectId;
  const col = await Column.findOne({ where, transaction });
  if (!col) {
    const err = new Error(
      projectId !== undefined && projectId !== null
        ? 'Колонка не найдена в указанном проекте'
        : 'Колонка не найдена',
    );
    err.status = 400;
    throw err;
  }
  return col;
}

async function resolveColumnForTask(Column, projectId, body, transaction, { requireExplicitColumn = true } = {}) {
  await ensureDefaultColumnsForProject(Column, projectId, transaction);

  const columnId = readColumnIdFromBody(body);
  if (Number.isFinite(columnId)) {
    const directMatch = await Column.findOne({
      where: { id: columnId, project_id: projectId },
      transaction,
    });
    if (directMatch) return directMatch;

    // Compatibility mode: interpret 1..N as column ordinal inside the project.
    const orderedColumns = await Column.findAll({
      where: { project_id: projectId },
      order: [['position', 'ASC'], ['id', 'ASC']],
      transaction,
    });
    if (columnId >= 1 && columnId <= orderedColumns.length) {
      return orderedColumns[columnId - 1];
    }

    const err = new Error('Колонка не найдена в указанном проекте');
    err.status = 400;
    err.details = {
      projectId,
      requestedColumnId: columnId,
      availableColumns: orderedColumns.map((column) => ({
        id: column.id,
        name: column.name,
        client_id: column.client_id,
        position: column.position,
      })),
    };
    throw err;
  }

  const columnClientId = readColumnClientIdFromBody(body);
  if (columnClientId) {
    const byClientId = await Column.findOne({
      where: { project_id: projectId, client_id: columnClientId },
      transaction,
    });
    if (!byClientId) {
      const err = new Error('Колонка с таким columnClientId не найдена в проекте');
      err.status = 400;
      throw err;
    }
    return byClientId;
  }

  const stat = normalizeNullableText(body?.stat);
  if (stat) {
    const byName = await findColumnByName(Column, stat, projectId, transaction);
    if (!byName) {
      const err = new Error('Колонка с таким stat не найдена в проекте');
      err.status = 400;
      throw err;
    }
    return byName;
  }

  if (requireExplicitColumn) {
    const err = new Error('Укажите columnId/columnClientId/stat');
    err.status = 400;
    throw err;
  }

  const firstColumn = await Column.findOne({
    where: { project_id: projectId },
    order: [['position', 'ASC'], ['id', 'ASC']],
    transaction,
  });
  if (!firstColumn) {
    const err = new Error('В проекте нет колонок');
    err.status = 400;
    throw err;
  }
  return firstColumn;
}

// получить все таски
app.get('/tasks', requireAuth, async (req, res) => {
  try {
    const { Task } = await getModelsForReq(req);
    const where = {};

    if (req.query.projectId !== undefined || req.query.project_id !== undefined) {
      const projectId = parseEntityId(req.query.projectId ?? req.query.project_id);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ error: 'Некорректный projectId' });
      }
      where.project_id = projectId;
    }

    if (req.query.columnId !== undefined || req.query.column_id !== undefined) {
      const columnId = parseEntityId(req.query.columnId ?? req.query.column_id);
      if (!Number.isFinite(columnId)) {
        return res.status(400).json({ error: 'Некорректный columnId' });
      }
      where.column_id = columnId;
    }

    if (req.query.userId !== undefined || req.query.user_id !== undefined) {
      const userId = parseEntityId(req.query.userId ?? req.query.user_id);
      if (!Number.isFinite(userId)) {
        return res.status(400).json({ error: 'Некорректный userId' });
      }
      where.user_id = userId;
    }

    const tasks = await Task.findAll({
      where,
      order: [['project_id', 'ASC'], ['position', 'ASC'], ['id', 'ASC']],
    });
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
      where: { id: req.params.id },
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
  const title = String(req.body?.title ?? '').trim();
  if (!title) {
    return res.status(400).json({ error: 'Необходимо указать title' });
  }

  const projectId = readProjectIdFromBody(req.body);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Необходимо указать корректный projectId/project_id' });
  }

  const planning = parsePlanningPayload(req.body);
  if (planning.error) {
    return res.status(400).json({ error: planning.error });
  }

  try {
    const { Task, Column, Project, sequelize } = await getModelsForReq(req);
    const task = await sequelize.transaction(async (transaction) => {
      await ensureProjectExists(Project, projectId, transaction);
      const resolvedColumn = await resolveColumnForTask(Column, projectId, req.body, transaction, {
        requireExplicitColumn: false,
      });

      const nextTaskNumber = await getNextTaskNumber(Task, projectId, transaction);
      const nextPosition = await getNextTaskPosition(
        Task,
        projectId,
        resolvedColumn.id,
        transaction,
      );

      const assigneeName = normalizeNullableText(req.body?.assigneeName ?? req.body?.assignee_name);
      const assigneeInitials = normalizeNullableText(
        req.body?.assigneeInitials ??
        req.body?.assignee_initials ??
        (assigneeName ? assigneeName.slice(0, 2).toUpperCase() : null),
      );

      return Task.create({
        user_id: req.auth.userId,
        title,
        text: String(req.body?.text ?? req.body?.description ?? ''),
        stat: resolvedColumn.name,
        priority: normalizePriorityForStorage(req.body?.priority),
        column_id: resolvedColumn.id,
        project_id: projectId,
        task_number: nextTaskNumber,
        position: nextPosition,
        customer_name: normalizeNullableText(req.body?.customerName ?? req.body?.customer_name),
        assignee_name: assigneeName,
        assignee_initials: assigneeInitials,
        tags: normalizeTags(req.body?.tags),
        planned_date: planning.provided ? planning.plannedDate : null,
        duration_weeks: planning.provided ? planning.durationWeeks : 0,
        duration_days: planning.provided ? planning.durationDays : 0,
      }, { transaction });
    });

    res.status(201).json(task);
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }
});

// Редактировать таску по id
app.put('/tasks/:id', requireAuth, async (req, res) => {
  const { title, text, stat, priority } = req.body;
  const projectIdInput = readProjectIdFromBody(req.body);
  const columnIdInput = readColumnIdFromBody(req.body);
  const hasProjectUpdate = req.body?.projectId !== undefined || req.body?.project_id !== undefined;
  const hasColumnUpdate = req.body?.columnId !== undefined || req.body?.column_id !== undefined;
  const hasTextMetaUpdate =
    req.body?.customerName !== undefined ||
    req.body?.customer_name !== undefined ||
    req.body?.assigneeName !== undefined ||
    req.body?.assignee_name !== undefined ||
    req.body?.assigneeInitials !== undefined ||
    req.body?.assignee_initials !== undefined ||
    req.body?.tags !== undefined;

  if (
    title === undefined &&
    text === undefined &&
    stat === undefined &&
    priority === undefined &&
    !hasColumnUpdate &&
    !hasProjectUpdate &&
    !hasTextMetaUpdate &&
    req.body.plannedDate === undefined &&
    req.body.durationWeeks === undefined &&
    req.body.durationDays === undefined &&
    req.body.planned_date === undefined &&
    req.body.duration_weeks === undefined &&
    req.body.duration_days === undefined
  ) {
    return res.status(400).json({ error: 'Нечего обновлять' });
  }

  if (hasProjectUpdate && !Number.isFinite(projectIdInput)) {
    return res.status(400).json({ error: 'Некорректный projectId/project_id' });
  }
  if (hasColumnUpdate && !Number.isFinite(columnIdInput)) {
    return res.status(400).json({ error: 'Некорректный columnId/column_id' });
  }

  const planning = parsePlanningPayload(req.body);
  if (planning.error) {
    return res.status(400).json({ error: planning.error });
  }

  try {
    const { Task, Column, Project, sequelize } = await getModelsForReq(req);
    const updatedTask = await sequelize.transaction(async (transaction) => {
      const task = await Task.findOne({
        where: { id: req.params.id },
        transaction,
      });
      if (!task) {
        const err = new Error('Не найдена задача');
        err.status = 404;
        throw err;
      }

      const nextProjectId = hasProjectUpdate ? projectIdInput : task.project_id;
      if (!Number.isInteger(nextProjectId) || nextProjectId < 1) {
        const err = new Error('Для задачи должен быть указан project_id');
        err.status = 400;
        throw err;
      }

      await ensureProjectExists(Project, nextProjectId, transaction);

      let resolvedColumn = null;
      if (hasColumnUpdate) {
        resolvedColumn = await validateColumnById(Column, columnIdInput, nextProjectId, transaction);
      } else if (stat !== undefined) {
        resolvedColumn = await findColumnByName(Column, stat, nextProjectId, transaction);
        if (!resolvedColumn) {
          const err = new Error('Колонка с таким статусом не найдена в проекте');
          err.status = 400;
          throw err;
        }
      } else if (task.column_id) {
        const keepColumn = await Column.findOne({
          where: { id: task.column_id, project_id: nextProjectId },
          transaction,
        });
        if (!keepColumn) {
          const err = new Error('Нельзя сохранить задачу с колонкой другого проекта');
          err.status = 400;
          throw err;
        }
      }

      if (title !== undefined) task.title = String(title).trim() || task.title;
      if (text !== undefined) task.text = String(text);
      if (priority !== undefined) task.priority = normalizePriorityForStorage(priority);

      if (resolvedColumn) {
        const movedAcrossColumns = task.column_id !== resolvedColumn.id;
        task.stat = resolvedColumn.name;
        task.column_id = resolvedColumn.id;
        if (movedAcrossColumns) {
          task.position = await getNextTaskPosition(
            Task,
            nextProjectId,
            resolvedColumn.id,
            transaction,
          );
        }
      }

      task.project_id = nextProjectId;

      if (planning.provided) {
        task.planned_date = planning.plannedDate;
        task.duration_weeks = planning.durationWeeks;
        task.duration_days = planning.durationDays;
      }

      if (req.body?.customerName !== undefined || req.body?.customer_name !== undefined) {
        task.customer_name = normalizeNullableText(req.body?.customerName ?? req.body?.customer_name);
      }
      if (req.body?.assigneeName !== undefined || req.body?.assignee_name !== undefined) {
        task.assignee_name = normalizeNullableText(req.body?.assigneeName ?? req.body?.assignee_name);
      }
      if (req.body?.assigneeInitials !== undefined || req.body?.assignee_initials !== undefined) {
        task.assignee_initials = normalizeNullableText(req.body?.assigneeInitials ?? req.body?.assignee_initials);
      } else if (task.assignee_name && !task.assignee_initials) {
        task.assignee_initials = task.assignee_name.slice(0, 2).toUpperCase();
      }
      if (req.body?.tags !== undefined) {
        task.tags = normalizeTags(req.body.tags);
      }

      await task.save({ transaction });
      return task;
    });

    res.json(updatedTask);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// вернёт все задачи при запросе к корню
app.get('/', requireAuth, async (req, res) => {
  try {
    const { Task } = await getModelsForReq(req);
    const tasks = await Task.findAll();
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Фильтрация задач по приоритету/статусу/пользователю
app.get('/tasks/filter', requireAuth, async (req, res) => {
  const { priority, stat, userId } = req.query;
  const projectId = req.query.projectId ?? req.query.project_id;
  const columnId = req.query.columnId ?? req.query.column_id;
  const where = {};
  if (userId !== undefined) {
    const parsedUserId = parseEntityId(userId);
    if (!Number.isFinite(parsedUserId)) {
      return res.status(400).json({ error: 'Некорректный userId' });
    }
    where.user_id = parsedUserId;
  }
  if (priority) where.priority = priority;
  if (stat) where.stat = stat;
  if (projectId !== undefined) {
    const parsedProjectId = parseEntityId(projectId);
    if (!Number.isFinite(parsedProjectId)) {
      return res.status(400).json({ error: 'Некорректный projectId' });
    }
    where.project_id = parsedProjectId;
  }
  if (columnId !== undefined) {
    const parsedColumnId = parseEntityId(columnId);
    if (!Number.isFinite(parsedColumnId)) {
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
    const hasProjectFilter = req.query.projectId !== undefined || req.query.project_id !== undefined;
    const projectId = parseEntityId(req.query.projectId ?? req.query.project_id);
    if (hasProjectFilter && !Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Некорректный projectId' });
    }
    const where = {};
    if (projectId !== null) where.project_id = projectId;
    const columns = await Column.findAll({
      where,
      include: [{
        model: Task,
        required: false,
        where: { ...(projectId !== null ? { project_id: projectId } : {}) },
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
    const { Column, Project } = await getModelsForReq(req);
    const hasProjectInBody = req.body?.projectId !== undefined || req.body?.project_id !== undefined;
    const projectId = readProjectIdFromBody(req.body);
    if (hasProjectInBody && !Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Некорректный projectId/project_id' });
    }
    if (projectId !== null) {
      await ensureProjectExists(Project, projectId);
    }
    const where = { name };
    if (projectId !== null) where.project_id = projectId;
    const existing = await Column.findOne({ where });
    if (existing) {
      return res.status(409).json({ error: 'Колонка с таким названием уже существует' });
    }
    const column = await Column.create({ name, project_id: projectId ?? null });
    res.status(201).json(column);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// удаление задачи по id
app.delete('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { Task } = await getModelsForReq(req);
    const deleted = await Task.destroy({
      where: { id: req.params.id },
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
