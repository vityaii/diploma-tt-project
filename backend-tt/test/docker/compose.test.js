const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const shouldRun = process.env.RUN_DOCKER === '1';
const repoRoot = path.resolve(__dirname, '../../..');

function runDockerCompose(args) {
  const result = spawnSync('docker', ['compose', '-f', 'compose.yml', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    [
      `docker compose ${args.join(' ')} failed`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'),
  );

  return result.stdout;
}

function getServiceBlock(config, serviceName) {
  const match = config.match(new RegExp(`(?:^|\\n)  ${serviceName}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:\\n|\\nnetworks:|\\nvolumes:|$)`));
  assert.ok(match, `Service ${serviceName} is missing in docker compose config`);
  return match[1];
}

function assertPortMapping(serviceBlock, publishedPort, targetPort) {
  assert.match(
    serviceBlock,
    new RegExp(`ports:\\n[\\s\\S]*?target:\\s+${targetPort}\\n[\\s\\S]*?published:\\s+"?${publishedPort}"?`),
  );
}

if (!shouldRun) {
  test('docker tests are skipped by default', { skip: 'Run npm run test:docker to validate Docker Compose' }, () => {});
} else {
  test('Docker Compose config defines required services', () => {
    const services = runDockerCompose(['config', '--services'])
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    assert.equal(services.includes('db'), true);
    assert.equal(services.includes('backend'), true);
    assert.equal(services.includes('frontend'), true);
    assert.equal(services.includes('jenkins'), true);
  });

  test('Docker Compose config wires backend, database and frontend', () => {
    const config = runDockerCompose(['config']);
    const db = getServiceBlock(config, 'db');
    const backend = getServiceBlock(config, 'backend');
    const frontend = getServiceBlock(config, 'frontend');
    const jenkins = getServiceBlock(config, 'jenkins');

    assert.match(config, /backend:/);
    assert.match(config, /db:/);
    assert.match(config, /frontend:/);
    assert.match(config, /jenkins:/);
    assert.match(config, /DATABASE_URL_APP:\s+postgres:\/\/postgres:root@db:5432\/ttbd/);
    assert.match(config, /DATABASE_URL_ADMIN:\s+postgres:\/\/postgres:root@db:5432\/ttbd/);
    assert.match(config, /VITE_DEV_PROXY_TARGET:\s+http:\/\/backend:7070/);
    assertPortMapping(db, 5431, 5432);
    assertPortMapping(backend, 7070, 7070);
    assertPortMapping(frontend, 5173, 5173);
    assertPortMapping(jenkins, 8081, 8080);
  });
}
