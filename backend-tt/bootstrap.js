const { Sequelize } = require('sequelize');
const app = require('./app');
const {
  databaseUrlAdmin,
  databaseUrlApp,
  port,
} = require('./config/config');
const { defineModels } = require('./db/models');
const { getBaseSequelize } = require('./db/sequelize');
const { backfillColumns } = require('./services/column-service');

async function syncDatabaseModels() {
  const baseSequelize = getBaseSequelize();
  const { Task, Column, BoardState, User, Project, ActivityLog } = baseSequelize.models;

  if (!databaseUrlAdmin || databaseUrlAdmin === databaseUrlApp) {
    await User.sync({ alter: true });
    await Project.sync({ alter: true });
    await Column.sync({ alter: true });
    await Task.sync({ alter: true });
    await BoardState.sync({ alter: true });
    await ActivityLog.sync({ alter: true });
    return baseSequelize;
  }

  const adminSequelize = new Sequelize(databaseUrlAdmin, { dialect: 'postgres', logging: false });
  const adminModels = defineModels(adminSequelize);
  try {
    await adminSequelize.authenticate();
    await adminModels.User.sync({ alter: true });
    await adminModels.Project.sync({ alter: true });
    await adminModels.Column.sync({ alter: true });
    await adminModels.Task.sync({ alter: true });
    await adminModels.BoardState.sync({ alter: true });
    await adminModels.ActivityLog.sync({ alter: true });
  } finally {
    await adminSequelize.close();
  }

  return baseSequelize;
}

async function startServer({ expressApp = app, listenPort = port } = {}) {
  const baseSequelize = await syncDatabaseModels();
  await backfillColumns(baseSequelize);
  await baseSequelize.authenticate();

  return new Promise((resolve) => {
    const server = expressApp.listen(listenPort, () => {
      console.log(`Server running on port ${listenPort}`);
      resolve(server);
    });
  });
}

module.exports = {
  syncDatabaseModels,
  startServer,
};

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Unable to start server:', err);
    process.exit(1);
  });
}
