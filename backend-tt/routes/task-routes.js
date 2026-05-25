const express = require('express');
const { Op } = require('sequelize');
const { requireAuth } = require('../auth/require-auth');
const { getModelsForReq } = require('../db/sequelize');
const {
  normalizePriorityForStorage,
  normalizeNullableText,
  normalizeTags,
  parsePlanningPayload,
  getTaskComparableState,
  taskStatesEqual,
  parseEntityId,
  readProjectIdFromBody,
  readColumnIdFromBody,
} = require('../utils/task-utils');
const {
  getNextTaskNumber,
  getNextTaskPosition,
} = require('../services/board-service');
const { ensureProjectExists } = require('../services/project-service');
const {
  findColumnByName,
  validateColumnById,
  resolveColumnForTask,
} = require('../services/column-service');
const {
  resolveActorUsername,
  createActivityLog,
  buildTaskActivityMetadata,
} = require('../services/activity-service');

function createTaskRouter() {
  const router = express.Router();

  router.get('/tasks', requireAuth, async (req, res) => {
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

  router.get('/tasks/search', requireAuth, async (req, res) => {
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

  router.get('/tasks/filter', requireAuth, async (req, res) => {
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

  router.get('/tasks/:id', requireAuth, async (req, res) => {
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

  router.post('/tasks', requireAuth, async (req, res) => {
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
      const { Task, Column, Project, User, ActivityLog, sequelize } = await getModelsForReq(req);
      const task = await sequelize.transaction(async (transaction) => {
        const project = await ensureProjectExists(Project, projectId, transaction);
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

        const createdTask = await Task.create({
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

        const actorUsername = await resolveActorUsername(User, req.auth.userId, req.auth.username, transaction);
        await createActivityLog(ActivityLog, {
          eventType: 'task_created',
          actorUserId: req.auth.userId,
          metadata: buildTaskActivityMetadata(createdTask, {
            actorUsername,
            projectId: project.id,
            projectName: project.name,
          }),
        }, transaction);

        return createdTask;
      });

      res.status(201).json(task);
    } catch (err) {
      res.status(err.status || 500).json({
        error: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }
  });

  router.put('/tasks/:id', requireAuth, async (req, res) => {
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
      const { Task, Column, Project, User, ActivityLog, sequelize } = await getModelsForReq(req);
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
        const previousTaskState = getTaskComparableState(task);

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

        const nextTaskState = getTaskComparableState(task);
        const meaningfulChange = !taskStatesEqual(previousTaskState, nextTaskState);

        if (meaningfulChange) {
          await task.save({ transaction });
          const actorUsername = await resolveActorUsername(User, req.auth.userId, req.auth.username, transaction);
          const project = await ensureProjectExists(Project, nextProjectId, transaction);
          await createActivityLog(ActivityLog, {
            eventType: 'task_updated',
            actorUserId: req.auth.userId,
            metadata: buildTaskActivityMetadata(task, {
              actorUsername,
              projectId: project.id,
              projectName: project.name,
            }),
          }, transaction);
        }

        return task;
      });

      res.json(updatedTask);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.get('/', requireAuth, async (req, res) => {
    try {
      const { Task } = await getModelsForReq(req);
      const tasks = await Task.findAll();
      res.json(tasks);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/tasks/:id', requireAuth, async (req, res) => {
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

  return router;
}

module.exports = { createTaskRouter };
