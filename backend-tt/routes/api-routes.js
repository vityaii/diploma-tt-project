const express = require('express');
const { requireAuth } = require('../auth/require-auth');
const { getBaseSequelize, getModelsForReq } = require('../db/sequelize');
const {
  parseProjectIdInput,
  parseProjectIdFromRequest,
} = require('../utils/task-utils');
const {
  getBoardPayload,
  ensureDefaultColumnsForProject,
  syncBoardToTables,
} = require('../services/board-service');
const { ensureProjectExists } = require('../services/project-service');
const {
  resolveActorUsername,
  createActivityLog,
} = require('../services/activity-service');

function validateBoardPayload(board) {
  if (!board || typeof board !== 'object') {
    return 'Missing board';
  }
  if (!Array.isArray(board.columns) || typeof board.cards !== 'object' || board.cards === null) {
    return 'Invalid board shape';
  }
  return null;
}

function createApiRouter() {
  const router = express.Router();

  router.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  router.get('/api/changelog', requireAuth, async (req, res) => {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.trunc(rawLimit))) : 30;

    try {
      const sequelize = getBaseSequelize();
      const { ActivityLog } = sequelize.models;
      const entries = await ActivityLog.findAll({
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        limit,
      });
      res.json(entries);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/projects', requireAuth, async (req, res) => {
    try {
      const sequelize = getBaseSequelize();
      const { Project } = sequelize.models;
      const projects = await Project.findAll({ order: [['id', 'ASC']] });
      res.json(projects);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/projects', requireAuth, async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const theme = String(req.body?.theme ?? '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Укажите name' });
    }
    try {
      const sequelize = getBaseSequelize();
      const { Project, Column, User, ActivityLog } = sequelize.models;
      const createdProject = await sequelize.transaction(async (transaction) => {
        const project = await Project.create({ name, theme }, { transaction });
        await ensureDefaultColumnsForProject(Column, project.id, transaction);
        const actorUsername = await resolveActorUsername(User, req.auth.userId, req.auth.username, transaction);
        await createActivityLog(ActivityLog, {
          eventType: 'project_created',
          actorUserId: req.auth.userId,
          metadata: {
            actorUsername,
            projectId: project.id,
            projectName: project.name,
          },
        }, transaction);
        return project;
      });
      res.status(201).json(createdProject);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/projects/:projectId/board', requireAuth, async (req, res) => {
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

  router.get('/api/projects/:projectId/tasks', requireAuth, async (req, res) => {
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

  router.put('/api/projects/:projectId/board', requireAuth, async (req, res) => {
    const projectId = parseProjectIdInput(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Некорректный projectId' });
    }

    const { board } = req.body || {};
    const boardError = validateBoardPayload(board);
    if (boardError) {
      return res.status(400).json({ error: boardError });
    }

    try {
      const sequelize = getBaseSequelize();
      const { Project, Column } = sequelize.models;
      const project = await ensureProjectExists(Project, projectId);
      await ensureDefaultColumnsForProject(Column, projectId);
      await syncBoardToTables(sequelize, board, projectId, {
        userId: req.auth.userId,
        username: req.auth.username,
        projectName: project.name,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.get('/api/board', requireAuth, async (req, res) => {
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

  router.put('/api/board', requireAuth, async (req, res) => {
    const projectId = parseProjectIdFromRequest(req);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Укажите projectId в query' });
    }

    const { board } = req.body || {};
    const boardError = validateBoardPayload(board);
    if (boardError) {
      return res.status(400).json({ error: boardError });
    }

    try {
      const sequelize = getBaseSequelize();
      const { Project, Column } = sequelize.models;
      const project = await ensureProjectExists(Project, projectId);
      await ensureDefaultColumnsForProject(Column, projectId);
      await syncBoardToTables(sequelize, board, projectId, {
        userId: req.auth.userId,
        username: req.auth.username,
        projectName: project.name,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createApiRouter, validateBoardPayload };
