const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePriorityForStorage,
  normalizePriorityForBoard,
  normalizeTags,
  parsePlanningPayload,
  getTaskComparableState,
  taskStatesEqual,
  parseEntityId,
} = require('../utils/task-utils');

test('normalizes priority values for storage and board output', () => {
  assert.equal(normalizePriorityForStorage('normal'), 'medium');
  assert.equal(normalizePriorityForStorage(' HIGH '), 'high');
  assert.equal(normalizePriorityForStorage('unknown'), 'medium');
  assert.equal(normalizePriorityForBoard('low'), 'Low');
  assert.equal(normalizePriorityForBoard('normal'), 'Medium');
});

test('normalizes tags by trimming empty values and limiting size', () => {
  const tags = [' frontend ', '', null, 'api', ...Array.from({ length: 25 }, (_, index) => `tag-${index}`)];
  const normalized = normalizeTags(tags);

  assert.deepEqual(normalized.slice(0, 2), ['frontend', 'api']);
  assert.equal(normalized.length, 20);
});

test('parses planning payload and rejects invalid values', () => {
  assert.deepEqual(parsePlanningPayload({}), { provided: false });
  assert.deepEqual(parsePlanningPayload({
    plannedDate: '2026-05-25',
    durationWeeks: 1,
    durationDays: 9,
  }), {
    provided: true,
    plannedDate: '2026-05-25',
    durationWeeks: 2,
    durationDays: 2,
  });
  assert.deepEqual(parsePlanningPayload({ plannedDate: '25.05.2026' }), {
    error: 'Некорректный plannedDate. Используйте YYYY-MM-DD',
  });
  assert.deepEqual(parsePlanningPayload({ durationDays: -1 }), {
    error: 'Некорректный durationDays',
  });
});

test('builds stable comparable task state', () => {
  const left = getTaskComparableState({
    title: ' Task ',
    text: null,
    stat: 'To Do',
    priority: 'normal',
    column_id: '2',
    project_id: '5',
    tags: [' bug ', ''],
  });
  const right = getTaskComparableState({
    title: 'Task',
    text: '',
    stat: 'To Do',
    priority: 'medium',
    column_id: 2,
    project_id: 5,
    tags: ['bug'],
  });

  assert.equal(taskStatesEqual(left, right), true);
});

test('parses positive entity ids only', () => {
  assert.equal(parseEntityId('12'), 12);
  assert.equal(parseEntityId(''), null);
  assert.equal(Number.isNaN(parseEntityId('abc')), true);
  assert.equal(Number.isNaN(parseEntityId('-1')), true);
});
