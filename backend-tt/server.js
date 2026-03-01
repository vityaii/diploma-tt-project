const { ensureSchema } = require('./db/ensure-schema.js');

async function start() {
  await ensureSchema();
  // Основное API поднято в app.js
  require('./app.js');
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
