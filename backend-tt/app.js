const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const authRouter = require('./auth/auth');
const { sessionSecret } = require('./config/config');
const { createApiRouter } = require('./routes/api-routes');
const { createTaskRouter } = require('./routes/task-routes');
const { createUserRouter } = require('./routes/user-routes');
const { createColumnRouter } = require('./routes/column-routes');

function loadOpenApiSpec() {
  const openapiPath = path.resolve(__dirname, 'openapi.yaml');
  try {
    return yaml.load(fs.readFileSync(openapiPath, 'utf8'));
  } catch (err) {
    console.warn(`OpenAPI spec not loaded from ${openapiPath}:`, err.message);
    return {
      openapi: '3.0.0',
      info: { title: 'API', version: '0.0.0' },
      paths: {},
    };
  }
}

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
  }));

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(loadOpenApiSpec()));
  app.use(authRouter);
  app.use(createApiRouter());
  app.use(createTaskRouter());
  app.use(createUserRouter());
  app.use(createColumnRouter());

  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
module.exports.loadOpenApiSpec = loadOpenApiSpec;

if (require.main === module) {
  const { startServer } = require('./bootstrap');
  startServer().catch((err) => {
    console.error('Unable to start server:', err);
    process.exit(1);
  });
}
