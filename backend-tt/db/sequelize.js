const { Sequelize } = require('sequelize');
const { databaseUrlApp } = require('../config/config');
const { defineModels } = require('./models');

const sequelizeCache = new Map();

function createSequelize(connectionString = databaseUrlApp) {
  const sequelize = new Sequelize(connectionString, {
    dialect: 'postgres',
    logging: false,
  });
  defineModels(sequelize);
  return sequelize;
}

function getBaseSequelize() {
  if (!sequelizeCache.has('_app')) {
    sequelizeCache.set('_app', createSequelize(databaseUrlApp));
  }
  return sequelizeCache.get('_app');
}

async function getModelsForReq(req) {
  const sequelize = req?.app?.locals?.sequelize || getBaseSequelize();
  await sequelize.authenticate();
  return { ...sequelize.models, sequelize };
}

async function closeSequelizeCache() {
  const instances = [...sequelizeCache.values()];
  sequelizeCache.clear();
  await Promise.all(instances.map((sequelize) => sequelize.close()));
}

module.exports = {
  createSequelize,
  getBaseSequelize,
  getModelsForReq,
  closeSequelizeCache,
};
