const { ensureSchema } = require('./db/ensure-schema.js');
const { startServer } = require('./bootstrap');

async function start() {
  await ensureSchema();
  await startServer();
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
