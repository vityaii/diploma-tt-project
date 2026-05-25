const express = require('express');
const { requireAuth } = require('../auth/require-auth');
const { getModelsForReq } = require('../db/sequelize');
const {
  parseEntityId,
  readProjectIdFromBody,
} = require('../utils/task-utils');
const { ensureProjectExists } = require('../services/project-service');

function createColumnRouter() {
  const router = express.Router();

  router.get('/columns', requireAuth, async (req, res) => {
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

  router.post('/columns', requireAuth, async (req, res) => {
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

  return router;
}

module.exports = { createColumnRouter };
