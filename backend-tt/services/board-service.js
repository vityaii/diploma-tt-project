const { Op } = require('sequelize');
const {
  DEFAULT_BOARD_COLUMNS,
  isPositiveIntLike,
  normalizePriorityForStorage,
  normalizePriorityForBoard,
  normalizeNullableText,
  normalizeTags,
  normalizePlanningValues,
  getTaskComparableState,
  taskStatesEqual,
} = require('../utils/task-utils');
const {
  resolveActorUsername,
  createActivityLog,
  buildTaskActivityMetadata,
} = require('./activity-service');
const { ensureProjectExists } = require('./project-service');

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

async function syncBoardToTables(sequelize, board, projectId, actor) {
  const { Column, Task, User, ActivityLog } = sequelize.models;
  const normalizedProjectId = Number(projectId);
  if (!Number.isFinite(normalizedProjectId)) {
    throw new Error('Invalid projectId for board sync');
  }
  const normalizedUserId = Number(actor?.userId);
  if (!Number.isFinite(normalizedUserId)) {
    throw new Error('Invalid userId for board sync');
  }
  const normalizedProjectName = String(actor?.projectName ?? '').trim() || 'Project';

  const inputColumns = Array.isArray(board.columns) ? board.columns : [];
  const inputCards = board.cards && typeof board.cards === 'object' ? board.cards : {};

  await sequelize.transaction(async (t) => {
    const actorUsername = await resolveActorUsername(User, normalizedUserId, actor?.username, t);
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
      const nextTaskState = getTaskComparableState(patch);

      if (!existingTask) {
        const created = await Task.create({
          ...patch,
          user_id: normalizedUserId,
          client_id: isPositiveIntLike(boardCardId) ? null : boardCardId,
        }, { transaction: t });
        await createActivityLog(ActivityLog, {
          eventType: 'task_created',
          actorUserId: normalizedUserId,
          metadata: buildTaskActivityMetadata(created, {
            actorUsername,
            projectId: normalizedProjectId,
            projectName: normalizedProjectName,
          }),
        }, t);
        desiredTaskDbIds.add(created.id);
        continue;
      }

      const previousTaskState = getTaskComparableState(existingTask);
      const meaningfulChange = !taskStatesEqual(previousTaskState, nextTaskState);

      if (!existingTask.client_id && !isPositiveIntLike(boardCardId)) {
        patch.client_id = boardCardId;
      }
      if (!meaningfulChange && (patch.client_id ?? null) === (existingTask.client_id ?? null)) {
        desiredTaskDbIds.add(existingTask.id);
        continue;
      }

      await existingTask.update(patch, { transaction: t });
      if (meaningfulChange) {
        await createActivityLog(ActivityLog, {
          eventType: 'task_updated',
          actorUserId: normalizedUserId,
          metadata: buildTaskActivityMetadata(existingTask, {
            actorUsername,
            projectId: normalizedProjectId,
            projectName: normalizedProjectName,
          }),
        }, t);
      }
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

async function getBoardPayload(sequelize, projectId) {
  const { Project, Column } = sequelize.models;
  await ensureProjectExists(Project, projectId);
  await ensureDefaultColumnsForProject(Column, projectId);
  return buildBoardFromTables(sequelize, projectId);
}

module.exports = {
  ensureDefaultColumnsForProject,
  cardIdFromTask,
  mapTaskToBoardCard,
  getNextTaskNumber,
  getNextTaskPosition,
  syncBoardToTables,
  buildBoardFromTables,
  getBoardPayload,
};
