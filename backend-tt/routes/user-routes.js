const express = require('express');
const { Op } = require('sequelize');
const { requireAuth } = require('../auth/require-auth');
const { getBaseSequelize } = require('../db/sequelize');

function createUserRouter() {
  const router = express.Router();

  router.get('/users/search', requireAuth, async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q.length) {
      return res.status(400).json({ error: 'Укажите q' });
    }
    try {
      const sequelize = getBaseSequelize();
      const { User } = sequelize.models;

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

  return router;
}

module.exports = { createUserRouter };
