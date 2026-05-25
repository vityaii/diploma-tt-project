const {
  normalizeNullableText,
  readColumnClientIdFromBody,
  readColumnIdFromBody,
} = require('../utils/task-utils');
const { ensureDefaultColumnsForProject } = require('./board-service');

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

async function backfillColumns(baseSequelize) {
  const { Task, Column } = baseSequelize.models;
  const tasks = await Task.findAll({
    attributes: ['id', 'user_id', 'stat', 'column_id', 'project_id'],
  });

  const cache = new Map();
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

module.exports = {
  findColumnByName,
  validateColumnById,
  resolveColumnForTask,
  backfillColumns,
};
