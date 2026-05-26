const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const reportsDir = path.join(rootDir, 'reports');
const junitPath = path.join(reportsDir, 'junit.xml');
const markdownPath = path.join(reportsDir, 'test-summary.md');
const htmlPath = path.join(reportsDir, 'test-summary.html');
const consolePath = path.join(reportsDir, 'test-console.txt');
const TEST_NAME_TRANSLATIONS = {
  'registerUser creates a user, stores activity log and returns JWT tokens':
    'Регистрация создает пользователя, записывает событие в журнал и возвращает JWT-токены',
  'registerUser rejects duplicate username':
    'Регистрация отклоняет занятое имя пользователя',
  'loginUser authenticates valid credentials and returns JWT tokens':
    'Вход в систему принимает корректные учетные данные и возвращает JWT-токены',
  'loginUser rejects missing user and invalid password':
    'Вход в систему отклоняет отсутствующего пользователя и неверный пароль',
  'changePassword verifies old password and updates password hash':
    'Смена пароля проверяет старый пароль и обновляет хэш пароля',
  'changePassword rejects invalid old password':
    'Смена пароля отклоняет неверный старый пароль',
  'refreshAccessToken returns access token only for valid refresh token':
    'Обновление access token выполняется только по корректному refresh token',
  'ensureProjectExists returns project or throws 404':
    'Проверка проекта возвращает найденный проект или ошибку 404',
  'ensureDefaultColumnsForProject creates default board columns only for empty project':
    'Стандартные колонки доски создаются только для пустого проекта',
  'task numbering helpers use max task number and position':
    'Расчет номера и позиции задачи учитывает максимальные значения',
  'buildBoardFromTables maps columns, cards and unassigned tasks to board payload':
    'Сборка доски преобразует колонки, карточки и задачи без колонки в структуру board',
  'getBoardPayload validates project, creates defaults and returns board':
    'Получение доски проверяет проект, создает стандартные колонки и возвращает board',
  'syncBoardToTables creates columns, tasks and activity logs from board payload':
    'Синхронизация доски создает колонки, задачи и записи журнала активности',
  'syncBoardToTables removes tasks and columns missing from incoming board':
    'Синхронизация доски удаляет отсутствующие во входных данных задачи и колонки',
  'normalizes priority values for storage and board output':
    'Нормализация приоритета корректно подготавливает значения для хранения и вывода на доске',
  'normalizes tags by trimming empty values and limiting size':
    'Нормализация тегов удаляет пустые значения и ограничивает размер списка',
  'parses planning payload and rejects invalid values':
    'Парсинг параметров планирования принимает корректные значения и отклоняет ошибки',
  'builds stable comparable task state':
    'Формирование состояния задачи создает стабильную структуру для сравнения',
  'parses positive entity ids only':
    'Парсинг идентификаторов принимает только положительные числовые значения',
};
const TEST_CASE_DETAILS = {
  'registerUser creates a user, stores activity log and returns JWT tokens': {
    className: 'AuthServiceTest',
    method: 'registerUser()',
    scenario: 'Успешная регистрация нового пользователя',
    input: 'username = new_user, password = secret123; пользователь отсутствует в БД',
    expected: 'Создан пользователь, записано событие user_created, возвращены accessToken и refreshToken',
  },
  'registerUser rejects duplicate username': {
    className: 'AuthServiceTest',
    method: 'registerUser()',
    scenario: 'Попытка регистрации с уже занятым именем пользователя',
    input: 'username = busy_user; запрос SELECT возвращает rowCount = 1',
    expected: 'Возвращается ошибка со статусом 409 и сообщением "Имя пользователя занято"',
  },
  'loginUser authenticates valid credentials and returns JWT tokens': {
    className: 'AuthServiceTest',
    method: 'loginUser()',
    scenario: 'Успешный вход пользователя в систему',
    input: 'username = known_user, password = secret123; в БД хранится корректный password_hash',
    expected: 'Пароль проходит проверку bcrypt, возвращаются данные пользователя и JWT-токены',
  },
  'loginUser rejects missing user and invalid password': {
    className: 'AuthServiceTest',
    method: 'loginUser()',
    scenario: 'Отказ при отсутствующем пользователе или неверном пароле',
    input: 'Пустой результат SELECT или password != password_hash',
    expected: 'Возвращается ошибка со статусом 401 и сообщением "Неверные учетные данные"',
  },
  'changePassword verifies old password and updates password hash': {
    className: 'AuthServiceTest',
    method: 'changePassword()',
    scenario: 'Успешная смена пароля',
    input: 'userId = 21, oldPassword = old-secret, newPassword = new-secret',
    expected: 'Старый пароль подтвержден, выполнен UPDATE users с новым bcrypt-хэшем',
  },
  'changePassword rejects invalid old password': {
    className: 'AuthServiceTest',
    method: 'changePassword()',
    scenario: 'Отказ при неверном старом пароле',
    input: 'oldPassword = bad-secret, password_hash соответствует другому паролю',
    expected: 'Возвращается ошибка со статусом 401 и сообщением "Неверные учетные данные"',
  },
  'refreshAccessToken returns access token only for valid refresh token': {
    className: 'AuthServiceTest',
    method: 'refreshAccessToken()',
    scenario: 'Обновление access token по refresh token',
    input: 'Корректный refreshToken и строка invalid.token.value',
    expected: 'Для корректного refreshToken возвращается accessToken; для некорректного токена ошибка 401',
  },
  'ensureProjectExists returns project or throws 404': {
    className: 'ProjectBoardServicesTest',
    method: 'ensureProjectExists()',
    scenario: 'Проверка существования проекта',
    input: 'projectId = 1 и projectId = 999',
    expected: 'Для существующего проекта возвращается объект проекта; для отсутствующего проекта ошибка 404',
  },
  'ensureDefaultColumnsForProject creates default board columns only for empty project': {
    className: 'ProjectBoardServicesTest',
    method: 'ensureDefaultColumnsForProject()',
    scenario: 'Создание стандартных колонок доски',
    input: 'projectId = 3; первый count = 0, повторный count = 4',
    expected: 'Для пустого проекта создаются todo, inprogress, review, done; повторное создание не выполняется',
  },
  'task numbering helpers use max task number and position': {
    className: 'ProjectBoardServicesTest',
    method: 'getNextTaskNumber(), getNextTaskPosition()',
    scenario: 'Расчет следующего номера задачи и позиции в колонке',
    input: 'max(task_number) = 8, max(id) = 12, max(position) = 3',
    expected: 'Следующий номер задачи равен 13, следующая позиция равна 4',
  },
  'buildBoardFromTables maps columns, cards and unassigned tasks to board payload': {
    className: 'ProjectBoardServicesTest',
    method: 'buildBoardFromTables()',
    scenario: 'Формирование структуры доски из колонок и задач',
    input: 'Колонки To Do и Done; одна задача в колонке, одна задача без актуальной колонки',
    expected: 'Возвращается board с cardIds, cards и дополнительной колонкой Unassigned',
  },
  'getBoardPayload validates project, creates defaults and returns board': {
    className: 'ProjectBoardServicesTest',
    method: 'getBoardPayload()',
    scenario: 'Получение данных доски проекта',
    input: 'projectId = 4; проект существует, колонки отсутствуют',
    expected: 'Проект проверен, созданы стандартные колонки, возвращена структура board',
  },
  'syncBoardToTables creates columns, tasks and activity logs from board payload': {
    className: 'ProjectBoardServicesTest',
    method: 'syncBoardToTables()',
    scenario: 'Синхронизация новой доски с таблицами',
    input: 'Board с колонками todo/done и карточкой card-1',
    expected: 'Созданы колонки, задача, рассчитаны поля планирования и записан task_created в журнал',
  },
  'syncBoardToTables removes tasks and columns missing from incoming board': {
    className: 'ProjectBoardServicesTest',
    method: 'syncBoardToTables()',
    scenario: 'Удаление задач и колонок, отсутствующих во входящей доске',
    input: 'В БД есть колонка done и задача card-10, во входящем board их нет',
    expected: 'Выполнено удаление отсутствующей задачи и колонки, оставшаяся колонка обновлена',
  },
  'normalizes priority values for storage and board output': {
    className: 'TaskUtilsTest',
    method: 'normalizePriorityForStorage(), normalizePriorityForBoard()',
    scenario: 'Нормализация приоритета для хранения и отображения',
    input: 'normal, HIGH, unknown, low',
    expected: 'Значения приведены к medium/high/medium и Low/Medium для доски',
  },
  'normalizes tags by trimming empty values and limiting size': {
    className: 'TaskUtilsTest',
    method: 'normalizeTags()',
    scenario: 'Очистка и ограничение списка тегов',
    input: 'Массив тегов с пробелами, пустыми значениями и более чем 20 элементами',
    expected: 'Пустые значения удалены, строки обрезаны, итоговый список ограничен 20 тегами',
  },
  'parses planning payload and rejects invalid values': {
    className: 'TaskUtilsTest',
    method: 'parsePlanningPayload()',
    scenario: 'Проверка параметров планирования задачи',
    input: 'plannedDate = 2026-05-25, durationWeeks = 1, durationDays = 9; некорректная дата и отрицательная длительность',
    expected: 'Корректные значения нормализованы в 2 недели и 2 дня; ошибки отклонены',
  },
  'builds stable comparable task state': {
    className: 'TaskUtilsTest',
    method: 'getTaskComparableState(), taskStatesEqual()',
    scenario: 'Сравнение эквивалентных состояний задачи',
    input: 'Два объекта задачи с разным форматом, но одинаковым смысловым состоянием',
    expected: 'Состояния нормализованы и считаются равными',
  },
  'parses positive entity ids only': {
    className: 'TaskUtilsTest',
    method: 'parseEntityId()',
    scenario: 'Проверка допустимости идентификаторов',
    input: '12, пустая строка, abc, -1',
    expected: '12 преобразуется в число, пустая строка дает null, некорректные значения отклоняются',
  },
};

function ensureReportsDir() {
  fs.mkdirSync(reportsDir, { recursive: true });
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function getAttribute(source, attrName) {
  const match = source.match(new RegExp(`${attrName}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeMarkdownCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function parseSummaryComment(xml, name) {
  const match = xml.match(new RegExp(`<!--\\s*${name}\\s+([^\\s]+)\\s*-->`));
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTestCases(xml) {
  const cases = [];
  const testcasePattern = /<testcase\b[\s\S]*?(?:\/>|<\/testcase>)/g;
  const matches = xml.match(testcasePattern) || [];

  for (const testcaseXml of matches) {
    const name = getAttribute(testcaseXml, 'name');
    const file = getAttribute(testcaseXml, 'file');
    const timeSeconds = Number(getAttribute(testcaseXml, 'time')) || 0;
    const failed = /<failure\b/.test(testcaseXml) || /<error\b/.test(testcaseXml);
    const skipped = /<skipped\b/.test(testcaseXml);

    cases.push({
      originalName: name,
      name: TEST_NAME_TRANSLATIONS[name] || name,
      file: path.relative(rootDir, file),
      durationMs: Math.round(timeSeconds * 1000 * 1000) / 1000,
      status: failed ? 'FAIL' : skipped ? 'SKIP' : 'PASS',
      details: TEST_CASE_DETAILS[name] || {
        className: 'Не указано',
        method: 'Не указано',
        scenario: TEST_NAME_TRANSLATIONS[name] || name,
        input: 'Не указано',
        expected: failed ? 'Тест должен выявить ошибку' : 'Тест должен завершиться успешно',
      },
    });
  }

  return cases;
}

function parseJunit(xml) {
  const cases = parseTestCases(xml);
  return {
    generatedAt: new Date().toISOString(),
    tests: parseSummaryComment(xml, 'tests') || cases.length,
    passed: parseSummaryComment(xml, 'pass'),
    failed: parseSummaryComment(xml, 'fail'),
    skipped: parseSummaryComment(xml, 'skipped'),
    cancelled: parseSummaryComment(xml, 'cancelled'),
    todo: parseSummaryComment(xml, 'todo'),
    durationMs: parseSummaryComment(xml, 'duration_ms'),
    cases,
  };
}

function formatSeconds(durationMs) {
  return `${(Number(durationMs || 0) / 1000).toFixed(3)}s`;
}

function getConsoleGroupTitle(file) {
  const normalized = String(file || '').replace(/\//g, '\\');
  if (normalized.endsWith('auth-service.test.js')) {
    return 'Tests\\Unit\\Auth\\AuthServiceTest';
  }
  if (normalized.endsWith('project-board-services.test.js')) {
    return 'Tests\\Unit\\Services\\ProjectBoardServicesTest';
  }
  if (normalized.endsWith('task-utils.test.js')) {
    return 'Tests\\Unit\\Utils\\TaskUtilsTest';
  }
  return `Tests\\Unit\\${normalized}`;
}

function groupTestCasesByFile(cases) {
  const groups = [];
  const byFile = new Map();

  for (const testCase of cases) {
    if (!byFile.has(testCase.file)) {
      const group = {
        file: testCase.file,
        title: getConsoleGroupTitle(testCase.file),
        cases: [],
      };
      byFile.set(testCase.file, group);
      groups.push(group);
    }
    byFile.get(testCase.file).cases.push(testCase);
  }

  return groups;
}

function buildConsoleReport(report) {
  const lines = [];
  const groups = groupTestCasesByFile(report.cases);
  const status = report.failed === 0 && report.cancelled === 0 ? 'PASS' : 'FAIL';
  const totalAssertions = report.tests;

  for (const group of groups) {
    lines.push(`${status}  ${group.title}`);
    for (const testCase of group.cases) {
      const marker = testCase.status === 'PASS' ? '✓' : '✕';
      lines.push(`${marker} ${testCase.name.padEnd(96, ' ')} ${formatSeconds(testCase.durationMs)}`);
    }
    lines.push('');
  }

  lines.push(`Tests:    ${report.passed} passed (${totalAssertions} assertions)`);
  lines.push(`Duration: ${formatSeconds(report.durationMs)}`);
  lines.push('');

  return lines.join('\n');
}

function buildMarkdown(report) {
  const status = report.failed === 0 && report.cancelled === 0 ? 'PASSED' : 'FAILED';
  const rows = report.cases.map((testCase, index) => (
    `| ${index + 1} | ${testCase.status} | ${testCase.name} | ${testCase.file} | ${formatSeconds(testCase.durationMs)} |`
  ));
  const scenarioRows = report.cases.map((testCase) => {
    const details = testCase.details;
    return [
      escapeMarkdownCell(details.className),
      escapeMarkdownCell(details.method),
      escapeMarkdownCell(details.scenario),
      escapeMarkdownCell(details.input),
      escapeMarkdownCell(details.expected),
    ].join(' | ');
  }).map((row) => `| ${row} |`);

  return [
    '# Отчет о модульном тестировании',
    '',
    `Дата формирования: ${report.generatedAt}`,
    `Итоговый статус: ${status}`,
    '',
    '## Сводка',
    '',
    '| Показатель | Значение |',
    '| --- | ---: |',
    `| Всего тестов | ${report.tests} |`,
    `| Успешно | ${report.passed} |`,
    `| Ошибок | ${report.failed} |`,
    `| Пропущено | ${report.skipped} |`,
    `| Отменено | ${report.cancelled} |`,
    `| TODO | ${report.todo} |`,
    `| Длительность | ${formatSeconds(report.durationMs)} |`,
    '',
    '## Таблица тестовых сценариев',
    '',
    '| Класс тестов | Проверяемый метод | Сценарий | Входные данные | Ожидаемый результат |',
    '| --- | --- | --- | --- | --- |',
    ...scenarioRows,
    '',
    '## Детализация',
    '',
    '| № | Статус | Тест | Файл | Время выполнения |',
    '| ---: | --- | --- | --- | ---: |',
    ...rows,
    '',
    '## Интерпретация',
    '',
    status === 'PASSED'
      ? 'Все проверенные модули прошли тестирование. Ошибок выполнения и нарушений ожидаемого поведения не выявлено.'
      : 'В ходе тестирования обнаружены ошибки. Перед фиксацией результата требуется проанализировать тесты со статусом FAIL.',
    '',
  ].join('\n');
}

function buildHtml(report) {
  const status = report.failed === 0 && report.cancelled === 0 ? 'PASSED' : 'FAILED';
  const successRate = report.tests > 0 ? Math.round((report.passed / report.tests) * 100) : 0;
  const rows = report.cases.map((testCase, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><span class="status status-${testCase.status.toLowerCase()}">${testCase.status}</span></td>
          <td>${escapeHtml(testCase.name)}</td>
          <td>${escapeHtml(testCase.file)}</td>
          <td class="number">${formatSeconds(testCase.durationMs)}</td>
        </tr>`).join('');
  const scenarioRows = report.cases.map((testCase) => {
    const details = testCase.details;
    return `
        <tr>
          <td class="test-class">${escapeHtml(details.className)}</td>
          <td class="test-method">${escapeHtml(details.method)}</td>
          <td>${escapeHtml(details.scenario)}</td>
          <td>${escapeHtml(details.input)}</td>
          <td>${escapeHtml(details.expected)}</td>
        </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Отчет о модульном тестировании</title>
  <style>
    :root {
      --bg: #f6f7f9;
      --text: #111827;
      --muted: #5b6472;
      --border: #d7dce3;
      --pass: #0f8a4b;
      --fail: #c2410c;
      --skip: #6b7280;
      --card: #ffffff;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", Arial, sans-serif;
      line-height: 1.45;
    }
    main {
      max-width: 1180px;
      margin: 40px auto;
      padding: 0 24px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 32px;
    }
    .muted {
      color: var(--muted);
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .card strong {
      display: block;
      font-size: 28px;
      margin-top: 4px;
    }
    .bar {
      height: 14px;
      background: #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
      margin: 10px 0 24px;
    }
    .bar span {
      display: block;
      height: 100%;
      width: ${successRate}%;
      background: var(--pass);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 28px;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #eef1f5;
      font-weight: 700;
    }
    .scenario-table th {
      background: #dcefd5;
      color: #111827;
    }
    .scenario-table .test-class {
      background: #f4f5f7;
      font-weight: 700;
      text-align: center;
      vertical-align: middle;
      white-space: nowrap;
    }
    .scenario-table .test-method {
      background: #ddd6ef;
      font-family: "Segoe UI", Arial, sans-serif;
      font-weight: 700;
      text-align: center;
      vertical-align: middle;
    }
    h2 {
      margin: 28px 0 12px;
      font-size: 22px;
    }
    tr:last-child td {
      border-bottom: 0;
    }
    .number {
      text-align: right;
      white-space: nowrap;
    }
    .status {
      display: inline-block;
      min-width: 52px;
      border-radius: 999px;
      padding: 3px 9px;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
    }
    .status-pass { background: var(--pass); }
    .status-fail { background: var(--fail); }
    .status-skip { background: var(--skip); }
    .conclusion {
      margin-top: 24px;
      border-left: 4px solid ${status === 'PASSED' ? 'var(--pass)' : 'var(--fail)'};
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Отчет о модульном тестировании</h1>
        <div class="muted">Дата формирования: ${escapeHtml(report.generatedAt)}</div>
      </div>
      <span class="status status-${status === 'PASSED' ? 'pass' : 'fail'}">${status}</span>
    </header>

    <section class="summary">
      <div class="card">Всего тестов<strong>${report.tests}</strong></div>
      <div class="card">Успешно<strong>${report.passed}</strong></div>
      <div class="card">Ошибок<strong>${report.failed}</strong></div>
      <div class="card">Длительность<strong>${formatSeconds(report.durationMs)}</strong></div>
    </section>

    <div class="muted">Доля успешно пройденных тестов: ${successRate}%</div>
    <div class="bar"><span></span></div>

    <h2>Таблица тестовых сценариев</h2>
    <table class="scenario-table">
      <thead>
        <tr>
          <th>Класс тестов</th>
          <th>Проверяемый метод</th>
          <th>Сценарий</th>
          <th>Входные данные</th>
          <th>Ожидаемый результат</th>
        </tr>
      </thead>
      <tbody>${scenarioRows}
      </tbody>
    </table>

    <h2>Детализация выполнения</h2>
    <table>
      <thead>
        <tr>
          <th>№</th>
          <th>Статус</th>
          <th>Тест</th>
          <th>Файл</th>
          <th class="number">Время выполнения</th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>

    <section class="card conclusion">
      ${status === 'PASSED'
    ? 'Все проверенные модули прошли тестирование. Ошибок выполнения и нарушений ожидаемого поведения не выявлено.'
    : 'В ходе тестирования обнаружены ошибки. Перед фиксацией результата требуется проанализировать тесты со статусом FAIL.'}
    </section>
  </main>
</body>
</html>
`;
}

function getTestFiles() {
  return fs.readdirSync(path.join(rootDir, 'test'))
    .filter((fileName) => fileName.endsWith('.test.js'))
    .map((fileName) => path.join('test', fileName));
}

function runTests() {
  ensureReportsDir();
  const printOnly = process.argv.includes('--print');
  const destination = printOnly ? 'stdout' : junitPath;
  const result = spawnSync(process.execPath, [
    '--test',
    '--test-reporter=junit',
    `--test-reporter-destination=${destination}`,
    ...getTestFiles(),
  ], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (!printOnly && !fs.existsSync(junitPath)) {
    process.exitCode = result.status || 1;
    throw new Error(`JUnit report was not created: ${junitPath}`);
  }

  const xml = printOnly ? result.stdout : fs.readFileSync(junitPath, 'utf8');
  const report = parseJunit(xml);
  const consoleReport = buildConsoleReport(report);

  if (printOnly) {
    process.stdout.write(consoleReport);
  } else {
    fs.writeFileSync(markdownPath, buildMarkdown(report));
    fs.writeFileSync(htmlPath, buildHtml(report));
    fs.writeFileSync(consolePath, consoleReport);

    console.log(`\nTest artifacts created:`);
    console.log(`- ${path.relative(rootDir, junitPath)}`);
    console.log(`- ${path.relative(rootDir, markdownPath)}`);
    console.log(`- ${path.relative(rootDir, htmlPath)}`);
    console.log(`- ${path.relative(rootDir, consolePath)}`);
  }

  process.exitCode = result.status || 0;
}

runTests();
